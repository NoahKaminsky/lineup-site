// Earnings: every dollar a pro or a shop took in for a period, one line per
// sale, for their own records and their accountant.
//
// Money through LineUp (online bookings, no-show fees, gift cards,
// memberships, booth rent) comes from what LineUp actually charged and paid
// out. Money paid at the shop (walk-ins, phone-ins, imported appointments and
// "pay at the shop" bookings) never touched LineUp, so it's what the front
// desk recorded.
//
// Every line balances:  price + tip - covered by gift card - LineUp fee
//                       = to shop + to pro
// A gift card is income when it's sold (that's when the money arrives), so a
// booking paid with one shows the covered part but doesn't count it again.

import { stripe } from "./stripe";
import { getServiceSupabase } from "./serverSupabase";
import { giftCardFeeCents } from "./giftCards";
import { MEMBERSHIP_FEE_PERCENT, NO_SHOW_LINEUP_PERCENT, RENT_PROCESSING_FEE_PERCENT } from "./commission";
import { effectiveCutPercent, type StudioMemberRow, type StudioRow } from "./studios";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export type EarningsType =
  | "online"
  | "pay_at_shop"
  | "walk_in"
  | "phone"
  | "imported"
  | "no_show_fee"
  | "gift_card"
  | "membership"
  | "booth_rent";

export type PaidVia = "lineup" | "cash" | "card" | "etransfer" | "other" | "at_shop";

export type EarningsRow = {
  id: string;
  date: string; // YYYY-MM-DD, local
  type: EarningsType;
  proId: string | null;
  proName: string | null;
  client: string | null;
  item: string;
  paidVia: PaidVia;
  priceCents: number;
  tipCents: number;
  giftCents: number;
  lineupFeeCents: number;
  toShopCents: number;
  toProCents: number;
  // Shop's share worked out from today's commission rate, not recorded at the time.
  estimated?: boolean;
};

export const TIME_ZONE = "America/Winnipeg";

export function localDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

export function todayLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

function cents(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? n : 0;
}

const pct = (amount: number, percent: number) => Math.round((amount * percent) / 100);

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string | null;
  studio_id: string | null;
  booking_date: string;
  status: string | null;
  service_name: string | null;
  service_price: number | null;
  payment_status: string | null;
  refund_status: string | null;
  total_amount_cents: number | null;
  platform_fee_cents: number | null;
  studio_cut_cents: number | null;
  professional_payout_cents: number | null;
  gift_card_cents: number | null;
  membership_id: string | null;
  no_show_fee_cents: number | null;
  no_show_status: string | null;
};

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, studio_id, booking_date, status, service_name, service_price, payment_status, refund_status, total_amount_cents, platform_fee_cents, studio_cut_cents, professional_payout_cents, gift_card_cents, membership_id, no_show_fee_cents, no_show_status";

type ShopAppointmentRow = {
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

type GiftCardRow = {
  id: string;
  professional_id: string | null;
  studio_id: string | null;
  amount_cents: number;
  buyer_name: string | null;
  recipient_name: string | null;
  activated_at: string | null;
};

// Paid invoices of one Stripe subscription in the period.
async function paidInvoices(subscriptionId: string, from: string, to: string) {
  // Pad a day each side for time zones, then filter on the local date.
  const gte = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) - 86400;
  const lte = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000) + 86400;
  const out: { id: string; date: string; amount: number }[] = [];
  try {
    for await (const invoice of stripe.invoices.list({
      subscription: subscriptionId,
      status: "paid",
      created: { gte, lte },
      limit: 100,
    })) {
      const paidAt = invoice.status_transitions?.paid_at || invoice.created;
      const date = localDate(paidAt);
      if (date < from || date > to || !invoice.amount_paid) continue;
      out.push({ id: invoice.id || `${subscriptionId}-${paidAt}`, date, amount: invoice.amount_paid });
    }
  } catch (error) {
    console.error(`Earnings: could not list invoices for ${subscriptionId}:`, error);
  }
  return out;
}

async function namesFor(supabase: ServiceClient, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await supabase.from("profiles").select("id, full_name, business_name").in("id", unique.slice(i, i + 200));
    for (const p of data || []) names.set(p.id, p.full_name || p.business_name || "");
  }
  return names;
}

