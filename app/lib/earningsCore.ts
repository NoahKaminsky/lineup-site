// The one place LineUp works out money for earnings, statements, PDFs and
// analytics. Pure functions only (no database, no Stripe), so every rule
// here is covered by tests in tests/earnings.
//
// Rules (read from app/lib/commission.ts and the payment code, never changed
// here):
//   - LineUp's commission comes out of the price, never on top.
//   - A studio member's own client pays no commission; LineUp's fee on that
//     booking is the card fee (2.9% + 30¢) passed through at cost.
//   - Tips go entirely to the pro.
//   - A gift card is income when it's sold (that's when the money arrives).
//     A booking it pays for shows the covered part as a redemption and never
//     counts it again.
//   - A refunded booking shows the sale and the refund, so it nets to zero
//     but stays traceable.
//   - Imported appointments (moved over from another app) are never money.
//
// Every row balances:
//   price + tip - gift redeemed - LineUp fee - shop cut - refund = to pro (+ to shop for the shop's own income)

import { GIFT_CARD_LINEUP_FEE_CENTS, giftCardFeeCents } from "./giftCards";
import {
  MEMBERSHIP_FEE_PERCENT,
  NO_SHOW_LINEUP_PERCENT,
  RENT_PROCESSING_FEE_PERCENT,
  STUDIO_CARD_FEE_FIXED_CENTS,
  STUDIO_CARD_FEE_PERCENT,
} from "./commission";
import type { ExpenseCategory } from "./expenseCategories";

export type EarningsType =
  | "online"
  | "pay_at_shop"
  | "walk_in"
  | "phone"
  | "imported"
  | "no_show_fee"
  | "gift_card"
  | "membership"
  | "membership_visit"
  | "booth_rent"
  | "lineup_plan"
  | "product"
  | "expense";

export type PaidVia = "lineup" | "cash" | "card" | "etransfer" | "other" | "at_shop";

export type EarningsRow = {
  id: string;
  date: string; // YYYY-MM-DD, shop clock
  type: EarningsType;
  proId: string | null;
  proName: string | null;
  client: string | null;
  item: string;
  paidVia: PaidVia;
  // "lineup": the money went through LineUp (Stripe). "by_hand": someone
  // recorded it (walk-ins, pay at the shop, product sales, expenses).
  source: "lineup" | "by_hand";
  priceCents: number;
  tipCents: number;
  giftCents: number; // part of the price covered by a gift card (a redemption)
  lineupFeeCents: number; // everything LineUp kept, card fee included
  cardFeeCents: number; // the part of lineupFeeCents that is card processing
  toShopCents: number;
  toProCents: number;
  refundCents: number; // given back to the client
  chargebackCents: number; // disputed by the client's bank (informational)
  estimated?: boolean; // shop's share worked out from today's rate
  channel?: "direct" | "request" | "regular";
  entry?: "sale" | "product" | "expense";
  category?: ExpenseCategory;
  gstCents?: number;
};

export type AttentionItem = { date: string; proId: string | null; proName: string | null; item: string; issue: string };

const cents = (value: unknown) => {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? n : 0;
};
export const pct = (amount: number, percent: number) => Math.round((amount * percent) / 100);

// What LineUp keeps on a studio member's own client: the card fee, at cost.
export function studioCardFeeCents(amountCents: number) {
  return Math.min(pct(amountCents, STUDIO_CARD_FEE_PERCENT) + STUDIO_CARD_FEE_FIXED_CENTS, amountCents);
}

function row(partial: Partial<EarningsRow> & Pick<EarningsRow, "id" | "date" | "type" | "item" | "paidVia">): EarningsRow {
  return {
    proId: null,
    proName: null,
    client: null,
    priceCents: 0,
    tipCents: 0,
    giftCents: 0,
    lineupFeeCents: 0,
    cardFeeCents: 0,
    toShopCents: 0,
    toProCents: 0,
    refundCents: 0,
    chargebackCents: 0,
    source: partial.paidVia === "lineup" ? "lineup" : "by_hand",
    ...partial,
  };
}

