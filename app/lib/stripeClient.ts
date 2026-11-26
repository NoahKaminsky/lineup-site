import type { Stripe } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";

// Stripe.js is only fetched the first time a payment or card form opens, not
// on every page that could show one (it keeps sending telemetry for seconds
// after it loads, which slowed /profile and /shop). One shared promise, so it
// loads once per visit.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  return stripePromise;
}
