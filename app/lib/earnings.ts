// Earnings: every dollar a pro or a shop took in for a period, one line per
// sale, for their own records and their accountant.
//
// Money through LineUp (online bookings, no-show fees, gift cards,
// memberships, booth rent) comes from what LineUp actually charged and paid
// out. Money paid at the shop (walk-ins, phone-ins and "pay at the shop"
// bookings) never touched LineUp, so it's what the front desk recorded.
// Imported appointments (moved over from another app) are left out entirely.
//
// Every line balances:  price + tip - covered by gift card - LineUp fee
//                       = to shop + to pro
// A gift card is income when it's sold (that's when the money arrives), so a
// booking paid with one shows the covered part but doesn't count it again.

import { stripe } from "./stripe";
import { getServiceSupabase } from "./serverSupabase";
import { fetchAll } from "./fetchAll";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expenseCategories";
import { effectiveCutPercent, type StudioMemberRow, type StudioRow } from "./studios";
import {
  bookingEarnings,
  boothRentRow,
  chargebackRow,
  expenseRow,
  giftCardSaleRow,
  membershipRow,
  payoutTotals,
  planRow,
  productRow,
  shopAppointmentEarnings,
  type AttentionItem,
  type BookingInput,
  type EarningsRow,
  type PayoutBooking,
  type ShopAppointmentInput,
} from "./earningsCore";

// The calculations live in ./earningsCore (pure, tested). This file only
// loads the records for a pro or a shop and hands them over.
export type { AttentionItem, EarningsRow, EarningsType, PaidVia } from "./earningsCore";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

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

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, studio_id, booking_date, status, service_name, service_price, payment_status, refund_status, total_amount_cents, platform_fee_cents, studio_cut_cents, gift_card_cents, membership_id, no_show_fee_cents, no_show_status, source, standing_id, stripe_charge_id";

type BookingRow = BookingInput & { stripe_charge_id?: string | null };

type GiftCardRow = {
  id: string;
  professional_id: string | null;
  studio_id: string | null;
  amount_cents: number;
  buyer_name: string | null;
  recipient_name: string | null;
  activated_at: string | null;
};

const padRange = (from: string, to: string) => ({
  gte: Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) - 86400,
  lte: Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000) + 86400,
});

// Paid invoices (a subscription's, or a customer's) in the period.
async function paidInvoices(filter: { subscription: string } | { customer: string }, from: string, to: string) {
  const out: { id: string; date: string; amount: number }[] = [];
  try {
    for await (const invoice of stripe.invoices.list({ ...filter, status: "paid", created: padRange(from, to), limit: 100 })) {
      const paidAt = invoice.status_transitions?.paid_at || invoice.created;
      const date = localDate(paidAt);
      if (date < from || date > to || !invoice.amount_paid) continue;
      out.push({ id: invoice.id || `inv-${paidAt}`, date, amount: invoice.amount_paid });
    }
  } catch (error) {
    console.error("Earnings: could not list invoices:", error);
  }
  return out;
}

// Chargebacks on these bookings' charges, read from Stripe (nothing stored).
async function chargebacks(bookings: BookingRow[], from: string, to: string): Promise<EarningsRow[]> {
  const byCharge = new Map(bookings.filter((b) => b.stripe_charge_id).map((b) => [b.stripe_charge_id as string, b]));
  if (!byCharge.size) return [];
  const rows: EarningsRow[] = [];
  try {
    for await (const d of stripe.disputes.list({ created: padRange(from, to), limit: 100 })) {
      const chargeId = typeof d.charge === "string" ? d.charge : d.charge?.id;
      const b = chargeId ? byCharge.get(chargeId) : undefined;
      if (!b) continue;
      const date = localDate(d.created);
      if (date < from || date > to) continue;
      rows.push(chargebackRow({ id: d.id, date, amount: d.amount, status: d.status }, b));
    }
  } catch (error) {
    console.error("Earnings: could not list disputes:", error);
  }
  return rows;
}

function bookingRows(bookings: BookingRow[], today: string, cutPercentFor: (b: BookingRow) => number, attention: AttentionItem[]) {
  const rows: EarningsRow[] = [];
  for (const b of bookings) {
    const r = bookingEarnings(b, { today, cutPercent: cutPercentFor(b) });
    rows.push(...r.rows);
    attention.push(...r.attention);
  }
  return rows;
}

function shopAppointmentRows(list: ShopAppointmentInput[], today: string, attention: AttentionItem[]) {
  const rows: EarningsRow[] = [];
  for (const a of list) {
    const r = shopAppointmentEarnings(a, today);
    rows.push(...r.rows);
    attention.push(...r.attention);
  }
  return rows;
}

