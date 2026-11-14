// Analytics for a pro or a whole shop, worked out from real records: every
// booking (online, requests, regulars, pay at the shop, membership visits) and
// every front-desk appointment (walk-ins, phone, imported).
//
// The point is to answer the questions that make money: is the business
// growing, who is overdue to come back, which hours sit empty, which services
// and which pros earn the most per hour, and what's already on the books.

import { getServiceSupabase } from "./serverSupabase";
import { todayLocal } from "./earnings";
import { fetchAll } from "./fetchAll";
import { effectiveCutPercent, type StudioMemberRow, type StudioRow } from "./studios";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export type RangeDays = 30 | 90 | 365;
export type Pair = { now: number; prev: number };
export type Channel = "online" | "request" | "regular" | "pay_at_shop" | "membership" | "walk_in" | "phone" | "imported";

export type TeamRow = {
  id: string;
  name: string;
  sales: number;
  tips: number;
  visits: number;
  avgTicket: number;
  tipRate: number;
  rebookRate: number | null;
  utilization: number | null;
  lostRate: number;
  newClients: number;
  shopCents: number;
  salesPerHour: number;
};

export type Insight = { tone: "good" | "warn" | "info"; title: string; body: string };

export type AnalyticsSummary = {
  scope: "me" | "shop";
  name: string | null;
  locked: boolean; // basic plan: headline numbers and the trend only
  empty: boolean;
  range: { days: RangeDays; from: string; to: string; label: string };
  kpis: {
    sales: Pair;
    take: Pair;
    visits: Pair;
    avgTicket: Pair;
    tipRate: Pair;
    newClients: Pair;
    lostRate: Pair;
    utilization: { now: number | null; prev: number | null };
    rebookRate: number | null;
    retention: { rate: number | null; came: number; of: number };
  };
  trend: { label: string; sales: number; visits: number; prevSales: number }[];
  onTheBooks: { sales: number; visits: number; regulars: number; next7Visits: number };
  clients: {
    active: number;
    fresh: number;
    returning: number;
    top: { name: string; visits: number; spend: number; last: string }[];
    atRisk: { name: string; last: string; daysSince: number; usualGap: number | null; visits: number; spend: number; avgTicket: number; proName: string | null; bookingId: string | null }[];
    atRiskCount: number;
    atRiskValue: number;
  };
  schedule: {
    byDay: { dow: number; bookedMin: number; availMin: number; visits: number; sales: number }[];
    heat: number[][]; // [dow][hour - hourStart]
    hourStart: number;
    availHoursPerWeek: number | null;
    bookedHoursPerWeek: number;
    salesPerHour: number;
    tenPointValue: number | null; // weekly sales from filling 10 more points of open time
    leadDays: number | null;
  };
  services: { name: string; count: number; sales: number; avg: number; perHour: number }[];
  channels: { key: Channel; label: string; count: number; sales: number }[];
  outcomes: { done: number; cancelled: number; noShow: number; lostSales: number };
  reach: { views: number; taps: number; saves: number; offersSent: number; offersWon: number; rating: number | null; reviews: number; recentRating: number | null; recentReviews: number };
  team: TeamRow[];
  insights: Insight[];
};

type Visit = {
  id: string;
  bookingId: string | null;
  date: string;
  startMin: number;
  minutes: number;
  proId: string;
  clientKey: string | null;
  clientName: string | null;
  service: string;
  sales: number;
  tip: number;
  take: number;
  shop: number;
  state: "done" | "upcoming" | "cancelled" | "no_show";
  channel: Channel;
  createdDate: string | null;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  online: "Booked online",
  request: "Client requests",
  regular: "Regular appointments",
  pay_at_shop: "Booked online, paid at shop",
  membership: "Membership visits",
  walk_in: "Walk-ins",
  phone: "Phone bookings",
  imported: "Imported",
};

const DAY = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const addDays = (date: string, n: number) => new Date(toMs(date) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY);
const dowOf = (date: string) => new Date(toMs(date)).getUTCDay();
const minutesOf = (time: string | null | undefined) => {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string | null;
  studio_id: string | null;
  booking_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  status: string | null;
  service_name: string | null;
  service_price: number | null;
  payment_status: string | null;
  total_amount_cents: number | null;
  platform_fee_cents: number | null;
  studio_cut_cents: number | null;
  gift_card_cents: number | null;
  membership_id: string | null;
  no_show_status: string | null;
  source: string | null;
  standing_id: string | null;
  created_at: string | null;
};
const BOOKING_COLUMNS =
  "id, professional_id, customer_id, studio_id, booking_date, start_time, end_time, duration_minutes, status, service_name, service_price, payment_status, total_amount_cents, platform_fee_cents, studio_cut_cents, gift_card_cents, membership_id, no_show_status, source, standing_id, created_at";

