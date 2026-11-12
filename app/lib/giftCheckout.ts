// Server only. Re-prices an unpaid booking payment when a gift card is put on
// or taken off, or the tip changes. Everything downstream (deposit, payout,
// shop cut, refunds) reads the payment's metadata, so keeping these numbers
// right here is all it takes.
//
// The card portion was paid to the pro when the card sold, so LineUp's fee
// and the payout are worked out on what's actually charged now. The tip is a
// percentage of the full service price and goes entirely to the pro.

import type Stripe from "stripe";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioPricingForPro } from "@/app/lib/studios";
import { BOOKING_DEPOSIT_PERCENT, platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import { stripe } from "@/app/lib/stripe";

// Stripe's smallest card charge in CAD. A card that covers the whole price
// leaves this much to pay, so every booking still has a real payment behind it.
export const MIN_CHARGE_CENTS = 50;

export function listPriceCents(metadata: Record<string, string>, intentAmount: number) {
  const tip = Number(metadata.tip_cents || 0);
  const gift = Number(metadata.gift_card_cents || 0);
  return Number(metadata.list_price_cents || 0) || Number(metadata.base_amount_cents || 0) + gift || intentAmount - tip + gift;
}

export async function repriceBookingIntent(
  intent: Stripe.PaymentIntent,
  change: { giftCardId?: string | null; giftCents?: number; tipPercent?: number }
) {
  const metadata = (intent.metadata || {}) as Record<string, string>;
  const supabase = getServiceSupabase();
  const professionalId = metadata.professional_id;
  const list = listPriceCents(metadata, intent.amount);

  const giftCents = change.giftCents !== undefined ? change.giftCents : Number(metadata.gift_card_cents || 0);
  const giftCardId = change.giftCardId !== undefined ? change.giftCardId : metadata.gift_card_id || null;
  const tipPercent = change.tipPercent !== undefined ? change.tipPercent : Number(metadata.tip_percent || 0);

  const base = list - giftCents; // the service portion charged now
  const tipCents = Math.round((list * tipPercent) / 100);

  // Same inputs the payment was created with.
  let source: "direct_booking" | "request" = "direct_booking";
  let mode: string | null = metadata.service_mode || null;
  if (metadata.flow_type === "request_offer") {
    source = "request";
    const { data: offer } = await supabase.from("request_offers").select("proposed_service_mode").eq("id", metadata.offer_id).maybeSingle();
    mode = (offer?.proposed_service_mode as string | null) || null;
  }
  const [{ data: pro }, studioPricing] = await Promise.all([
    supabase.from("profiles").select("subscription_plan, subscription_status").eq("id", professionalId).maybeSingle(),
    getStudioPricingForPro(supabase, professionalId, mode),
  ]);

  const split = splitBookingPayment({
    amountCents: base,
    platformFeeCents: platformFeeCentsFor({ amountCents: base, source, inLiveStudio: studioPricing.inLiveStudio, profile: pro }),
    depositPercent: BOOKING_DEPOSIT_PERCENT,
    studioCutPercent: studioPricing.cutPercent,
  });

  const updated = await stripe.paymentIntents.update(intent.id, {
    amount: base + tipCents,
    metadata: {
      list_price_cents: String(list),
      base_amount_cents: String(base),
      gift_card_id: giftCents > 0 && giftCardId ? giftCardId : "",
      gift_card_cents: String(giftCents > 0 ? giftCents : 0),
      tip_cents: String(tipCents),
      tip_percent: String(tipPercent),
      platform_fee_cents: String(split.platformFeeCents),
      studio_cut_cents: String(split.studioCutCents),
      deposit_amount_cents: String(split.depositAmountCents),
      professional_payout_cents: String(split.professionalPayoutCents + tipCents),
      remaining_payout_cents: String(split.remainingPayoutCents + tipCents),
    },
  });

  return {
    listCents: list,
    giftCents: giftCents > 0 ? giftCents : 0,
    baseCents: base,
    tipCents,
    totalCents: updated.amount,
    currency: updated.currency,
  };
}