function bookingRows(
  bookings: BookingRow[],
  opts: { today: string; cutPercentFor: (b: BookingRow) => number }
): EarningsRow[] {
  const rows: EarningsRow[] = [];
  for (const b of bookings) {
    if (b.booking_date > opts.today) continue; // upcoming: not earned yet
    const service = b.service_name || "Booking";

    if (b.no_show_status === "charged" && cents(b.no_show_fee_cents) > 0) {
      const fee = cents(b.no_show_fee_cents);
      const lineup = pct(fee, NO_SHOW_LINEUP_PERCENT);
      rows.push({
        id: `ns-${b.id}`,
        date: b.booking_date,
        type: "no_show_fee",
        proId: b.professional_id,
        proName: null,
        client: b.customer_id,
        item: `No-show fee: ${service}`,
        paidVia: "lineup",
        priceCents: fee,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: lineup,
        toShopCents: 0,
        toProCents: fee - lineup,
      });
      continue;
    }
    if (b.status === "cancelled") continue; // refunded or never charged

    const price = Math.round(Number(b.service_price || 0) * 100);

    if (b.payment_status === "paid") {
      const gift = cents(b.gift_card_cents);
      const total = cents(b.total_amount_cents);
      const lineup = cents(b.platform_fee_cents);
      const toShop = cents(b.studio_cut_cents);
      // A booking fully covered by a gift card charged nothing; everything
      // else charged price - gift + tip.
      const tip = Math.max(total - (price - gift), 0);
      const toPro = Math.max(price + tip - gift - lineup - toShop, 0);
      rows.push({
        id: b.id,
        date: b.booking_date,
        type: "online",
        proId: b.professional_id,
        proName: null,
        client: b.customer_id,
        item: service,
        paidVia: "lineup",
        priceCents: price,
        tipCents: tip,
        giftCents: gift,
        lineupFeeCents: lineup,
        toShopCents: toShop,
        toProCents: toPro,
      });
    } else if (b.payment_status === "pay_at_shop" && b.status === "completed" && !b.membership_id) {
      const toShop = pct(price, opts.cutPercentFor(b));
      rows.push({
        id: b.id,
        date: b.booking_date,
        type: "pay_at_shop",
        proId: b.professional_id,
        proName: null,
        client: b.customer_id,
        item: service,
        paidVia: "at_shop",
        priceCents: price,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: 0,
        toShopCents: toShop,
        toProCents: price - toShop,
        estimated: toShop > 0,
      });
    }
  }
  return rows;
}

function shopAppointmentRows(list: ShopAppointmentRow[], today: string): EarningsRow[] {
  return list
    .filter((a) => a.status === "completed" && a.appointment_date <= today && (cents(a.price_cents) > 0 || cents(a.tip_cents) > 0))
    .map((a) => {
      const price = cents(a.price_cents);
      const tip = cents(a.tip_cents);
      const toShop = Math.min(cents(a.shop_cut_cents), price);
      const paid = a.paid_with;
      return {
        id: a.id,
        date: a.appointment_date,
        type: a.kind,
        proId: a.professional_id,
        proName: null,
        client: a.client_name,
        item: a.service_name || "Appointment",
        paidVia: paid === "cash" || paid === "card" || paid === "etransfer" || paid === "other" ? paid : "at_shop",
        priceCents: price,
        tipCents: tip,
        giftCents: 0,
        lineupFeeCents: 0,
        toShopCents: toShop,
        toProCents: price - toShop + tip,
      } satisfies EarningsRow;
    });
}

function giftCardRows(cards: GiftCardRow[], from: string, to: string, seller: "shop" | "pro"): EarningsRow[] {
  const rows: EarningsRow[] = [];
  for (const g of cards) {
    if (!g.activated_at) continue;
    const date = localDate(new Date(g.activated_at).getTime() / 1000);
    if (date < from || date > to) continue;
    const amount = cents(g.amount_cents);
    const fee = Math.min(giftCardFeeCents(amount), amount);
    rows.push({
      id: `gc-${g.id}`,
      date,
      type: "gift_card",
      proId: seller === "pro" ? g.professional_id : null,
      proName: null,
      client: g.buyer_name || g.recipient_name || null,
      item: "Gift card sold",
      paidVia: "lineup",
      priceCents: amount,
      tipCents: 0,
      giftCents: 0,
      lineupFeeCents: fee,
      toShopCents: seller === "shop" ? amount - fee : 0,
      toProCents: seller === "pro" ? amount - fee : 0,
    });
  }
  return rows;
}

async function fillNames(supabase: ServiceClient, rows: EarningsRow[], customerIds: Set<string>) {
  const names = await namesFor(supabase, [...rows.map((r) => r.proId), ...customerIds]);
  for (const r of rows) {
    if (r.proId) r.proName = names.get(r.proId) || "Team member";
    // Online rows carry the client's profile id until here.
    if (r.client && customerIds.has(r.client)) r.client = names.get(r.client) || "Client";
  }
}

function sortRows(rows: EarningsRow[]) {
  return rows.sort((a, b) => (a.date === b.date ? a.item.localeCompare(b.item) : a.date < b.date ? -1 : 1));
}