type FrontDeskRow = {
  id: string;
  studio_id: string | null;
  professional_id: string;
  kind: "walk_in" | "phone" | "imported";
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  price_cents: number | null;
  shop_cut_cents: number | null;
  status: string;
  tip_cents?: number | null;
  created_at: string | null;
};

function localDay(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
}

function bookingVisit(b: BookingRow, today: string, cutPercent: number): Visit {
  const price = Math.round(Number(b.service_price || 0) * 100);
  const paid = b.payment_status === "paid";
  const member = b.payment_status === "pay_at_shop" && !!b.membership_id;
  const gift = Number(b.gift_card_cents) || 0;
  const tip = paid ? Math.max((Number(b.total_amount_cents) || 0) - (price - gift), 0) : 0;
  const fee = paid ? Number(b.platform_fee_cents) || 0 : 0;
  const shop = paid ? Number(b.studio_cut_cents) || 0 : member ? 0 : Math.round((price * cutPercent) / 100);
  const sales = member ? 0 : price;
  const start = minutesOf(b.start_time);
  const minutes = Math.max(b.end_time ? minutesOf(b.end_time) - start : Number(b.duration_minutes) || 0, 0) || Number(b.duration_minutes) || 30;
  const state: Visit["state"] =
    b.status === "cancelled" ? (b.no_show_status ? "no_show" : "cancelled") : b.booking_date > today ? "upcoming" : "done";
  const channel: Channel = member ? "membership" : b.payment_status === "pay_at_shop" ? "pay_at_shop" : b.source === "request" ? "request" : b.standing_id ? "regular" : "online";
  return {
    id: b.id,
    bookingId: b.id,
    date: b.booking_date,
    startMin: start,
    minutes,
    proId: b.professional_id,
    clientKey: b.customer_id,
    clientName: null,
    service: b.service_name || "Service",
    sales,
    tip,
    take: Math.max(sales + tip - fee - shop, 0),
    shop,
    state,
    channel,
    createdDate: localDay(b.created_at),
  };
}

function frontDeskVisit(a: FrontDeskRow, today: string): Visit {
  const price = Number(a.price_cents) || 0;
  const tip = Number(a.tip_cents) || 0;
  const shop = Math.min(Number(a.shop_cut_cents) || 0, price);
  const start = minutesOf(a.start_time);
  const phone = (a.client_phone || "").replace(/\D/g, "");
  const name = (a.client_name || "").trim();
  const state: Visit["state"] =
    a.status === "cancelled" ? "cancelled" : a.status === "no_show" ? "no_show" : a.appointment_date > today ? "upcoming" : a.status === "completed" ? "done" : "cancelled";
  return {
    id: a.id,
    bookingId: null,
    date: a.appointment_date,
    startMin: start,
    minutes: Math.max(minutesOf(a.end_time) - start, 0) || 30,
    proId: a.professional_id,
    // A walk-in with no phone or real name can't be told apart from the next one.
    clientKey: phone.length >= 7 ? `tel:${phone}` : name && !/^walk.?in$/i.test(name) ? `name:${name.toLowerCase()}` : null,
    clientName: name || null,
    service: a.service_name || "Appointment",
    sales: price,
    tip,
    take: price - shop + tip,
    shop,
    state,
    channel: a.kind,
    createdDate: localDay(a.created_at),
  };
}

type Avail = { day_of_week: number; start_time: string; end_time: string; is_active: boolean; professional_id: string };
type TimeOff = { professional_id: string; start_date: string; end_date: string };