// ── Bookings made on LineUp ─────────────────────────────────────────────

export type BookingInput = {
  id: string;
  professional_id: string;
  customer_id: string | null;
  studio_id: string | null;
  booking_date: string;
  status: string | null;
  service_name: string | null;
  service_price: number | null; // dollars
  payment_status: string | null;
  refund_status: string | null;
  total_amount_cents: number | null; // what the card was charged (price - gift + tip)
  platform_fee_cents: number | null;
  studio_cut_cents: number | null;
  gift_card_cents: number | null;
  membership_id: string | null;
  no_show_fee_cents: number | null;
  no_show_status: string | null;
  source: string | null;
  standing_id: string | null;
};

export function channelOf(b: Pick<BookingInput, "source" | "standing_id">): EarningsRow["channel"] {
  if (b.source === "request") return "request";
  if (b.standing_id) return "regular";
  return "direct";
}

// The parts of one paid booking, before anything else is decided.
export function bookingAmounts(b: BookingInput) {
  const price = Math.round(Number(b.service_price || 0) * 100);
  const gift = Math.min(cents(b.gift_card_cents), price);
  const charged = cents(b.total_amount_cents);
  // Fully covered by a gift card: nothing charged. Otherwise the card paid
  // price - gift + tip.
  const tip = Math.max(charged - (price - gift), 0);
  const lineupFee = cents(b.platform_fee_cents);
  const shopCut = cents(b.studio_cut_cents);
  // A studio member's own client: LineUp's whole fee is the card fee at cost,
  // worked out (like every booking fee) on what was charged for the service,
  // i.e. after any gift card (see app/lib/giftCheckout.ts).
  const cardFee =
    b.studio_id && b.source !== "request" && lineupFee > 0 && lineupFee === studioCardFeeCents(price - gift) ? lineupFee : 0;
  return { price, gift, charged, tip, lineupFee, shopCut, cardFee };
}

// One booking as earnings rows (none if it isn't money yet).
export function bookingEarnings(
  b: BookingInput,
  opts: { today: string; cutPercent: number }
): { rows: EarningsRow[]; attention: AttentionItem[] } {
  const rows: EarningsRow[] = [];
  const attention: AttentionItem[] = [];
  if (b.booking_date > opts.today) return { rows, attention }; // upcoming: not earned yet
  const service = b.service_name || "Booking";
  const base = { date: b.booking_date, proId: b.professional_id, client: b.customer_id, channel: channelOf(b) };

  if (b.no_show_status === "charged" && cents(b.no_show_fee_cents) > 0) {
    const fee = cents(b.no_show_fee_cents);
    const lineup = pct(fee, NO_SHOW_LINEUP_PERCENT);
    rows.push(row({ ...base, id: `ns-${b.id}`, type: "no_show_fee", item: `No-show fee: ${service}`, paidVia: "lineup", priceCents: fee, lineupFeeCents: lineup, toProCents: fee - lineup }));
    return { rows, attention };
  }

  if (b.status === "cancelled") {
    if (b.payment_status === "paid" && b.refund_status === "refunded") {
      // The sale and its refund, netting to zero.
      const a = bookingAmounts(b);
      rows.push(
        row({
          ...base,
          id: b.id,
          type: "online",
          item: `${service} (cancelled and refunded)`,
          paidVia: "lineup",
          priceCents: a.price,
          tipCents: a.tip,
          giftCents: a.gift,
          refundCents: a.price - a.gift + a.tip,
        })
      );
    } else if (b.payment_status === "paid" && b.refund_status && b.refund_status !== "refunded") {
      attention.push({ date: b.booking_date, proId: b.professional_id, proName: null, item: service, issue: "Cancelled, but the refund didn't go through. Contact LineUp support." });
    }
    return { rows, attention };
  }

  const price = Math.round(Number(b.service_price || 0) * 100);

  if (b.payment_status === "paid") {
    const a = bookingAmounts(b);
    rows.push(
      row({
        ...base,
        id: b.id,
        type: "online",
        item: service,
        paidVia: "lineup",
        priceCents: a.price,
        tipCents: a.tip,
        giftCents: a.gift,
        lineupFeeCents: a.lineupFee,
        cardFeeCents: a.cardFee,
        toShopCents: a.shopCut,
        toProCents: Math.max(a.price + a.tip - a.gift - a.lineupFee - a.shopCut, 0),
      })
    );
  } else if (b.payment_status === "pay_at_shop" && b.membership_id) {
    // A member's visit: paid by their membership, which counts when it bills.
    rows.push(row({ ...base, id: b.id, type: "membership_visit", item: service, paidVia: "lineup" }));
  } else if (b.payment_status === "pay_at_shop" && b.status === "completed") {
    const toShop = pct(price, opts.cutPercent);
    rows.push(
      row({ ...base, id: b.id, type: "pay_at_shop", item: service, paidVia: "at_shop", priceCents: price, toShopCents: toShop, toProCents: price - toShop, estimated: toShop > 0 })
    );
  } else if (b.payment_status === "pay_at_shop") {
    attention.push({ date: b.booking_date, proId: b.professional_id, proName: null, item: service, issue: "Booked online to pay at the shop, but not marked done or no-show. Not counted." });
  }
  return { rows, attention };
}

