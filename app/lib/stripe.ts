import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY env var");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// The only subscription prices anyone may check out with or switch to.
// Without this list, a request could pass any price id from our Stripe
// account (say, a $1 test price) and end up on an "unknown" plan the app
// treated as unlimited.
export function isAllowedSubscriptionPrice(priceId: unknown): priceId is string {
  if (typeof priceId !== "string" || !priceId) return false;
  return [
    process.env.NEXT_PUBLIC_STRIPE_APPRENTICE_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID,
  ].some((allowed) => !!allowed && allowed === priceId);
}