function availableMinutes(proIds: string[], avail: Avail[], off: TimeOff[], from: string, to: string) {
  const byDow = Array.from({ length: 7 }, () => 0);
  if (from > to) return { total: 0, byDow };
  const perPro = new Map<string, number[]>();
  for (const a of avail) {
    if (!a.is_active) continue;
    const row = perPro.get(a.professional_id) || Array.from({ length: 7 }, () => 0);
    row[a.day_of_week] += Math.max(minutesOf(a.end_time) - minutesOf(a.start_time), 0);
    perPro.set(a.professional_id, row);
  }
  let total = 0;
  for (const id of proIds) {
    const row = perPro.get(id);
    if (!row) continue;
    const away = off.filter((o) => o.professional_id === id);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (away.some((o) => o.start_date <= d && d <= o.end_date)) continue;
      const dow = dowOf(d);
      total += row[dow];
      byDow[dow] += row[dow];
    }
  }
  return { total, byDow };
}

function monthStart(date: string, back: number) {
  const d = new Date(toMs(date));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
}

export async function buildAnalytics(
  supabase: ServiceClient,
  opts: { scope: "me" | "shop"; userId: string; studio?: StudioRow | null; days: RangeDays; locked: boolean; name: string | null }
): Promise<AnalyticsSummary> {
  const { scope, days } = opts;
  const today = todayLocal();
  const shopId = scope === "shop" ? opts.studio!.id : null;

  // ---- the period and the one before it
  const to = today;
  const from = days === 365 ? monthStart(today, 11) : addDays(today, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = days === 365 ? monthStart(today, 23) : addDays(prevTo, -(days - 1));

  // ---- every visit, all time (lifetime numbers need the history)
  const [bookings, frontDesk] = await Promise.all([
    fetchAll<BookingRow>((a, b) => {
      const q = supabase.from("bookings").select(BOOKING_COLUMNS);
      return (shopId ? q.eq("studio_id", shopId) : q.eq("professional_id", opts.userId)).order("id").range(a, b);
    }),
    fetchAll<FrontDeskRow>((a, b) => {
      const q = supabase.from("shop_appointments").select("*");
      return (shopId ? q.eq("studio_id", shopId) : q.eq("professional_id", opts.userId)).order("id").range(a, b);
    }),
  ]);

  // Shop terms, to estimate the shop's share of pay-at-the-shop bookings.
  let members: StudioMemberRow[] = [];
  let studios: StudioRow[] = [];
  if (shopId) {
    const { data } = await supabase.from("studio_members").select("*").eq("studio_id", shopId);
    members = (data || []) as StudioMemberRow[];
    studios = [opts.studio!];
  } else {
    const { data } = await supabase.from("studio_members").select("*").eq("profile_id", opts.userId);
    members = (data || []) as StudioMemberRow[];
    const ids = [...new Set(members.map((m) => m.studio_id))];
    if (ids.length) studios = ((await supabase.from("studios").select("*").in("id", ids)).data || []) as StudioRow[];
  }
  const cutFor = (b: BookingRow) => {
    if (!b.studio_id) return 0;
    const studio = studios.find((s) => s.id === b.studio_id);
    const member = members.find((m) => m.studio_id === b.studio_id && m.profile_id === b.professional_id) || null;
    return studio ? effectiveCutPercent(studio, member) : 0;
  };

  const visits: Visit[] = [...bookings.map((b) => bookingVisit(b, today, cutFor(b))), ...frontDesk.map((a) => frontDeskVisit(a, today))];

  const teamIds =
    scope === "shop"
      ? [...new Set([...members.filter((m) => m.status === "active" && m.profile_id && m.takes_clients !== false).map((m) => m.profile_id as string), ...visits.map((v) => v.proId)])]
      : [opts.userId];

  // ---- names
  const nameIds = [...new Set([...teamIds, ...visits.map((v) => (v.bookingId ? v.clientKey : null)).filter((x): x is string => !!x)])];
  const names = new Map<string, string>();
  for (let i = 0; i < nameIds.length; i += 200) {
    const { data } = await supabase.from("profiles").select("id, full_name, business_name").in("id", nameIds.slice(i, i + 200));
    for (const p of data || []) names.set(p.id, p.full_name || p.business_name || "");
  }
  for (const v of visits) if (v.bookingId && v.clientKey) v.clientName = names.get(v.clientKey) || "Client";
  const proName = (id: string) => names.get(id) || "Team member";

  const [{ data: availData }, { data: offData }] = await Promise.all([
    supabase.from("professional_availability").select("professional_id, day_of_week, start_time, end_time, is_active").in("professional_id", teamIds.length ? teamIds : [opts.userId]),
    supabase.from("professional_time_off").select("professional_id, start_date, end_date").in("professional_id", teamIds.length ? teamIds : [opts.userId]),
  ]);
  const avail = (availData || []) as Avail[];
  const off = (offData || []) as TimeOff[];

  // ---- slices
  const inRange = (v: Visit, a: string, b: string) => v.date >= a && v.date <= b;
  const done = visits.filter((v) => v.state === "done");
  const now = done.filter((v) => inRange(v, from, to));
  const prev = done.filter((v) => inRange(v, prevFrom, prevTo));
  const firstSeen = new Map<string, string>();
  const firstEver = done.reduce((min, v) => (v.date < min ? v.date : min), today);
  for (const v of done) if (v.clientKey && (!firstSeen.has(v.clientKey) || v.date < firstSeen.get(v.clientKey)!)) firstSeen.set(v.clientKey, v.date);

  const lost = (a: string, b: string) => visits.filter((v) => (v.state === "cancelled" || v.state === "no_show") && inRange(v, a, b) && v.date <= today);
  const lostNow = lost(from, to);
  const lostPrev = lost(prevFrom, prevTo);

  const newIn = (a: string, b: string) => [...firstSeen.values()].filter((d) => d >= a && d <= b).length;

  const latest = new Map<string, string>();
  for (const v of visits) {
    if (!v.clientKey || (v.state !== "done" && v.state !== "upcoming")) continue;
    if (!latest.has(v.clientKey) || v.date > latest.get(v.clientKey)!) latest.set(v.clientKey, v.date);
  }
  // A client served in the period "rebooked" if anything comes after that visit.
  const rebook = (list: Visit[], proId?: string) => {
    const last = new Map<string, string>();
    for (const v of list) if (v.clientKey && (!proId || v.proId === proId) && (!last.has(v.clientKey) || v.date > last.get(v.clientKey)!)) last.set(v.clientKey, v.date);
    if (last.size < 3) return null;
    let back = 0;
    for (const [key, date] of last) {
      if ((latest.get(key) || "") > date) back++;
    }
    return pct(back, last.size);
  };

  const util = (list: Visit[], ids: string[], a: string, b: string) => {
    const start = a < firstEver ? firstEver : a;
    const { total, byDow } = availableMinutes(ids, avail, off, start, b);
    const booked = sum(list.filter((v) => ids.includes(v.proId)), (v) => v.minutes);
    return { rate: total > 0 ? Math.min(pct(booked, total), 100) : null, total, byDow, booked, start };
  };
  const utilNow = util(now, teamIds, from, to);
  const utilPrev = util(prev, teamIds, prevFrom, prevTo);

  const pair = (f: (list: Visit[]) => number): Pair => ({ now: f(now), prev: f(prev) });
  const prevClients = new Set(prev.map((v) => v.clientKey).filter((k): k is string => !!k));
  const cameBack = [...prevClients].filter((k) => (latest.get(k) || "") > prevTo).length;

  const kpis: AnalyticsSummary["kpis"] = {
    sales: pair((l) => sum(l, (v) => v.sales)),
    take: pair((l) => sum(l, (v) => (scope === "shop" ? v.shop : v.take))),
    visits: pair((l) => l.length),
    avgTicket: pair((l) => {
      const paid = l.filter((v) => v.sales > 0);
      return paid.length ? Math.round(sum(paid, (v) => v.sales) / paid.length) : 0;
    }),
    tipRate: pair((l) => pct(sum(l, (v) => v.tip), sum(l, (v) => v.sales))),
    newClients: { now: newIn(from, to), prev: newIn(prevFrom, prevTo) },
    lostRate: { now: pct(lostNow.length, lostNow.length + now.length), prev: pct(lostPrev.length, lostPrev.length + prev.length) },
    utilization: { now: utilNow.rate, prev: prev.length ? utilPrev.rate : null },
    rebookRate: rebook(now),
    retention: { rate: prevClients.size >= 3 ? pct(cameBack, prevClients.size) : null, came: cameBack, of: prevClients.size },
  };

  // ---- trend
  const trend: AnalyticsSummary["trend"] = [];
  if (days === 365) {
    for (let i = 11; i >= 0; i--) {
      const key = monthStart(today, i).slice(0, 7);
      const prevKey = monthStart(today, i + 12).slice(0, 7);
      const list = now.filter((v) => v.date.startsWith(key));
      trend.push({
        label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
        sales: sum(list, (v) => v.sales),
        visits: list.length,
        prevSales: sum(prev.filter((v) => v.date.startsWith(prevKey)), (v) => v.sales),
      });
    }
  } else {
    const size = days === 30 ? 1 : 7;
    const count = Math.ceil(days / size);
    for (let i = count - 1; i >= 0; i--) {
      const end = addDays(to, -i * size);
      const start = addDays(end, -(size - 1));
      const list = now.filter((v) => v.date >= start && v.date <= end);
      const pEnd = addDays(end, -days);
      const pStart = addDays(start, -days);
      trend.push({
        label: new Date(`${(size === 1 ? end : start)}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }),
        sales: sum(list, (v) => v.sales),
        visits: list.length,
        prevSales: sum(prev.filter((v) => v.date >= pStart && v.date <= pEnd), (v) => v.sales),
      });
    }
  }

  // ---- on the books
  const upcoming = visits.filter((v) => v.state === "upcoming");
  const next30 = upcoming.filter((v) => v.date <= addDays(today, 30));
  let regulars = 0;
  {
    const q = supabase.from("standing_appointments").select("id", { count: "exact", head: true }).eq("status", "active");
    const { count } = await (teamIds.length ? q.in("professional_id", teamIds) : q.eq("professional_id", opts.userId));
    regulars = count || 0;
  }
  const onTheBooks = {
    sales: sum(next30, (v) => v.sales),
    visits: next30.length,
    regulars,
    next7Visits: upcoming.filter((v) => v.date <= addDays(today, 7)).length,
  };

  const range = {
    days,
    from,
    to,
    label: days === 365 ? "Last 12 months" : `Last ${days} days`,
  };
  const empty = done.length === 0 && upcoming.length === 0;

  const base: AnalyticsSummary = {
    scope,
    name: opts.name,
    locked: opts.locked,
    empty,
    range,
    kpis,
    trend,
    onTheBooks,
    clients: { active: 0, fresh: 0, returning: 0, top: [], atRisk: [], atRiskCount: 0, atRiskValue: 0 },
    schedule: { byDay: [], heat: [], hourStart: 9, availHoursPerWeek: null, bookedHoursPerWeek: 0, salesPerHour: 0, tenPointValue: null, leadDays: null },
    services: [],
    channels: [],
    outcomes: { done: now.length, cancelled: 0, noShow: 0, lostSales: 0 },
    reach: { views: 0, taps: 0, saves: 0, offersSent: 0, offersWon: 0, rating: null, reviews: 0, recentRating: null, recentReviews: 0 },
    team: [],
    insights: [],
  };
  if (opts.locked) return base;

  // ---- clients
  type ClientAgg = { key: string; name: string; dates: string[]; spend: number; lastPro: string; lastBooking: string | null };
  const byClient = new Map<string, ClientAgg>();
  for (const v of done.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!v.clientKey) continue;
    const c = byClient.get(v.clientKey) || { key: v.clientKey, name: v.clientName || "Client", dates: [], spend: 0, lastPro: v.proId, lastBooking: null };
    c.dates.push(v.date);
    c.spend += v.sales + v.tip;
    c.lastPro = v.proId;
    if (v.bookingId) c.lastBooking = v.bookingId;
    if (v.clientName) c.name = v.clientName;
    byClient.set(v.clientKey, c);
  }
  const hasUpcoming = new Set(upcoming.map((v) => v.clientKey).filter((k): k is string => !!k));
  const activeKeys = new Set(now.map((v) => v.clientKey).filter((k): k is string => !!k));
  const fresh = [...activeKeys].filter((k) => (firstSeen.get(k) || "") >= from).length;

  const atRiskAll = [...byClient.values()]
    .map((c) => {
      const last = c.dates[c.dates.length - 1];
      const daysSince = diffDays(today, last);
      const usualGap = c.dates.length >= 2 ? Math.max(Math.round(diffDays(last, c.dates[0]) / (c.dates.length - 1)), 1) : null;
      const overdue = usualGap ? daysSince > Math.max(usualGap * 1.4, usualGap + 7) && daysSince <= 240 : daysSince >= 42 && daysSince <= 120;
      return { c, last, daysSince, usualGap, overdue };
    })
    .filter((x) => x.overdue && !hasUpcoming.has(x.c.key))
    .sort((a, b) => b.c.spend - a.c.spend);

  const clients: AnalyticsSummary["clients"] = {
    active: activeKeys.size,
    fresh,
    returning: activeKeys.size - fresh,
    top: [...byClient.values()]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map((c) => ({ name: c.name, visits: c.dates.length, spend: c.spend, last: c.dates[c.dates.length - 1] })),
    atRisk: atRiskAll.slice(0, 30).map((x) => ({
      name: x.c.name,
      last: x.last,
      daysSince: x.daysSince,
      usualGap: x.usualGap,
      visits: x.c.dates.length,
      spend: x.c.spend,
      avgTicket: Math.round(x.c.spend / x.c.dates.length),
      proName: scope === "shop" ? proName(x.c.lastPro) : null,
      bookingId: scope === "me" ? x.c.lastBooking : null,
    })),
    atRiskCount: atRiskAll.length,
    atRiskValue: sum(atRiskAll, (x) => Math.round(x.c.spend / x.c.dates.length)),
  };

  // ---- schedule
  const weeks = Math.max(diffDays(to, utilNow.start) + 1, 1) / 7;
  const bookedHours = utilNow.booked / 60;
  const salesPerHour = bookedHours > 0 ? Math.round(kpis.sales.now / bookedHours) : 0;
  let hourStart = 23;
  let hourEnd = 0;
  for (const v of now) {
    const h = Math.floor(v.startMin / 60);
    hourStart = Math.min(hourStart, h);
    hourEnd = Math.max(hourEnd, h);
  }
  for (const a of avail) {
    if (!a.is_active) continue;
    hourStart = Math.min(hourStart, Math.floor(minutesOf(a.start_time) / 60));
    hourEnd = Math.max(hourEnd, Math.ceil(minutesOf(a.end_time) / 60) - 1);
  }
  if (hourStart > hourEnd) [hourStart, hourEnd] = [9, 17];
  const heat = Array.from({ length: 7 }, () => Array.from({ length: hourEnd - hourStart + 1 }, () => 0));
  for (const v of now) {
    const h = Math.floor(v.startMin / 60);
    if (h >= hourStart && h <= hourEnd) heat[dowOf(v.date)][h - hourStart] += 1;
  }
  const lead = now.filter((v) => v.createdDate && v.channel !== "walk_in" && v.channel !== "imported").map((v) => Math.max(diffDays(v.date, v.createdDate!), 0));
  const schedule: AnalyticsSummary["schedule"] = {
    byDay: Array.from({ length: 7 }, (_, dow) => {
      const list = now.filter((v) => dowOf(v.date) === dow);
      return { dow, bookedMin: sum(list, (v) => v.minutes), availMin: utilNow.byDow[dow], visits: list.length, sales: sum(list, (v) => v.sales) };
    }),
    heat,
    hourStart,
    availHoursPerWeek: utilNow.total > 0 ? Math.round(utilNow.total / 60 / weeks) : null,
    bookedHoursPerWeek: Math.round((bookedHours / weeks) * 10) / 10,
    salesPerHour,
    tenPointValue: utilNow.total > 0 && salesPerHour > 0 ? Math.round((utilNow.total / 60 / weeks) * 0.1 * salesPerHour) : null,
    leadDays: lead.length >= 3 ? Math.round((sum(lead, (d) => d) / lead.length) * 10) / 10 : null,
  };

  // ---- services and channels
  const svc = new Map<string, { count: number; sales: number; minutes: number }>();
  for (const v of now) {
    const s = svc.get(v.service) || { count: 0, sales: 0, minutes: 0 };
    s.count += 1;
    s.sales += v.sales;
    s.minutes += v.minutes;
    svc.set(v.service, s);
  }
  const services = [...svc.entries()]
    .map(([name, s]) => ({ name, count: s.count, sales: s.sales, avg: Math.round(s.sales / s.count), perHour: s.minutes ? Math.round(s.sales / (s.minutes / 60)) : 0 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);
  const channels = (Object.keys(CHANNEL_LABEL) as Channel[])
    .map((key) => {
      const list = now.filter((v) => v.channel === key);
      return { key, label: CHANNEL_LABEL[key], count: list.length, sales: sum(list, (v) => v.sales) };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const outcomes = {
    done: now.length,
    cancelled: lostNow.filter((v) => v.state === "cancelled").length,
    noShow: lostNow.filter((v) => v.state === "no_show").length,
    lostSales: sum(lostNow, (v) => v.sales),
  };

  // ---- reach: Explore views, saves, offers, reviews
  const sinceIso = new Date(toMs(from)).toISOString();
  const ids = teamIds.length ? teamIds : [opts.userId];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const count = async (table: string, col: string, extra?: (q: any) => any) => {
    try {
      let q: any = supabase.from(table).select(col, { count: "exact", head: true }).in("professional_id", ids).gte("created_at", sinceIso);
      if (extra) q = extra(q);
      const { count: n } = await q;
      return n || 0;
    } catch {
      return 0;
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [views, taps, saves, offersSent, offersWon, reviewRows] = await Promise.all([
    count("spotlight_events", "id", (q) => q.eq("kind", "view")),
    count("spotlight_events", "id", (q) => q.eq("kind", "tap")),
    count("saved_pros", "professional_id"),
    count("request_offers", "id"),
    count("request_offers", "id", (q) => q.eq("status", "accepted")),
    fetchAll<{ rating: number; created_at: string }>((a, b) => supabase.from("professional_reviews").select("rating, created_at").in("professional_id", ids).order("id").range(a, b)),
  ]);
  const recent = reviewRows.filter((r) => r.created_at >= sinceIso);
  const avgOf = (rows: { rating: number }[]) => (rows.length ? Math.round((sum(rows, (r) => r.rating) / rows.length) * 10) / 10 : null);
  const reach = { views, taps, saves, offersSent, offersWon, rating: avgOf(reviewRows), reviews: reviewRows.length, recentRating: avgOf(recent), recentReviews: recent.length };

  // ---- team (shops)
  const team: TeamRow[] =
    scope === "shop"
      ? teamIds
          .map((id) => {
            const mine = now.filter((v) => v.proId === id);
            const paid = mine.filter((v) => v.sales > 0);
            const mySales = sum(mine, (v) => v.sales);
            const myLost = lostNow.filter((v) => v.proId === id).length;
            const u = util(now, [id], from, to);
            const firstByPro = new Map<string, string>();
            for (const v of done) if (v.proId === id && v.clientKey && (!firstByPro.has(v.clientKey) || v.date < firstByPro.get(v.clientKey)!)) firstByPro.set(v.clientKey, v.date);
            const hours = sum(mine, (v) => v.minutes) / 60;
            return {
              id,
              name: proName(id),
              sales: mySales,
              tips: sum(mine, (v) => v.tip),
              visits: mine.length,
              avgTicket: paid.length ? Math.round(sum(paid, (v) => v.sales) / paid.length) : 0,
              tipRate: pct(sum(mine, (v) => v.tip), mySales),
              rebookRate: rebook(now, id),
              utilization: u.rate,
              lostRate: pct(myLost, myLost + mine.length),
              newClients: [...firstByPro.values()].filter((d) => d >= from).length,
              shopCents: sum(mine, (v) => v.shop),
              salesPerHour: hours > 0 ? Math.round(mySales / hours) : 0,
            };
          })
          .sort((a, b) => b.sales - a.sales)
      : [];

  // ---- plain-language takeaways, most useful first
  const insights: Insight[] = [];
  const you = scope === "shop" ? "The shop" : "You";
  const change = kpis.sales.prev > 0 ? Math.round(((kpis.sales.now - kpis.sales.prev) / kpis.sales.prev) * 100) : null;
  if (change !== null && Math.abs(change) >= 10) {
    insights.push({
      tone: change > 0 ? "good" : "warn",
      title: `Sales are ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`,
      body: `${dollars(kpis.sales.now)} against ${dollars(kpis.sales.prev)} in the period before, from ${kpis.visits.now} appointments (${kpis.visits.prev} before).`,
    });
  }
  if (clients.atRiskCount > 0) {
    insights.push({
      tone: "warn",
      title: `${clients.atRiskCount} client${clients.atRiskCount === 1 ? " is" : "s are"} overdue`,
      body: `They usually come back sooner and have nothing booked. One visit each is worth about ${dollars(clients.atRiskValue)}. The list is under Clients.`,
    });
  }
  if (schedule.tenPointValue && kpis.utilization.now !== null && kpis.utilization.now < 75) {
    insights.push({
      tone: "info",
      title: `${kpis.utilization.now}% of open hours are booked`,
      body: `Filling 10 more points of ${scope === "shop" ? "the team's" : "your"} open time is worth about ${dollars(schedule.tenPointValue)} a week at ${scope === "shop" ? "the shop's" : "your"} current ${dollars(salesPerHour)} an hour.`,
    });
  }
  const openDays = schedule.byDay.filter((d) => d.availMin >= 120);
  if (openDays.length >= 3) {
    const rate = (d: (typeof openDays)[number]) => d.bookedMin / d.availMin;
    const quiet = openDays.slice().sort((a, b) => rate(a) - rate(b))[0];
    const busy = openDays.slice().sort((a, b) => rate(b) - rate(a))[0];
    if (rate(busy) - rate(quiet) >= 0.2) {
      insights.push({
        tone: "info",
        title: `${DAY_NAMES[quiet.dow]} are the quiet day`,
        body: `${Math.round(rate(quiet) * 100)}% booked, against ${Math.min(Math.round(rate(busy) * 100), 100)}% on ${DAY_NAMES[busy.dow]}. Point overdue clients and new requests there first.`,
      });
    }
  }
  if (kpis.lostRate.now >= 10 && lostNow.length >= 3) {
    insights.push({
      tone: "warn",
      title: `${kpis.lostRate.now}% of bookings didn't happen`,
      body: `${outcomes.cancelled} cancelled and ${outcomes.noShow} no-show, about ${dollars(outcomes.lostSales)} of work. ${scope === "shop" ? "A no-show fee in Studio settings" : "Taking payment at booking"} cuts this down.`,
    });
  }
  if (kpis.rebookRate !== null && kpis.rebookRate < 40) {
    insights.push({
      tone: "info",
      title: `${kpis.rebookRate}% of clients have come back or rebooked`,
      body: `Offer a regular appointment at the end of each visit: it holds their slot every few weeks and books itself.`,
    });
  } else if (kpis.rebookRate !== null && kpis.rebookRate >= 65) {
    insights.push({ tone: "good", title: `${kpis.rebookRate}% of clients come back`, body: `${you} keep${scope === "shop" ? "s" : ""} most clients. New clients are where the growth is.` });
  }
  const byHour = services.filter((s) => s.count >= 3 && s.perHour > 0).sort((a, b) => b.perHour - a.perHour);
  if (byHour.length >= 2 && byHour[0].perHour >= byHour[byHour.length - 1].perHour * 1.3) {
    const best = byHour[0];
    const worst = byHour[byHour.length - 1];
    insights.push({
      tone: "info",
      title: `${best.name} earns the most per hour`,
      body: `${dollars(best.perHour)} an hour, against ${dollars(worst.perHour)} for ${worst.name}. Worth a look at ${worst.name}'s price or length.`,
    });
  }
  if (scope === "shop" && team.filter((t) => t.visits > 0).length >= 2) {
    const active = team.filter((t) => t.utilization !== null);
    if (active.length >= 2) {
      const low = active.slice().sort((a, b) => (a.utilization as number) - (b.utilization as number))[0];
      const high = active.slice().sort((a, b) => (b.utilization as number) - (a.utilization as number))[0];
      if ((high.utilization as number) - (low.utilization as number) >= 20) {
        insights.push({
          tone: "info",
          title: `${low.name} has the most open time`,
          body: `${low.utilization}% booked, against ${high.utilization}% for ${high.name}. Send walk-ins and shop requests ${low.name.split(" ")[0]}'s way.`,
        });
      }
    }
    const walk = channels.find((c) => c.key === "walk_in");
    if (walk && pct(walk.count, now.length) >= 25) {
      insights.push({
        tone: "info",
        title: `${pct(walk.count, now.length)}% of visits are walk-ins`,
        body: `Take a phone number when you mark them done, so they count as clients and show up when they're overdue.`,
      });
    }
  }
  if (onTheBooks.visits > 0) {
    insights.push({ tone: "good", title: `${dollars(onTheBooks.sales)} already booked`, body: `${onTheBooks.visits} appointment${onTheBooks.visits === 1 ? "" : "s"} in the next 30 days${regulars ? `, with ${regulars} regular${regulars === 1 ? "" : "s"} on repeat` : ""}.` });
  }

  return { ...base, clients, schedule, services, channels, outcomes, reach, team, insights: insights.slice(0, 6) };
}