// ── Walk-ins, phone bookings and imported appointments ──────────────────

export type ShopAppointmentInput = {
  id: string;
  studio_id: string | null;
  professional_id: string;
  kind: "walk_in" | "phone" | "imported";
  client_name: string | null;
  service_name: string | null;
  appointment_date: string;
  price_cents: number | null;
  shop_cut_cents: number | null;
  status: string;
  paid_with?: string | null;
  tip_cents?: number | null;
};

const HAND_PAID = new Set(["cash", "card", "etransfer", "other"]);

export function shopAppointmentEarnings(a: ShopAppointmentInput, today: string): { rows: EarningsRow[]; attention: AttentionItem[] } {
  const rows: EarningsRow[] = [];
  const attention: AttentionItem[] = [];
  // Imported appointments hold time; they were never LineUp money.
  if (a.kind === "imported" || a.appointment_date > today) return { rows, attention };
  const item = `${a.kind === "walk_in" ? "Walk-in" : "Phone booking"}: ${a.service_name || "Appointment"}`;
  if (a.status === "booked") {
    attention.push({ date: a.appointment_date, proId: a.professional_id, proName: null, item, issue: "Not marked done or no-show. Not counted." });
    return { rows, attention };
  }
  if (a.status !== "completed") return { rows, attention };
  const price = cents(a.price_cents);
  const tip = cents(a.tip_cents);
  if (!price && !tip) {
    attention.push({ date: a.appointment_date, proId: a.professional_id, proName: null, item, issue: "Marked done with no price." });
    return { rows, attention };
  }
  if ("paid_with" in a && !a.paid_with) {
    attention.push({ date: a.appointment_date, proId: a.professional_id, proName: null, item, issue: "Counted, but how they paid wasn't recorded." });
  }
  const toShop = Math.min(cents(a.shop_cut_cents), price);
  rows.push(
    row({
      id: a.id,
      date: a.appointment_date,
      type: a.kind,
      ...(a.studio_id ? {} : a.kind === "walk_in" ? { entry: "sale" as const } : {}),
      proId: a.professional_id,
      client: a.client_name,
      item: a.service_name || "Appointment",
      paidVia: a.paid_with && HAND_PAID.has(a.paid_with) ? (a.paid_with as PaidVia) : "at_shop",
      priceCents: price,
      tipCents: tip,
      toShopCents: toShop,
      toProCents: price - toShop + tip,
    })
  );
  return { rows, attention };
}

// ── Gift cards, booth rent, memberships, plans ──────────────────────────

