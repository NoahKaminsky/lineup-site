import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { listPriceCents, repriceBookingIntent } from "@/app/lib/giftCheckout";

// Tip on a booking payment, chosen in the payment sheet before paying.
//
// POST { paymentIntentId, tipPercent }   tipPercent: 0 | 15 | 18 | 20
//   Sets the tip and the new total on the client's own unpaid payment.
// POST { paymentIntentId }               (no tipPercent)
//   Just reports the price, gift card, current tip and total.
//
// The tip is a percentage of the full service price (even when a gift card
// covers part of it) and goes entirely to the pro: LineUp's commission is
// only ever taken from the service price.
const TIP_PERCENTS = [0, 15, 18, 20];

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const paymentIntentId = String(body?.paymentIntentId || "");
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 });
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = (intent.metadata || {}) as Record<string, string>;
  if (metadata.customer_id !== user.id) {
    return NextResponse.json({ error: "Not your payment." }, { status: 403 });
  }

  const list = listPriceCents(metadata, intent.amount);
  const gift = Number(metadata.gift_card_cents || 0);
  const tip = Number(metadata.tip_cents || 0);

  if (body?.tipPercent === undefined || body?.tipPercent === null) {
    return NextResponse.json({
      listCents: list,
      giftCents: gift,
      baseCents: list - gift,
      tipCents: tip,
      totalCents: intent.amount,
      currency: intent.currency,
    });
  }

  const tipPercent = Number(body.tipPercent);
  if (!TIP_PERCENTS.includes(tipPercent)) {
    return NextResponse.json({ error: "Pick a tip option." }, { status: 400 });
  }
  if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
    return NextResponse.json({ error: "This payment can't be changed any more." }, { status: 409 });
  }

  return NextResponse.json(await repriceBookingIntent(intent, { tipPercent }));
}
