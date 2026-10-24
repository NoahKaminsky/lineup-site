import { NextResponse } from "next/server";
import { findPromoCode, promoDiscountCents } from "@/app/lib/promoCodes";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

// Promo code on a booking payment, entered in the payment sheet before paying.
//
// POST { paymentIntentId, code }        applies the code to the client's own unpaid payment
// POST { paymentIntentId, remove: true } takes it off again
//
// The discount comes out of LineUp's commission (platform_fee_cents); the
// pro's payout fields are left exactly as they were. Any tip stays on top.
const EDITABLE = ["requires_payment_method", "requires_confirmation", "requires_action"];

function summary(intent: { amount: number; currency: string; metadata: Record<string, string> }) {
  const m = intent.metadata || {};
  const tipCents = Number(m.tip_cents || 0);
  const discountCents = Number(m.discount_cents || 0);
  return {
    baseCents: Number(m.base_amount_cents || intent.amount - tipCents + discountCents),
    tipCents,
    discountCents,
    promoCode: m.promo_code || null,
    totalCents: intent.amount,
    currency: intent.currency,
  };
}

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
  if (!EDITABLE.includes(intent.status)) {
    return NextResponse.json({ error: "This payment can't be changed any more." }, { status: 409 });
  }

  const currentDiscount = Number(metadata.discount_cents || 0);
  const platformFeeCents = Number(metadata.platform_fee_cents || 0);

  if (body?.remove) {
    if (!currentDiscount) return NextResponse.json(summary(intent));
    const updated = await stripe.paymentIntents.update(paymentIntentId, {
      amount: intent.amount + currentDiscount,
      metadata: {
        promo_code: "",
        discount_cents: "0",
        platform_fee_cents: String(platformFeeCents + currentDiscount),
      },
    });
    return NextResponse.json(summary(updated));
  }

  const promo = findPromoCode(body?.code);
  if (!promo) {
    return NextResponse.json({ error: "That code isn't valid." }, { status: 400 });
  }
  if (currentDiscount > 0) {
    return NextResponse.json({ error: "A promo code is already applied." }, { status: 409 });
  }

  if (promo.oncePerCustomer) {
    const { data: used, error } = await getServiceSupabase()
      .from("promo_redemptions")
      .select("id")
      .eq("code", promo.code)
      .eq("customer_id", user.id)
      .limit(1);
    if (error) {
      console.error("promo_redemptions lookup failed:", error);
      return NextResponse.json({ error: "Promo codes aren't available right now." }, { status: 503 });
    }
    if (used && used.length > 0) {
      return NextResponse.json({ error: "You've already used this code." }, { status: 409 });
    }
  }

  const tipCents = Number(metadata.tip_cents || 0);
  const baseCents = Number(metadata.base_amount_cents || intent.amount - tipCents);
  const discountCents = promoDiscountCents(promo, baseCents, platformFeeCents);
  if (discountCents <= 0) {
    return NextResponse.json({ error: "This code can't be used on this booking." }, { status: 409 });
  }

  const updated = await stripe.paymentIntents.update(paymentIntentId, {
    amount: baseCents - discountCents + tipCents,
    metadata: {
      promo_code: promo.code,
      discount_cents: String(discountCents),
      platform_fee_cents: String(platformFeeCents - discountCents),
    },
  });

  return NextResponse.json(summary(updated));
}
