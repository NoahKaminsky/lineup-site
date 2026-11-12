import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { normalizeGiftCode, formatCad } from "@/app/lib/giftCards";
import { MIN_CHARGE_CENTS, listPriceCents, repriceBookingIntent } from "@/app/lib/giftCheckout";

// A gift card on a booking payment, in the payment sheet before paying.
//   POST { paymentIntentId, code }   put the card on (replaces any other)
//   POST { paymentIntentId }         take it off
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
  const giftCents = Math.min(card.balance_cents, list - MIN_CHARGE_CENTS);
  if (giftCents <= 0) return NextResponse.json({ error: "This booking is too small to use a gift card on." }, { status: 409 });

  const summary = await repriceBookingIntent(intent, { giftCardId: card.id, giftCents });
  return NextResponse.json({
    ...summary,
    note:
      giftCents < card.balance_cents
        ? `${formatCad(card.balance_cents - giftCents)} will stay on your card for next time.`
        : null,
  });
}
