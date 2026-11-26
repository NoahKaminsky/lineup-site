// One line under the shop's payout button saying what happens next, so an
// owner never sees "Details needed" without knowing which details.
export function shopPayoutHint(payouts: { connected: boolean; ready: boolean; needs?: string[] } | null | undefined): string {
  if (!payouts?.connected) {
    return "Takes about 5 minutes with Stripe. Until it's set up, the shop's cut waits safely and is sent once you finish.";
  }
  const needs = payouts.needs || [];
  if (needs.length) {
    return `Stripe still needs ${needs.join(", ")}. Tap Finish setup to add ${needs.length === 1 ? "it" : "them"}.`;
  }
  return "Stripe is checking your details. This usually takes a day or two; nothing else is needed from you right now.";
}
