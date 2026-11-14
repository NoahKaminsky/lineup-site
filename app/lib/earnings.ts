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
import { fetchAll } from "./fetchAll";
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
  | "membership_visit"
  | "booth_rent"
  | "lineup_plan";

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
  // How an online booking came in.
  channel?: "direct" | "request" | "regular";
};

// Something that may keep the numbers from being complete.
export type AttentionItem = {
  date: string;
  proId: string | null;
  proName: string | null;
  item: string;
  issue: string;
};

export type Seller = {
  kind: "pro" | "shop";
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  accountId: string;
  shopName: string | null;
};

export type EarningsResult = { rows: EarningsRow[]; attention: AttentionItem[]; seller: Seller };

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
  source: string | null;
  standing_id: string | null;
};

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, studio_id, booking_date, status, service_name, service_price, payment_status, refund_status, total_amount_cents, platform_fee_cents, studio_cut_cents, professional_payout_cents, gift_card_cents, membership_id, no_show_fee_cents, no_show_status, source, standing_id";

function channelOf(b: BookingRow): EarningsRow["channel"] {
  if (b.source === "request") return "request";
  if (b.standing_id) return "regular";
  return "direct";
}

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
  opts: { today: string; cutPercentFor: (b: BookingRow) => number; attention: AttentionItem[] }
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
    if (b.status === "cancelled") {
      // Refunded, or never charged. A paid one whose refund didn't go
      // through still has the client's money.
      if (b.payment_status === "paid" && b.refund_status && b.refund_status !== "refunded") {
        opts.attention.push({
          date: b.booking_date,
          proId: b.professional_id,
          proName: null,
          item: service,
          issue: "Cancelled, but the refund didn't go through. Contact LineUp support.",
        });
      }
      continue;
    }

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
        channel: channelOf(b),
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
    } else if (b.payment_status === "pay_at_shop" && b.membership_id && b.status !== "cancelled") {
      // A member's visit: paid by their membership, counted when it bills.
      rows.push({
        id: b.id,
        date: b.booking_date,
        type: "membership_visit",
        channel: channelOf(b),
        proId: b.professional_id,
        proName: null,
        client: b.customer_id,
        item: service,
        paidVia: "lineup",
        priceCents: 0,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: 0,
        toShopCents: 0,
        toProCents: 0,
      });
    } else if (b.payment_status === "pay_at_shop" && b.status !== "completed") {
      opts.attention.push({
        date: b.booking_date,
        proId: b.professional_id,
        proName: null,
        item: service,
        issue: "Booked online to pay at the shop, but not marked done or no-show. Not counted.",
      });
    } else if (b.payment_status === "pay_at_shop" && b.status === "completed") {
      const toShop = pct(price, opts.cutPercentFor(b));
      rows.push({
        id: b.id,
        date: b.booking_date,
        type: "pay_at_shop",
        channel: channelOf(b),
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

function shopAppointmentRows(list: ShopAppointmentRow[], today: string, attention: AttentionItem[]): EarningsRow[] {
  const rows: EarningsRow[] = [];
  const label = { walk_in: "Walk-in", phone: "Phone booking", imported: "Imported appointment" } as const;
  for (const a of list) {
    if (a.appointment_date > today) continue;
    const item = `${label[a.kind]}: ${a.service_name || "Appointment"}`;
    if (a.status === "booked") {
      attention.push({
        date: a.appointment_date,
        proId: a.professional_id,
        proName: null,
        item,
        issue: "Not marked done or no-show. Not counted.",
      });
      continue;
    }
    if (a.status !== "completed") continue;
    const price = cents(a.price_cents);
    const tip = cents(a.tip_cents);
    if (!price && !tip) {
      attention.push({ date: a.appointment_date, proId: a.professional_id, proName: null, item, issue: "Marked done with no price." });
      continue;
    }
    if ("paid_with" in a && !a.paid_with) {
      attention.push({
        date: a.appointment_date,
        proId: a.professional_id,
        proName: null,
        item,
        issue: "Counted, but how they paid wasn't recorded.",
      });
    }
    const toShop = Math.min(cents(a.shop_cut_cents), price);
    const paid = a.paid_with;
    rows.push({
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
    });
  }
  return rows;
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

async function fillNames(supabase: ServiceClient, rows: EarningsRow[], customerIds: Set<string>, attention: AttentionItem[] = []) {
  const names = await namesFor(supabase, [...rows.map((r) => r.proId), ...attention.map((a) => a.proId), ...customerIds]);
  for (const a of attention) if (a.proId) a.proName = names.get(a.proId) || "Team member";
  for (const r of rows) {
    if (r.proId) r.proName = names.get(r.proId) || "Team member";
    // Online rows carry the client's profile id until here.
    if (r.client && customerIds.has(r.client)) r.client = names.get(r.client) || "Client";
  }
}

function sortRows(rows: EarningsRow[]) {
  return rows.sort((a, b) => (a.date === b.date ? a.item.localeCompare(b.item) : a.date < b.date ? -1 : 1));
}

// What they paid LineUp for their plan (a business expense).
async function planInvoices(customerId: string | null | undefined, from: string, to: string): Promise<EarningsRow[]> {
  if (!customerId) return [];
  const gte = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) - 86400;
  const lte = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000) + 86400;
  const rows: EarningsRow[] = [];
  try {
    for await (const invoice of stripe.invoices.list({ customer: customerId, status: "paid", created: { gte, lte }, limit: 100 })) {
      const paidAt = invoice.status_transitions?.paid_at || invoice.created;
      const date = localDate(paidAt);
      if (date < from || date > to || !invoice.amount_paid) continue;
      rows.push({
        id: invoice.id || `plan-${paidAt}`,
        date,
        type: "lineup_plan",
        proId: null,
        proName: null,
        client: null,
        item: "LineUp plan",
        paidVia: "lineup",
        priceCents: invoice.amount_paid,
        tipCents: 0,
        giftCents: 0,
        lineupFeeCents: 0,
        toShopCents: 0,
        toProCents: 0,
      });
    }
  } catch (error) {
    console.error(`Earnings: could not list plan invoices for ${customerId}:`, error);
  }
  return rows;
}

function addressOf(...parts: (string | null | undefined)[]) {
  return parts.find((p) => p && p.trim())?.trim() || null;
}

// One pro's own earnings: everything they did, at a shop or on their own.
export async function proEarnings(supabase: ServiceClient, proId: string, from: string, to: string): Promise<EarningsResult> {
  const today = todayLocal();
  const attention: AttentionItem[] = [];

  const [{ data: bookings }, { data: appts }, { data: cards }, { data: memberships }] = await Promise.all([
    fetchAll<BookingRow>((a, b) => supabase.from("bookings").select(BOOKING_COLUMNS).eq("professional_id", proId).gte("booking_date", from).lte("booking_date", to).order("id").range(a, b)).then((data) => ({ data })),
    fetchAll<ShopAppointmentRow>((a, b) => supabase.from("shop_appointments").select("*").eq("professional_id", proId).gte("appointment_date", from).lte("appointment_date", to).order("id").range(a, b)).then((data) => ({ data })),
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
    ...bookingRows(list, { today, cutPercentFor: cutFor, attention }),
    ...shopAppointmentRows((appts || []) as ShopAppointmentRow[], today, attention),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "pro"),
  ];

  const [{ data: profile }, { data: home }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, business_name, email, phone_number, formatted_address, address, city, stripe_customer_id")
      .eq("id", proId)
      .maybeSingle(),
    supabase.from("professional_home_base").select("address, own_address").eq("profile_id", proId).maybeSingle(),
  ]);
  for (const r of await planInvoices(profile?.stripe_customer_id, from, to)) {
    rows.push({ ...r, proId, toProCents: -r.priceCents });
  }
  const activeShop = memberRows.find((m) => m.status === "active");
  const seller: Seller = {
    kind: "pro",
    name: profile?.full_name || "LineUp professional",
    businessName: profile?.business_name || null,
    email: profile?.email || null,
    phone: profile?.phone_number || null,
    address: addressOf(home?.own_address, profile?.formatted_address, profile?.address, home?.address, profile?.city),
    accountId: proId,
    shopName: (studios || []).find((st) => st.id === activeShop?.studio_id)?.name || null,
  };

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

  await fillNames(supabase, rows, new Set(list.map((b) => b.customer_id).filter((id): id is string => !!id)), attention);
  return { rows: sortRows(rows), attention: attention.sort((a, b) => (a.date < b.date ? -1 : 1)), seller };
}

// The whole shop: every pro's sales through the shop, plus the shop's own
// income (its cut, booth rent, memberships, the shop's gift cards).
export async function shopEarnings(supabase: ServiceClient, studio: StudioRow, from: string, to: string): Promise<EarningsResult> {
  const today = todayLocal();
  const attention: AttentionItem[] = [];

  const [{ data: bookings }, { data: appts }, { data: cards }, { data: members }, { data: clientMemberships }, { data: plans }] =
    await Promise.all([
      fetchAll<BookingRow>((a, b) => supabase.from("bookings").select(BOOKING_COLUMNS).eq("studio_id", studio.id).gte("booking_date", from).lte("booking_date", to).order("id").range(a, b)).then((data) => ({ data })),
      fetchAll<ShopAppointmentRow>((a, b) => supabase.from("shop_appointments").select("*").eq("studio_id", studio.id).gte("appointment_date", from).lte("appointment_date", to).order("id").range(a, b)).then((data) => ({ data })),
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
    ...bookingRows(list, { today, cutPercentFor: cutFor, attention }),
    ...shopAppointmentRows((appts || []) as ShopAppointmentRow[], today, attention),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "shop"),
  ];

  for (const r of await planInvoices(studio.stripe_customer_id, from, to)) rows.push({ ...r, toShopCents: -r.priceCents });
  const { data: owner } = await supabase
    .from("profiles")
    .select("full_name, email, phone_number")
    .eq("id", studio.owner_id)
    .maybeSingle();
  const extra = studio as StudioRow & { address?: string | null; area_label?: string | null };
  const seller: Seller = {
    kind: "shop",
    name: studio.name,
    businessName: owner?.full_name ? `Owner: ${owner.full_name}` : null,
    email: owner?.email || null,
    phone: owner?.phone_number || null,
    address: addressOf(extra.address, extra.area_label),
    accountId: studio.id,
    shopName: studio.name,
  };

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

  await fillNames(supabase, rows, customerIds, attention);
  return { rows: sortRows(rows), attention: attention.sort((a, b) => (a.date < b.date ? -1 : 1)), seller };
}