export function giftCardSaleRow(
  g: { id: string; professional_id: string | null; amount_cents: number; buyer_name: string | null; recipient_name: string | null },
  date: string,
  seller: "shop" | "pro"
): EarningsRow {
  const amount = cents(g.amount_cents);
  const fee = Math.min(giftCardFeeCents(amount), amount);
  return row({
    id: `gc-${g.id}`,
    date,
    type: "gift_card",
    proId: seller === "pro" ? g.professional_id : null,
    client: g.buyer_name || g.recipient_name || null,
    item: "Gift card sold",
    paidVia: "lineup",
    priceCents: amount,
    lineupFeeCents: fee,
    // Card processing; the flat part is LineUp's.
    cardFeeCents: Math.max(fee - GIFT_CARD_LINEUP_FEE_CENTS, 0),
    toShopCents: seller === "shop" ? amount - fee : 0,
    toProCents: seller === "pro" ? amount - fee : 0,
  });
}

// Booth rent: income to the shop, a cost to the pro who pays it.
export function boothRentRow(inv: { id: string; date: string; amount: number }, side: "shop" | "pro", proId: string | null): EarningsRow {
  const fee = pct(inv.amount, RENT_PROCESSING_FEE_PERCENT); // card processing
  return row({
    id: inv.id,
    date: inv.date,
    type: "booth_rent",
    proId,
    item: side === "shop" ? "Booth rent" : "Booth rent paid",
    paidVia: "lineup",
    priceCents: inv.amount,
    lineupFeeCents: fee,
    cardFeeCents: fee,
    toShopCents: inv.amount - fee,
    toProCents: side === "pro" ? -inv.amount : 0,
  });
}

export function membershipRow(inv: { id: string; date: string; amount: number }, client: string | null, planName: string | null): EarningsRow {
  const fee = pct(inv.amount, MEMBERSHIP_FEE_PERCENT);
  return row({
    id: inv.id,
    date: inv.date,
    type: "membership",
    client,
    item: planName ? `Membership: ${planName}` : "Membership",
    paidVia: "lineup",
    priceCents: inv.amount,
    lineupFeeCents: fee,
    toShopCents: inv.amount - fee,
  });
}

export function planRow(inv: { id: string; date: string; amount: number }, side: "shop" | "pro", proId: string | null): EarningsRow {
  return row({
    id: inv.id,
    date: inv.date,
    type: "lineup_plan",
    proId,
    item: "LineUp plan",
    paidVia: "lineup",
    priceCents: inv.amount,
    toShopCents: side === "shop" ? -inv.amount : 0,
    toProCents: side === "pro" ? -inv.amount : 0,
  });
}

export function productRow(
  p: { id: string; sale_date: string; item: string; amount_cents: number; paid_with: string | null; professional_id: string | null },
  side: "shop" | "pro",
  proId: string | null
): EarningsRow {
  return row({
    id: `prod-${p.id}`,
    date: p.sale_date,
    type: "product",
    entry: "product",
    proId,
    item: p.item,
    paidVia: p.paid_with && HAND_PAID.has(p.paid_with) ? (p.paid_with as PaidVia) : "at_shop",
    priceCents: p.amount_cents,
    toShopCents: side === "shop" ? p.amount_cents : 0,
    toProCents: side === "pro" ? p.amount_cents : 0,
  });
}

export function expenseRow(
  e: { id: string; expense_date: string; amount_cents: number; gst_cents: number | null },
  category: ExpenseCategory,
  label: string,
  side: "shop" | "pro"
): EarningsRow {
  return row({
    id: `exp-${e.id}`,
    date: e.expense_date,
    type: "expense",
    entry: "expense",
    category,
    gstCents: e.gst_cents || 0,
    item: label,
    paidVia: "other",
    priceCents: e.amount_cents,
    toShopCents: side === "shop" ? -e.amount_cents : 0,
    toProCents: side === "pro" ? -e.amount_cents : 0,
  });
}

