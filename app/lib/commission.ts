// LineUp's cut of each booking paid through the app. Master pros pay a
// reduced rate while their subscription is live; everyone else pays the
// standard rate. Charged out of the booking price, never added on top.
export const STANDARD_COMMISSION_PERCENT = 15;
export const MASTER_COMMISSION_PERCENT = 10;

// Studio members (a shop on a live Studio plan) pay no LineUp commission on
// their own clients — direct bookings through their calendar or booking link.
// LineUp still has to pay Stripe for the card payment, so that's passed
// through at cost (Stripe's standard Canadian card rate). Bookings that came
// from a client's request still pay the normal commission: that's a new
// client LineUp found for them.
export const STUDIO_CARD_FEE_PERCENT = 2.9;
export const STUDIO_CARD_FEE_FIXED_CENTS = 30;

// Highest cut a shop can take of a member's bookings. Kept below 100% so the
// shop's cut always fits in what's left after LineUp's fee and the deposit
// the pro is paid when the booking is made.
export const STUDIO_MAX_COMMISSION_PERCENT = 70;

export type BookingSource = "request" | "direct_booking";

export function platformFeeCentsFor(params: {
  amountCents: number;
  source: BookingSource;
  inLiveStudio: boolean;
  profile: Parameters<typeof commissionPercentFor>[0];
}) {
  const { amountCents, source, inLiveStudio, profile } = params;
  if (inLiveStudio && source === "direct_booking") {
    const fee = Math.round(amountCents * (STUDIO_CARD_FEE_PERCENT / 100)) + STUDIO_CARD_FEE_FIXED_CENTS;
    return Math.min(fee, amountCents);
  }
  return Math.round(amountCents * (commissionPercentFor(profile) / 100));
}

// How one payment is divided. The shop's cut is a percentage of what's left
// after LineUp's fee, and comes out of the final payout (never the deposit),
// so the deposit paid at booking time works exactly as it does for solo pros.
// Tips are added on later and go entirely to the pro.
export function splitBookingPayment(params: {
  amountCents: number;
  platformFeeCents: number;
  depositPercent: number;
  studioCutPercent: number;
}) {
  const { amountCents, platformFeeCents, depositPercent } = params;
  const cutPercent = Math.min(Math.max(Number(params.studioCutPercent) || 0, 0), STUDIO_MAX_COMMISSION_PERCENT);

  const afterFee = Math.max(amountCents - platformFeeCents, 0);
  const depositAmountCents = Math.min(Math.round(amountCents * (depositPercent / 100)), afterFee);
  const studioCutCents = Math.min(Math.round(afterFee * (cutPercent / 100)), afterFee - depositAmountCents);
  const professionalPayoutCents = afterFee - studioCutCents;
  const remainingPayoutCents = professionalPayoutCents - depositAmountCents;

  return {
    platformFeeCents,
    depositAmountCents,
    studioCutCents,
    professionalPayoutCents,
    remainingPayoutCents,
  };
}

export function commissionPercentFor(profile: {
  subscription_plan?: string | null;
  subscription_status?: string | null;
} | null | undefined) {
  const live = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  return live && profile?.subscription_plan === "master" ? MASTER_COMMISSION_PERCENT : STANDARD_COMMISSION_PERCENT;
}

// Booth rent is a card subscription the pro pays, sent on to the shop.
// LineUp is charged Stripe's fee on it (2.9% + 30¢), so this much of each
// rent payment covers that; 3.2% matches Stripe's fee on a $100 payment
// and covers it fully on anything larger. The shop gets the rest.
export const RENT_PROCESSING_FEE_PERCENT = 3.2;
