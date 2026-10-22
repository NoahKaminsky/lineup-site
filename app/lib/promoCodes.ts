// Promo codes clients can enter in the payment sheet.
//
// A promo discount always comes out of LineUp's commission, never out of the
// pro's earnings: the pro is paid exactly what they would have been paid
// without the code. Because of that, a discount is capped at LineUp's
// commission on that booking (15% standard, 10% for Master pros), so LineUp
// can give up its cut but never pays out more than the client paid.
//
// To add a code, add an entry here. To switch one off, set active: false.
export type PromoCode = {
  percentOff: number;
  // Each client can only use the code on one booking.
  oncePerCustomer: boolean;
  active: boolean;
};

export const PROMO_CODES: Record<string, PromoCode> = {
  // Instagram/TikTok "pause at the right time" reel, Oct 2026.
  REELS: { percentOff: 15, oncePerCustomer: true, active: true },
};

export function normalizePromoCode(code: unknown) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function findPromoCode(code: unknown) {
  const key = normalizePromoCode(code);
  const promo = PROMO_CODES[key];
  return promo && promo.active ? { code: key, ...promo } : null;
}

// The discount in cents for a service price, never more than LineUp's fee.
export function promoDiscountCents(promo: PromoCode, serviceCents: number, platformFeeCents: number) {
  const discount = Math.round((serviceCents * promo.percentOff) / 100);
  return Math.max(0, Math.min(discount, platformFeeCents));
}