function giftCardRows(cards: GiftCardRow[], from: string, to: string, seller: "shop" | "pro") {
  const rows: EarningsRow[] = [];
  for (const g of cards) {
    if (!g.activated_at) continue;
    const date = localDate(new Date(g.activated_at).getTime() / 1000);
    if (date >= from && date <= to) rows.push(giftCardSaleRow(g, date, seller));
  }
  return rows;
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

async function fillNames(supabase: ServiceClient, rows: EarningsRow[], customerIds: Set<string>, attention: AttentionItem[] = []) {
  const names = await namesFor(supabase, [...rows.map((r) => r.proId), ...attention.map((a) => a.proId), ...customerIds]);
  for (const a of attention) if (a.proId) a.proName = names.get(a.proId) || "Team member";
  for (const r of rows) {
    if (r.proId) r.proName = names.get(r.proId) || "Team member";
    if (r.client && customerIds.has(r.client)) r.client = names.get(r.client) || "Client";
  }
}

function sortRows(rows: EarningsRow[]) {
  return rows.sort((a, b) => (a.date === b.date ? a.item.localeCompare(b.item) : a.date < b.date ? -1 : 1));
}

// Product sales and expenses logged by hand, for a pro (studioId null) or a shop.
async function manualRows(supabase: ServiceClient, who: { proId?: string; studioId?: string }, from: string, to: string): Promise<EarningsRow[]> {
  const rows: EarningsRow[] = [];
  const side = who.studioId ? "shop" : "pro";
  try {
    let pq = supabase.from("product_sales").select("*").gte("sale_date", from).lte("sale_date", to);
    pq = side === "shop" ? pq.eq("studio_id", who.studioId as string) : pq.eq("professional_id", who.proId as string).is("studio_id", null);
    const { data: products } = await pq.limit(5000);
    for (const p of products || []) rows.push(productRow(p, side, side === "shop" ? p.professional_id : who.proId || null));
    let eq = supabase.from("business_expenses").select("*").gte("expense_date", from).lte("expense_date", to);
    eq = side === "shop" ? eq.eq("studio_id", who.studioId as string) : eq.eq("owner_id", who.proId as string).is("studio_id", null);
    const { data: expenses } = await eq.limit(5000);
    for (const e of expenses || []) {
      const category = (e.category in EXPENSE_CATEGORIES ? e.category : "other") as ExpenseCategory;
      const label = e.note ? `${EXPENSE_CATEGORIES[category]}: ${e.note}` : EXPENSE_CATEGORIES[category];
      rows.push(expenseRow(e, category, label, side));
    }
  } catch (error) {
    console.error("Earnings: could not load logged sales and expenses:", error);
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
    fetchAll<ShopAppointmentInput>((a, b) => supabase.from("shop_appointments").select("*").neq("kind", "imported").eq("professional_id", proId).gte("appointment_date", from).lte("appointment_date", to).order("id").range(a, b)).then((data) => ({ data })),
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
    ...bookingRows(list, today, cutFor, attention),
    ...shopAppointmentRows((appts || []) as ShopAppointmentInput[], today, attention),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "pro"),
  ];

  rows.push(...(await manualRows(supabase, { proId }, from, to)));
  rows.push(...(await chargebacks(list, from, to)));

  const [{ data: profile }, { data: home }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, business_name, email, phone_number, formatted_address, address, city, stripe_customer_id")
      .eq("id", proId)
      .maybeSingle(),
    supabase.from("professional_home_base").select("address, own_address").eq("profile_id", proId).maybeSingle(),
  ]);
  if (profile?.stripe_customer_id) {
    for (const inv of await paidInvoices({ customer: profile.stripe_customer_id }, from, to)) rows.push(planRow(inv, "pro", proId));
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
    for (const inv of await paidInvoices({ subscription: m.rent_subscription_id }, from, to)) rows.push(boothRentRow(inv, "pro", proId));
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
      fetchAll<ShopAppointmentInput>((a, b) => supabase.from("shop_appointments").select("*").neq("kind", "imported").eq("studio_id", studio.id).gte("appointment_date", from).lte("appointment_date", to).order("id").range(a, b)).then((data) => ({ data })),
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
    ...bookingRows(list, today, cutFor, attention),
    ...shopAppointmentRows((appts || []) as ShopAppointmentInput[], today, attention),
    ...giftCardRows((cards || []) as GiftCardRow[], from, to, "shop"),
  ];

  if (studio.stripe_customer_id) {
    for (const inv of await paidInvoices({ customer: studio.stripe_customer_id }, from, to)) rows.push(planRow(inv, "shop", null));
  }
  rows.push(...(await manualRows(supabase, { studioId: studio.id }, from, to)));
  rows.push(...(await chargebacks(list, from, to)));
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
    for (const inv of await paidInvoices({ subscription: m.rent_subscription_id }, from, to)) rows.push(boothRentRow(inv, "shop", m.profile_id));
  }

  // Client memberships.
  const customerIds = new Set(list.map((b) => b.customer_id).filter((id): id is string => !!id));
  for (const cm of clientMemberships || []) {
    if (!cm.stripe_subscription_id) continue;
    const plan = (plans || []).find((p) => p.id === cm.plan_id);
    if (cm.customer_id) customerIds.add(cm.customer_id);
    for (const inv of await paidInvoices({ subscription: cm.stripe_subscription_id }, from, to)) rows.push(membershipRow(inv, cm.customer_id, plan?.name || null));
  }

  await fillNames(supabase, rows, customerIds, attention);
  return { rows: sortRows(rows), attention: attention.sort((a, b) => (a.date < b.date ? -1 : 1)), seller };
}

