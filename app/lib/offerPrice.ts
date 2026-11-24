// An offer's price as the payment step reads it (same rules as
// parsePriceToCents in app/api/stripe/create-payment-intent): "$55", "55.50",
// "1,200 CAD". Anything else ("55-60", "about 50") can't be charged, so the
// offer form refuses it up front instead of the customer hitting an error at checkout.
export function offerPriceCents(value: string): number | null {
  const cleaned = value.replace(/cad/gi, "").replace(/\$/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export const OFFER_PRICE_HELP = "Enter one price in dollars, like $55 or 55.50.";