// A client's bank disputed a LineUp charge. Shown so it can be traced; it
// only reduces earnings if LineUp takes the money back from the pro.
export function chargebackRow(
  d: { id: string; date: string; amount: number; status: string },
  booking: { id: string; professional_id: string; service_name: string | null }
): EarningsRow {
  return row({
    id: `dp-${d.id}`,
    date: d.date,
    type: "online",
    proId: booking.professional_id,
    item: `Chargeback (${d.status.replace(/_/g, " ")}): ${booking.service_name || "Booking"}`,
    paidVia: "lineup",
    chargebackCents: d.amount,
  });
}

// ── One summary for every screen ────────────────────────────────────────

export type Scope = "me" | "shop";
export const SERVICE_TYPES: EarningsType[] = ["online", "pay_at_shop", "walk_in", "phone"];

export type Summary = {
  grossServiceSales: number; // services, minus any part a gift card covered
  tips: number;
  noShowFees: number;
  giftCardSales: number; // counted when sold
  giftCardRedemptions: number; // shown separately, never counted again
  memberships: number;
  boothRent: number; // received (shop) or paid (pro)
  shopCommission: number; // the shop's cut: taken (shop) or withheld (pro)
  lineupCommission: number;
  cardFees: number;
  refunds: number;
  chargebacks: number; // informational
  recordedByHand: number; // walk-ins, phone, pay at the shop, products: price + tip
  productSales: number;
  expenses: number;
  lineupPlan: number;
  net: number; // equals the sum of toPro (pro) or toShop (shop)
};

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const ofType = (rows: EarningsRow[], ...types: EarningsType[]) => rows.filter((r) => types.includes(r.type));

export function summarize(rows: EarningsRow[], scope: Scope): Summary {
  const services = ofType(rows, ...SERVICE_TYPES);
  // Gift cards count for whoever sold them: the shop's have no pro.
  const giftSales = ofType(rows, "gift_card").filter((r) => (scope === "shop" ? r.proId === null : r.proId !== null));
  const shopIncome = [...ofType(rows, "booth_rent", "membership"), ...giftSales];
  const handRows = rows.filter((r) => r.source === "by_hand" && r.type !== "expense");
  const base = {
    tips: sum(services, (r) => r.tipCents),
    noShowFees: sum(ofType(rows, "no_show_fee"), (r) => r.priceCents),
    giftCardSales: sum(giftSales, (r) => r.priceCents),
    giftCardRedemptions: sum(services, (r) => r.giftCents),
    memberships: sum(ofType(rows, "membership"), (r) => r.priceCents),
    boothRent: sum(ofType(rows, "booth_rent"), (r) => r.priceCents),
    shopCommission: sum(services, (r) => r.toShopCents),
    refunds: sum(rows, (r) => r.refundCents),
    chargebacks: sum(rows, (r) => r.chargebackCents),
    recordedByHand: sum(handRows, (r) => r.priceCents + r.tipCents),
    productSales: sum(ofType(rows, "product"), (r) => r.priceCents),
    expenses: sum(ofType(rows, "expense"), (r) => r.priceCents),
    lineupPlan: sum(ofType(rows, "lineup_plan"), (r) => r.priceCents),
    grossServiceSales: sum(services, (r) => r.priceCents - r.giftCents),
  };
  if (scope === "me") {
    // Every fee LineUp kept on this pro's money. The card fee on booth rent
    // comes out of what the shop receives, not out of the pro's rent.
    const own = rows.filter((r) => r.type !== "booth_rent" && (r.type !== "gift_card" || r.proId !== null));
    const fees = sum(own, (r) => r.lineupFeeCents);
    const card = sum(own, (r) => r.cardFeeCents);
    return { ...base, lineupCommission: fees - card, cardFees: card, net: sum(rows, (r) => r.toProCents) };
  }
  // The shop pays fees only on its own income (rent, memberships, gift cards).
  const fees = sum(shopIncome, (r) => r.lineupFeeCents);
  const card = sum(shopIncome, (r) => r.cardFeeCents);
  return { ...base, lineupCommission: fees - card, cardFees: card, net: sum(rows, (r) => r.toShopCents) };
}