// Where the money is for this pro or shop, for bookings in the period, plus
// what Stripe has paid to their bank (read only, nothing is moved).
export type Payouts = {
  sentToStripeCents: number; // sent to their Stripe account by LineUp
  heldUntilDoneCents: number; // waiting for appointments to be done
  heldAfterDoneCents: number; // part of that: done, but not sent yet
  bank: null | {
    paidCents: number; // arrived in their bank in the period
    scheduledCents: number; // on its way to their bank
    availableCents: number; // in Stripe now, ready for the next payout
    pendingCents: number; // in Stripe now, not yet available
  };
  nextPayout: { date: string; cents: number } | null; // the soonest one on its way
  lastPayout: { date: string; cents: number } | null; // the most recent one that arrived
  // "none": no Stripe account yet; "incomplete": set up started, payouts off.
  stripe: "ready" | "incomplete" | "none";
};

export async function payoutsFor(
  supabase: ServiceClient,
  who: { proId: string } | { studio: StudioRow },
  from: string,
  to: string
): Promise<Payouts> {
  const shop = "studio" in who;
  const cols =
    "status, payment_status, refund_status, deposit_amount_cents, remaining_payout_cents, studio_cut_cents, stripe_deposit_transfer_id, stripe_final_transfer_id, stripe_studio_transfer_id, no_show_status, no_show_fee_cents, stripe_no_show_transfer_id";
  const bookings = await fetchAll<PayoutBooking>((a, b) => {
    let q = supabase.from("bookings").select(cols).in("payment_status", ["paid", "pay_at_shop"]).gte("booking_date", from).lte("booking_date", to);
    q = shop ? q.eq("studio_id", who.studio.id) : q.eq("professional_id", who.proId);
    return q.order("id").range(a, b);
  });
  const totals = payoutTotals(bookings, shop ? "shop" : "me");

  let account: string | null = null;
  if (shop) account = (who.studio as StudioRow & { stripe_account_id?: string | null }).stripe_account_id || null;
  else {
    const { data } = await supabase.from("profiles").select("stripe_account_id").eq("id", who.proId).maybeSingle();
    account = data?.stripe_account_id || null;
  }
  if (!account) return { ...totals, bank: null, nextPayout: null, lastPayout: null, stripe: "none" };

  try {
    const bank = { paidCents: 0, scheduledCents: 0, availableCents: 0, pendingCents: 0 };
    for await (const p of stripe.payouts.list({ arrival_date: padRange(from, to), limit: 100 }, { stripeAccount: account })) {
      if (p.currency !== "cad") continue;
      if (p.status === "paid") bank.paidCents += p.amount;
      else if (p.status === "pending" || p.status === "in_transit") bank.scheduledCents += p.amount;
    }
    const balance = await stripe.balance.retrieve({}, { stripeAccount: account });
    bank.availableCents = balance.available.filter((b) => b.currency === "cad").reduce((s, b) => s + b.amount, 0);
    bank.pendingCents = balance.pending.filter((b) => b.currency === "cad").reduce((s, b) => s + b.amount, 0);

    // Next and last payout, whenever they are (not just in this period).
    let nextPayout: Payouts["nextPayout"] = null;
    let lastPayout: Payouts["lastPayout"] = null;
    for await (const p of stripe.payouts.list({ limit: 20 }, { stripeAccount: account })) {
      if (p.currency !== "cad") continue;
      const date = localDate(p.arrival_date);
      if ((p.status === "pending" || p.status === "in_transit") && (!nextPayout || date < nextPayout.date)) nextPayout = { date, cents: p.amount };
      if (p.status === "paid" && (!lastPayout || date > lastPayout.date)) lastPayout = { date, cents: p.amount };
    }
    const acct = await stripe.accounts.retrieve(account);
    return { ...totals, bank, nextPayout, lastPayout, stripe: acct.payouts_enabled ? "ready" : "incomplete" };
  } catch (error) {
    console.error("Earnings: could not read Stripe payouts:", error);
    return { ...totals, bank: null, nextPayout: null, lastPayout: null, stripe: "incomplete" };
  }
}
