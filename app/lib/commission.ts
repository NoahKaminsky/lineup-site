// LineUp's cut of each booking paid through the app. Master pros pay a
// reduced rate while their subscription is live; everyone else pays the
// standard rate. Charged out of the booking price, never added on top.
export const STANDARD_COMMISSION_PERCENT = 15;
export const MASTER_COMMISSION_PERCENT = 10;

export function commissionPercentFor(profile: {
  subscription_plan?: string | null;
  subscription_status?: string | null;
} | null | undefined) {
  const live = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  return live && profile?.subscription_plan === "master" ? MASTER_COMMISSION_PERCENT : STANDARD_COMMISSION_PERCENT;
}