// Analytics: the money side of one visit, worked out with the same rules as
// earnings, but for any visit (upcoming ones too, for "booked" figures).
export type VisitMoney = { sales: number; tip: number; shop: number; take: number };

export function bookingVisitMoney(b: BookingInput, cutPercent: number): VisitMoney {
  if (b.payment_status === "paid") {
    if (b.status === "cancelled" && b.refund_status === "refunded") return { sales: 0, tip: 0, shop: 0, take: 0 };
    const a = bookingAmounts(b);
    // The gift-covered part is still the pro's work, so it counts as sales here.
    return { sales: a.price, tip: a.tip, shop: a.shopCut, take: Math.max(a.price + a.tip - a.lineupFee - a.shopCut, 0) };
  }
  if (b.payment_status === "pay_at_shop" && b.membership_id) return { sales: 0, tip: 0, shop: 0, take: 0 };
  const price = Math.round(Number(b.service_price || 0) * 100);
  const shop = pct(price, cutPercent);
  return { sales: price, tip: 0, shop, take: price - shop };
}

export function shopVisitMoney(a: ShopAppointmentInput): VisitMoney {
  if (a.kind === "imported") return { sales: 0, tip: 0, shop: 0, take: 0 };
  const price = cents(a.price_cents);
  const tip = cents(a.tip_cents);
  const shop = Math.min(cents(a.shop_cut_cents), price);
  return { sales: price, tip, shop, take: price - shop + tip };
}

// ── Where the money is (pros: their share; shops: their cut) ────────────
// 20% of a pro's share is sent to their Stripe account when the booking is
// made; the rest (and the shop's cut) is held until the appointment is done.

export type PayoutBooking = {
  status: string | null;
  payment_status: string | null;
  refund_status: string | null;
  deposit_amount_cents: number | null;
  remaining_payout_cents: number | null;
  studio_cut_cents: number | null;
  stripe_deposit_transfer_id: string | null;
  stripe_final_transfer_id: string | null;
  stripe_studio_transfer_id?: string | null;
  no_show_status?: string | null;
  no_show_fee_cents?: number | null;
  stripe_no_show_transfer_id?: string | null;
};

export function payoutTotals(bookings: PayoutBooking[], scope: Scope) {
  let sent = 0;
  let held = 0;
  let heldAfterDone = 0; // part of held: the appointment is done, the money hasn't gone out
  for (const b of bookings) {
    // A charged no-show fee on a pay-at-the-shop booking: the pro's share
    // goes out as its own transfer.
    if (scope === "me" && b.no_show_status === "charged" && cents(b.no_show_fee_cents) > 0) {
      const share = cents(b.no_show_fee_cents) - pct(cents(b.no_show_fee_cents), NO_SHOW_LINEUP_PERCENT);
      if (b.stripe_no_show_transfer_id) sent += share;
      else held += share;
      continue;
    }
    if (b.payment_status !== "paid") continue;
    // A refunded booking's deposit was taken back; nothing is owed.
    if (b.status === "cancelled") continue;
    const done = b.status === "completed";
    if (scope === "shop") {
      const cut = cents(b.studio_cut_cents);
      if (b.stripe_studio_transfer_id) sent += cut;
      else {
        held += cut;
        if (done) heldAfterDone += cut;
      }
      continue;
    }
    const deposit = cents(b.deposit_amount_cents);
    const rest = cents(b.remaining_payout_cents);
    let owed = 0;
    if (b.stripe_deposit_transfer_id) sent += deposit;
    else owed += deposit; // paid with the rest once their Stripe is set up
    if (b.stripe_final_transfer_id) sent += rest;
    else owed += rest;
    held += owed;
    if (done) heldAfterDone += owed;
  }
  return { sentToStripeCents: sent, heldUntilDoneCents: held, heldAfterDoneCents: heldAfterDone };
}
