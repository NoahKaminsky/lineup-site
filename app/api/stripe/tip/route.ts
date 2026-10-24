import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

// Tip on a booking payment, chosen in the payment sheet before paying.
//
// POST { paymentIntentId, tipPercent }   tipPercent: 0 | 15 | 18 | 20
//   Sets the tip and the new total on the client's own unpaid payment.
// POST { paymentIntentId }               (no tipPercent)
//   Just reports the price, current tip and total.
//
// The tip goes entirely to the pro: LineUp's commission is only ever taken
// from the service price, and the tip is added to the pro's payout.
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
  const metadata = intent.metadata || {};
  if (metadata.customer_id !== user.id) {
    return NextResponse.json({ error: "Not your payment." }, { status: 403 });
  }

  const currentTip = Number(metadata.tip_cents || 0);
  // A promo code (see /api/stripe/promo) lowers what the client pays for the
  // service; the tip is still worked out on the full service price.
  const discountCents = Number(metadata.discount_cents || 0);
  const promoCode = metadata.promo_code || null;
  const baseCents = Number(metadata.base_amount_cents || intent.amount - currentTip + discountCents);

  if (body?.tipPercent === undefined || body?.tipPercent === null) {
    return NextResponse.json({
      baseCents,
      tipCents: currentTip,
      discountCents,
      promoCode,
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

  const tipCents = Math.round((baseCents * tipPercent) / 100);
  // Payout fields without the old tip, then with the new one.
  const payoutBase = Number(metadata.professional_payout_cents || 0) - currentTip;
  const remainingBase = Number(metadata.remaining_payout_cents || 0) - currentTip;

  const updated = await stripe.paymentIntents.update(paymentIntentId, {
    amount: baseCents - discountCents + tipCents,
    metadata: {
      tip_cents: String(tipCents),
      tip_percent: String(tipPercent),
      professional_payout_cents: String(payoutBase + tipCents),
      remaining_payout_cents: String(remainingBase + tipCents),
    },
  });

  return NextResponse.json({
    baseCents,
    tipCents,
    discountCents,
    promoCode,
    totalCents: updated.amount,
    currency: updated.currency,
  });
}