// One pro's own earnings: everything they did, at a shop or on their own.
export async function proEarnings(supabase: ServiceClient, proId: string, from: string, to: string) {
  const today = todayLocal();

  const [{ data: bookings }, { data: appts }, { data: cards }, { data: memberships }] = await Promise.all([
    supabase.from("bookings").select(BOOKING_COLUMNS).eq("professional_id", proId).gte("booking_date", from).lte("booking_date", to),
    supabase.from("shop_appointments").select("*").eq("professional_id", proId).gte("appointment_date", from).lte("appointment_date", to),
    supabase
      .from("gift_cards")
      .select("id, professional_id, studio_id, amount_cents, buyer_name, recipient_name, activated_at")
      .eq("professional_id", proId)
      .not("activated_at", "is", null),
    supabase.from("studio_members").select("*").eq("profile_id", proId),
  ]);

  // Shop terms, to estimate a shop's cut on pay-at-shop bookings.
  const memberRows = (memberships || []) as StudioMemberRow[];
  const studioIds = [...new Set(memberRows.map((m) => m.studio_id))];
  const { data: studios } = studioIds.length
    ? await supabase.from("studios").select("*").in("id", studioIds)
    : { data: [] as StudioRow[] };
  const cutFor = (b: BookingRow) => {
    const studio = (studios || []).find((s) => s.id === b.studio_id) as StudioRow | undefined;
    const member = memberRows.find((m) => m.studio_id === b.studio_id) || null;
    return studio ? effectiveCutPercent(studio, member) : 0;
  };

  const list = (bookings || []) as BookingRow[];
  const rows: EarningsRow[] = [
    ...bookingRows(list, { today, cutPercentFor: cutFor }),
    ...shopAppointmentRows((appts || []) as ShopAppointmentRow[], today),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "pro"),
  ];

  // Booth rent this pro paid: a cost to them, income to the shop.
  for (const m of memberRows) {
    if (!m.rent_subscription_id) continue;
    for (const inv of await paidInvoices(m.rent_subscription_id, from, to)) {
      const fee = pct(inv.amount, RENT_PROCESSING_FEE_PERCENT);
      rows.push({
        id: inv.id,
        date: inv.date,
        type: "booth_rent",
        proId,
        proName: null,
        client: null,
        item: "Booth rent paid",
        paidVia: "lineup",
        priceCents: inv.amount,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: fee,
        toShopCents: inv.amount - fee,
        toProCents: -inv.amount,
      });
    }
  }

  await fillNames(supabase, rows, new Set(list.map((b) => b.customer_id).filter((id): id is string => !!id)));
  return sortRows(rows);
}

// The whole shop: every pro's sales through the shop, plus the shop's own
// income (its cut, booth rent, memberships, the shop's gift cards).
export async function shopEarnings(supabase: ServiceClient, studio: StudioRow, from: string, to: string) {
  const today = todayLocal();

  const [{ data: bookings }, { data: appts }, { data: cards }, { data: members }, { data: clientMemberships }, { data: plans }] =
    await Promise.all([
      supabase.from("bookings").select(BOOKING_COLUMNS).eq("studio_id", studio.id).gte("booking_date", from).lte("booking_date", to),
      supabase.from("shop_appointments").select("*").eq("studio_id", studio.id).gte("appointment_date", from).lte("appointment_date", to),
      supabase
        .from("gift_cards")
        .select("id, professional_id, studio_id, amount_cents, buyer_name, recipient_name, activated_at")
        .eq("studio_id", studio.id)
        .not("activated_at", "is", null),
      supabase.from("studio_members").select("*").eq("studio_id", studio.id),
      supabase.from("client_memberships").select("id, plan_id, customer_id, stripe_subscription_id").eq("studio_id", studio.id),
      supabase.from("membership_plans").select("id, name").eq("studio_id", studio.id),
    ]);

  const memberRows = (members || []) as StudioMemberRow[];
  const cutFor = (b: BookingRow) => effectiveCutPercent(studio, memberRows.find((m) => m.profile_id === b.professional_id) || null);

  const list = (bookings || []) as BookingRow[];
  const rows: EarningsRow[] = [
    ...bookingRows(list, { today, cutPercentFor: cutFor }),
    ...shopAppointmentRows((appts || []) as ShopAppointmentRow[], today),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "shop"),
  ];

  // Booth rent from each renter.
  for (const m of memberRows) {
    if (!m.rent_subscription_id) continue;
    for (const inv of await paidInvoices(m.rent_subscription_id, from, to)) {
      const fee = pct(inv.amount, RENT_PROCESSING_FEE_PERCENT);
      rows.push({
        id: inv.id,
        date: inv.date,
        type: "booth_rent",
        proId: m.profile_id,
        proName: null,
        client: null,
        item: "Booth rent",
        paidVia: "lineup",
        priceCents: inv.amount,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: fee,
        toShopCents: inv.amount - fee,
        toProCents: 0,
      });
    }
  }

  // Client memberships.
  const customerIds = new Set(list.map((b) => b.customer_id).filter((id): id is string => !!id));
  for (const cm of clientMemberships || []) {
    if (!cm.stripe_subscription_id) continue;
    const plan = (plans || []).find((p) => p.id === cm.plan_id);
    for (const inv of await paidInvoices(cm.stripe_subscription_id, from, to)) {
      const fee = pct(inv.amount, MEMBERSHIP_FEE_PERCENT);
      if (cm.customer_id) customerIds.add(cm.customer_id);
      rows.push({
        id: inv.id,
        date: inv.date,
        type: "membership",
        proId: null,
        proName: null,
        client: cm.customer_id,
        item: plan?.name ? `Membership: ${plan.name}` : "Membership",
        paidVia: "lineup",
        priceCents: inv.amount,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: fee,
        toShopCents: inv.amount - fee,
        toProCents: 0,
      });
    }
  }

  await fillNames(supabase, rows, customerIds);
  return sortRows(rows);
}
