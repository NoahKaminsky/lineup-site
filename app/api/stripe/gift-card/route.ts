import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { normalizeGiftCode, formatCad } from "@/app/lib/giftCards";
import { listPriceCents, repriceBookingIntent } from "@/app/lib/giftCheckout";
import { bookFromPaymentIntent } from "@/app/lib/paymentBookings";

// A gift card on a booking payment, in the payment sheet before paying.
//   POST { paymentIntentId, code }   put the card on (replaces any other)
//   POST { paymentIntentId }         take it off
//   POST { paymentIntentId, action: "complete" }
//        the card covers everything: book it with no card payment
// Only a card bought for this pro works here. (A shop's cards were paid to
// the shop, so they're taken off at the shop, not online.) The card isn't
// drawn down until the payment succeeds.

const CHANGEABLE = ["requires_payment_method", "requires_confirmation", "requires_action"];

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const paymentIntentId = String(body?.paymentIntentId || "");
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return NextResponse.json({ error: "Missing payment." }, { status: 400 });

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = (intent.metadata || {}) as Record<string, string>;
  if (metadata.customer_id !== user.id) return NextResponse.json({ error: "Not your payment." }, { status: 403 });
  if (!["direct_booking", "request_offer"].includes(metadata.flow_type)) {
    return NextResponse.json({ error: "Gift cards can't be used on this payment." }, { status: 400 });
  }
  if (!CHANGEABLE.includes(intent.status)) return NextResponse.json({ error: "This payment can't be changed any more." }, { status: 409 });

  // Fully covered: cancel the unused card payment and make the booking.
  if (body?.action === "complete") {
    const list = listPriceCents(metadata, intent.amount);
    if (metadata.gift_only !== "1" || Number(metadata.gift_card_cents || 0) !== list || Number(metadata.tip_cents || 0) !== 0) {
      return NextResponse.json({ error: "There's still something to pay on this booking." }, { status: 409 });
    }
    const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);
    try {
      await bookFromPaymentIntent({ ...cancelled, metadata, amount: 0, amount_received: 0, latest_charge: null });
    } catch (error) {
      console.error("Gift-card-only booking failed:", error);
      return NextResponse.json({ error: "Couldn't make the booking. Your gift card wasn't used." }, { status: 500 });
    }
    const { data: booking } = await getServiceSupabase()
      .from("bookings")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: "That time was just taken. Your gift card wasn't used." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, bookingId: booking.id });
  }

  // Taking it off.
  if (!body?.code) {
    const summary = await repriceBookingIntent(intent, { giftCardId: null, giftCents: 0 });
    return NextResponse.json(summary);
  }

  const code = normalizeGiftCode(String(body.code));
  if (!code) return NextResponse.json({ error: "That doesn't look like a LineUp gift card code." }, { status: 400 });

  const { data: card } = await getServiceSupabase()
    .from("gift_cards")
    .select("id, professional_id, studio_id, balance_cents, status")
    .eq("code", code)
    .maybeSingle();
  if (!card || card.status !== "active") return NextResponse.json({ error: "We couldn't find an active gift card with that code." }, { status: 404 });
  if (card.professional_id !== metadata.professional_id) {
    return NextResponse.json(
      {
        error: card.studio_id
          ? "This is a shop gift card. Show the code at the shop and they'll take it off there."
          : "This gift card is for a different pro.",
      },
      { status: 409 }
    );
  }
  if (card.balance_cents <= 0) return NextResponse.json({ error: "There's nothing left on this gift card." }, { status: 409 });

  const list = listPriceCents(metadata, intent.amount);
  let giftCents = Math.min(card.balance_cents, list);
  // Leaving under 50c to pay isn't possible on a card: use a bit less of the
  // gift card so the rest is a real charge.
  const leftToPay = list - giftCents + Number(metadata.tip_cents || 0);
  if (leftToPay > 0 && leftToPay < 50) giftCents -= 50 - leftToPay;
  if (giftCents <= 0) return NextResponse.json({ error: "This booking is too small to use a gift card on." }, { status: 409 });

  let summary;
  try {
    summary = await repriceBookingIntent(intent, { giftCardId: card.id, giftCents });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't use that gift card." }, { status: 409 });
  }
  return NextResponse.json({
    ...summary,
    note:
      giftCents < card.balance_cents
        ? `${formatCad(card.balance_cents - giftCents)} will stay on your card for next time.`
        : null,
  });
}
