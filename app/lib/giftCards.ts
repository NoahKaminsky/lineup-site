// Gift cards: shared rules (safe to import anywhere).
//
// A card is for one pro or one shop. The buyer pays the card's value and
// nothing more (Manitoba's Consumer Protection Act bans fees charged to the
// holder of a gift card, other than for replacing or customizing one). The
// money goes straight to the pro's or shop's Stripe account, less card
// processing and LineUp's flat fee, both taken from the seller's side.
// Cards never expire (also the law in Manitoba).

export const GIFT_CARD_AMOUNTS_CENTS = [2500, 5000, 7500, 10000, 15000];
export const GIFT_CARD_MIN_CENTS = 1000;
export const GIFT_CARD_MAX_CENTS = 50000;

// Seller side: card processing (same rate as booth rent) plus LineUp's flat fee.
export const GIFT_CARD_PROCESSING_PERCENT = 3.2;
export const GIFT_CARD_LINEUP_FEE_CENTS = 100;

export function giftCardFeeCents(amountCents: number) {
  return Math.round((amountCents * GIFT_CARD_PROCESSING_PERCENT) / 100) + GIFT_CARD_LINEUP_FEE_CENTS;
}

export function formatCad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

// Codes people read off a phone and type in: no 0/O or 1/I/L.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function normalizeGiftCode(raw: string) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^LU/, "");
  return clean.length === 12 ? `LU-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}` : null;
}

export function newGiftCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // 31^12 ≈ 7.9e17 codes, so guessing one isn't practical.
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `LU-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}
