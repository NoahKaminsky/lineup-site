// A pro's Analytics, one section at a time (each loads on its own, so the
// page fills in fast). Reads the database; every calculation lives in
// ./analyticsMetrics and every suggestion in ./analyticsInsights. Revenue
// for each visit comes from the same rows the Earnings page uses
// (./earningsCore), so the two never disagree.

import { createClient } from "@supabase/supabase-js";
import { bookingEarnings, bookingVisitMoney, shopAppointmentEarnings, shopVisitMoney, SERVICE_TYPES, type BookingInput } from "./earningsCore";
import { fetchAll } from "./fetchAll";
import { getServiceSupabase } from "./serverSupabase";
import { requestMatchesProfessional } from "./professions";
import { withinServiceArea } from "./serviceArea";
import {
  addDays,
  atRisk,
  diffDays,
  firstVisits,
  forecast,
  goalProgress,
  heatmap,
  lifetimeValue,
  lostBookings,
  openTimeValue,
  overview,
  recurringWords,
  requestStats,
  retentionCohorts,
  revenueSeries,
  shiftMonth,
  sources,
  change,
  clientStats,
  type AnalyticsAccess,
  type AVisit,
  type GoalKind,
  type OpenHours,
  type Period,
} from "./analyticsMetrics";
import { suggestions, type Suggestion } from "./analyticsInsights";

type DB = ReturnType<typeof getServiceSupabase>;

export const SECTIONS = ["overview", "forecast", "clients", "calendar", "sources", "requests", "profile", "boosts", "prices", "goals"] as const;
export type SectionName = (typeof SECTIONS)[number];
// Apprentice ("Basic analytics" in plans.ts) gets the overview and its chart.
export const BASIC_SECTIONS: SectionName[] = ["overview"];
// came_from has been recorded since this day; older bookings show "Not tracked".
export const SOURCE_TRACKING_SINCE = "2026-11-23";

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, studio_id, booking_date, start_time, end_time, duration_minutes, status, service_name, service_price, payment_status, refund_status, total_amount_cents, platform_fee_cents, studio_cut_cents, gift_card_cents, membership_id, no_show_fee_cents, no_show_status, source, standing_id, created_at, cancelled_at, came_from";

type BookingRow = BookingInput & {
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  created_at: string | null;
  cancelled_at: string | null;
  came_from: string | null;
};
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
  paid_with?: string | null;
  tip_cents?: number | null;
  created_at: string | null;
};

const minutesOf = (t: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const localDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" }) : null);

// Revenue for one visit, exactly as Earnings counts it: service sales (the
// gift-card-covered part counts when the card is sold) less refunds.
const earnedFromRows = (rows: ReturnType<typeof bookingEarnings>["rows"]) =>
  rows.filter((r) => SERVICE_TYPES.includes(r.type)).reduce((s, r) => s + r.priceCents - r.giftCents - Math.max(r.refundCents - r.tipCents, 0), 0);

export function bookingToVisit(b: BookingRow, today: string, names: Map<string, string>): AVisit {
  const start = minutesOf(b.start_time);
  const end = minutesOf(b.end_time);
  const minutes = (end > start ? end - start : Number(b.duration_minutes) || 0) || 30;
  const upcoming = b.booking_date > today;
  const state: AVisit["state"] = b.status === "cancelled" ? (b.no_show_status ? "no_show" : "cancelled") : upcoming ? "upcoming" : "done";
  // Cancelled within a day of the appointment.
  const startsAt = Date.parse(`${b.booking_date}T${(b.start_time || "00:00").slice(0, 5)}:00-05:00`);
  const lateCancel = state === "cancelled" && !!b.cancelled_at && startsAt - Date.parse(b.cancelled_at) < 24 * 3_600_000;
  return {
    date: b.booking_date,
    startMin: start,
    minutes,
    clientKey: b.customer_id,
    clientName: b.customer_id ? names.get(b.customer_id) || "Client" : null,
    customerId: b.customer_id,
    service: b.service_name || "Service",
    // Upcoming: what it's expected to bring in. Past: what Earnings counted.
    sales: upcoming ? bookingVisitMoney(b, 0).sales : earnedFromRows(bookingEarnings(b, { today, cutPercent: 0 }).rows),
    state,
    lateCancel,
    cameFrom: b.came_from,
    createdDate: localDay(b.created_at),
  };
}

export function frontDeskToVisit(a: FrontDeskRow, today: string): AVisit {
  const start = minutesOf(a.start_time);
  const phone = (a.client_phone || "").replace(/\D/g, "");
  const name = (a.client_name || "").trim();
  const upcoming = a.appointment_date > today;
  const state: AVisit["state"] =
    a.status === "cancelled" ? "cancelled" : a.status === "no_show" ? "no_show" : upcoming ? "upcoming" : a.status === "completed" || a.kind === "imported" ? "done" : "cancelled";
  return {
    date: a.appointment_date,
    startMin: start,
    minutes: Math.max(minutesOf(a.end_time) - start, 0) || 30,
    clientKey: a.kind === "imported" ? null : phone.length >= 7 ? `tel:${phone}` : name && !/^walk.?in$/i.test(name) ? `name:${name.toLowerCase()}` : null,
    clientName: name || null,
    service: a.service_name || "Appointment",
    sales: a.kind === "imported" ? 0 : upcoming ? shopVisitMoney(a).sales : shopAppointmentEarnings(a, today).rows.reduce((s, r) => s + r.priceCents, 0),
    state,
    imported: a.kind === "imported",
    cameFrom: a.kind === "imported" ? null : "front_desk",
    createdDate: localDay(a.created_at),
  };
}

export async function loadVisits(db: DB, proId: string, today: string): Promise<AVisit[]> {
  const [bookings, desk] = await Promise.all([
    fetchAll<BookingRow>((a, b) => db.from("bookings").select(BOOKING_COLUMNS).eq("professional_id", proId).order("id").range(a, b)),
    fetchAll<FrontDeskRow>((a, b) => db.from("shop_appointments").select("*").eq("professional_id", proId).order("id").range(a, b)),
  ]);
  const ids = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("profiles").select("id, full_name").in("id", ids.slice(i, i + 200));
    for (const p of data || []) names.set(p.id as string, (p.full_name as string) || "Client");
  }
  return [...bookings.map((b) => bookingToVisit(b, today, names)), ...desk.map((a) => frontDeskToVisit(a, today))];
}

async function openHours(db: DB, proId: string): Promise<{ open: OpenHours; off: { start_date: string; end_date: string }[] }> {
  const [{ data: avail }, { data: off }] = await Promise.all([
    db.from("professional_availability").select("day_of_week, start_time, end_time, is_active").eq("professional_id", proId),
    db.from("professional_time_off").select("start_date, end_date").eq("professional_id", proId),
  ]);
  return {
    open: (avail || []).filter((a) => a.is_active !== false).map((a) => ({ dow: Number(a.day_of_week), startMin: minutesOf(a.start_time as string), endMin: minutesOf(a.end_time as string) })),
    off: (off || []) as { start_date: string; end_date: string }[],
  };
}

const offDaysIn = (off: { start_date: string; end_date: string }[], p: Period) => {
  const set = new Set<string>();
  for (const o of off) for (let d = o.start_date < p.from ? p.from : o.start_date; d <= o.end_date && d <= p.to; d = addDays(d, 1)) set.add(d);
  return set;
};

export type Ctx = {
  db: DB;
  proId: string;
  today: string;
  period: Period;
  compare: Period;
  service: string | null;
  accessToken: string | null;
  access: AnalyticsAccess;
};

const filterService = (visits: AVisit[], service: string | null) => (service ? visits.filter((v) => v.service.toLowerCase() === service.toLowerCase()) : visits);
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

// ── Sections ────────────────────────────────────────────────────────────

export async function section(name: SectionName, c: Ctx): Promise<Record<string, unknown> & { suggestion: Suggestion | null }> {
  switch (name) {
    case "overview":
      return overviewSection(c);
    case "forecast":
      return forecastSection(c);
    case "clients":
      return clientsSection(c);
    case "calendar":
      return calendarSection(c);
    case "sources":
      return sourcesSection(c);
    case "requests":
      return requestsSection(c);
    case "profile":
      return profileSection(c);
    case "boosts":
      return boostsSection(c);
    case "prices":
      return pricesSection(c);
    case "goals":
      return goalsSection(c);
  }
}

const pick = (list: Suggestion[]) => list[0] || null;

async function overviewSection(c: Ctx) {
  const all = await loadVisits(c.db, c.proId, c.today);
  const visits = filterService(all, c.service);
  const o = overview(visits, c.period, c.compare);
  const services = [...new Set(all.filter((v) => !v.imported && v.state !== "cancelled").map((v) => v.service))].sort();
  const { data: reviews } = await c.db.from("professional_reviews").select("rating, created_at").eq("professional_id", c.proId).limit(5000);
  const avg = (rows: { rating: number }[]) => (rows.length ? Math.round((sum(rows, (r) => r.rating) / rows.length) * 10) / 10 : null);
  const inP = (p: Period) => (reviews || []).filter((r) => (localDay(r.created_at as string) as string) >= p.from && (localDay(r.created_at as string) as string) <= p.to) as { rating: number }[];
  const rating = { now: avg((reviews || []) as { rating: number }[]), period: avg(inP(c.period)), prev: avg(inP(c.compare)), count: (reviews || []).length };
  return {
    ...o,
    rating,
    series: revenueSeries(visits, c.period, c.compare),
    services,
    empty: !all.some((v) => v.state === "done" || v.state === "upcoming"),
    suggestion: pick(suggestions({ overview: { revenueChange: change(o.revenue), bookingsChange: change(o.bookings), avgTicketChange: change(o.avgTicket), rebook: o.rebook.now } })),
  };
}

async function standingFor(db: DB, proId: string) {
  const { data } = await db.from("standing_appointments").select("customer_id, next_date, service_id, status").eq("professional_id", proId).eq("status", "active");
  const serviceIds = [...new Set((data || []).map((s) => s.service_id).filter(Boolean) as string[])];
  const prices = new Map<string, number>();
  if (serviceIds.length) {
    const { data: svc } = await db.from("professional_services").select("id, price").in("id", serviceIds);
    for (const s of svc || []) prices.set(s.id as string, Math.round(Number(s.price || 0) * 100));
  }
  return (data || []).map((s) => ({ clientKey: (s.customer_id as string) || null, nextDate: (s.next_date as string) || null, cents: prices.get(s.service_id as string) || 0 }));
}

async function forecastSection(c: Ctx) {
  const [visits, standing, hours] = await Promise.all([loadVisits(c.db, c.proId, c.today), standingFor(c.db, c.proId), openHours(c.db, c.proId)]);
  const f = forecast(visits, standing, c.today);
  // Working days in the next two weeks with nothing booked yet.
  const next = { from: addDays(c.today, 1), to: addDays(c.today, 14) };
  const off = offDaysIn(hours.off, next);
  let emptyDays = 0;
  for (let d = next.from; d <= next.to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (off.has(d) || !hours.open.some((o) => o.dow === dow)) continue;
    if (!visits.some((v) => v.date === d && (v.state === "upcoming" || v.state === "done"))) emptyDays++;
  }
  return { ...f, emptyDays, suggestion: pick(suggestions({ forecast: { confirmed: f.confirmed, expected: f.expected, emptyDays } })) };
}

async function clientsSection(c: Ctx) {
  const visits = await loadVisits(c.db, c.proId, c.today);
  const first = firstVisits(visits);
  const seen = new Set(visits.filter((v) => v.state === "done" && !v.imported && v.clientKey && v.date >= c.period.from && v.date <= c.period.to).map((v) => v.clientKey as string));
  const fresh = [...seen].filter((k) => (first.get(k) || "") >= c.period.from).length;
  const risk = atRisk(visits, c.today);
  // Who's had a nudge in the last 30 days (the nudge system's limit).
  const { data: nudges } = await c.db
    .from("winback_nudges")
    .select("customer_id, created_at")
    .eq("professional_id", c.proId)
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  const nudged = new Map<string, number>();
  for (const n of nudges || []) {
    const ago = Math.floor((Date.now() - Date.parse(n.created_at as string)) / 86_400_000);
    const prev = nudged.get(n.customer_id as string);
    if (prev === undefined || ago < prev) nudged.set(n.customer_id as string, ago);
  }
  const list = risk.slice(0, 30).map((r) => ({ ...r, nudgedDaysAgo: r.customerId ? nudged.get(r.customerId) ?? null : null }));
  const nudgeable = list.filter((r) => r.customerId && r.nudgedDaysAgo === null).length;
  const top = clientStats(visits)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((s) => ({ name: s.name, visits: s.dates.length, spend: s.spend, last: s.dates[s.dates.length - 1] }));
  const atRiskValue = sum(risk, (r) => r.avgTicket);
  return {
    newClients: fresh,
    returning: seen.size - fresh,
    retention: retentionCohorts(visits, c.today, 6),
    lifetimeValue: lifetimeValue(visits),
    top,
    atRisk: list,
    atRiskCount: risk.length,
    atRiskValue,
    suggestion: pick(suggestions({ clients: { atRisk: risk.length, atRiskNudgeable: nudgeable, atRiskValue } })),
  };
}

async function calendarSection(c: Ctx) {
  const [visits, hours] = await Promise.all([loadVisits(c.db, c.proId, c.today), openHours(c.db, c.proId)]);
  const h = heatmap(visits, hours.open, c.period, offDaysIn(hours.off, c.period));
  // Open time this month: the whole calendar month, priced at the hourly
  // revenue from the chosen period.
  const month = { from: `${c.today.slice(0, 7)}-01`, to: addDays(shiftMonth(`${c.today.slice(0, 7)}-01`, 1), -1) };
  const m = heatmap(visits, hours.open, month, offDaysIn(hours.off, month));
  const worked = visits.filter((v) => v.state === "done" && !v.imported && v.date >= c.period.from && v.date <= c.period.to);
  const value = openTimeValue(m.openMinutes, m.bookedMinutes, sum(worked, (v) => v.sales), sum(worked, (v) => v.minutes));
  const lost = lostBookings(visits, c.period);
  return {
    hourStart: h.hourStart,
    hourEnd: h.hourEnd,
    booked: h.booked,
    open: h.open,
    busiest: h.busiest,
    emptiest: h.emptiest,
    hasHours: hours.open.length > 0,
    openThisMonth: value,
    lost,
    suggestion: pick(suggestions({ calendar: { emptiest: h.emptiest, freeHours: value.freeHours, openValue: value.cents, noShows: lost.noShows, lateCancels: lost.lateCancels } })),
  };
}

async function sourcesSection(c: Ctx) {
  const visits = filterService(await loadVisits(c.db, c.proId, c.today), c.service);
  const list = sources(visits, c.period);
  const total = sum(list, (s) => s.revenue);
  const tracked = list.filter((s) => s.key !== "not_tracked");
  const top = tracked[0] ? { key: tracked[0].key, label: tracked[0].label, share: total ? Math.round((tracked[0].revenue / total) * 100) : 0 } : null;
  const online = list.filter((s) => !["front_desk", "not_tracked"].includes(s.key));
  const onlineCount = sum(online, (s) => s.count);
  const link = list.find((s) => s.key === "booking_link");
  return {
    sources: list,
    trackedSince: SOURCE_TRACKING_SINCE,
    suggestion: pick(suggestions({ sources: { top, tracked: tracked.length > 0 && onlineCount >= 5, linkShare: onlineCount >= 5 ? Math.round(((link?.count || 0) / onlineCount) * 100) : null } })),
  };
}

const priceCents = (text: string | null | undefined) => {
  const m = /(\d+(?:\.\d{1,2})?)/.exec(String(text || "").replace(/,/g, ""));
  return m ? Math.round(Number(m[1]) * 100) : null;
};
const median = (list: number[]) => {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function requestsSection(c: Ctx) {
  const sinceIso = new Date(`${c.period.from}T05:00:00Z`).toISOString();
  const untilIso = new Date(`${addDays(c.period.to, 1)}T05:00:00Z`).toISOString();
  const [{ data: offers }, { data: profile }, { data: dismissed }] = await Promise.all([
    c.db.from("request_offers").select("request_id, status, proposed_price, created_at").eq("professional_id", c.proId).neq("status", "withdrawn").gte("created_at", sinceIso).lt("created_at", untilIso),
    c.db.from("profiles").select("*").eq("id", c.proId).maybeSingle(),
    c.db.from("request_dismissals").select("request_id").eq("professional_id", c.proId),
  ]);
  const requestIds = [...new Set((offers || []).map((o) => o.request_id as string))];
  const [{ data: requests }, { data: others }] = requestIds.length
    ? await Promise.all([
        c.db.from("service_requests").select("id, created_at").in("id", requestIds),
        // Every offer on the same requests: the median price for that job,
        // never shown on its own.
        c.db.from("request_offers").select("request_id, proposed_price").in("request_id", requestIds).neq("professional_id", c.proId),
      ])
    : [{ data: [] }, { data: [] }];
  const created = new Map((requests || []).map((r) => [r.id as string, r.created_at as string]));
  const othersByRequest = new Map<string, number[]>();
  for (const o of others || []) {
    const cents = priceCents(o.proposed_price as string);
    if (!cents) continue;
    othersByRequest.set(o.request_id as string, [...(othersByRequest.get(o.request_id as string) || []), cents]);
  }
  const stats = requestStats(
    (offers || [])
      .filter((o) => created.has(o.request_id as string))
      .map((o) => ({
        requestCreatedAt: created.get(o.request_id as string) as string,
        offeredAt: o.created_at as string,
        won: o.status === "accepted",
        priceCents: priceCents(o.proposed_price as string),
        medianCents: median(othersByRequest.get(o.request_id as string) || []),
      }))
  );

  // Requests in their trade and area they never answered, by service and day.
  const { data: open } = await c.db
    .from("service_requests")
    .select("id, category, categories, title, target_profession, target_professions, preferred_professional_id, is_direct_rebook, area_lat, area_lng, location_lat, location_lng, created_at, client_id, status")
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
    .limit(2000);
  const answered = new Set([...requestIds, ...(dismissed || []).map((d) => d.request_id as string)]);
  const missedList = (open || []).filter(
    (r) =>
      !answered.has(r.id as string) &&
      r.client_id !== c.proId &&
      profile &&
      requestMatchesProfessional(r as never, { ...(profile as Record<string, unknown>), id: c.proId } as never) &&
      withinServiceArea(profile as never, r as never)
  );
  const byService = new Map<string, number>();
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  for (const r of missedList) {
    const k = String(r.category || r.title || "Other");
    byService.set(k, (byService.get(k) || 0) + 1);
    byDay[new Date(`${localDay(r.created_at as string)}T00:00:00Z`).getUTCDay()]++;
  }
  const fast = stats.bySpeed[0];
  const slow = { offers: stats.bySpeed[1].offers + stats.bySpeed[2].offers, won: stats.bySpeed[1].won + stats.bySpeed[2].won };
  return {
    ...stats,
    missed: missedList.length,
    missedByService: [...byService.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    missedByDay: byDay,
    suggestion: pick(
      suggestions({
        requests: {
          offers: stats.offers,
          winRate: stats.rate,
          medianMinutes: stats.medianMinutes,
          fastWinRate: fast.offers >= 3 ? fast.rate : null,
          slowWinRate: slow.offers >= 3 ? Math.round((slow.won / slow.offers) * 100) : null,
          missed: missedList.length,
        },
      })
    ),
  };
}

async function profileSection(c: Ctx) {
  const sinceIso = new Date(`${c.period.from}T05:00:00Z`).toISOString();
  const untilIso = new Date(`${addDays(c.period.to, 1)}T05:00:00Z`).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count || 0;
  const ev = () => c.db.from("spotlight_events").select("id", { count: "exact", head: true }).eq("professional_id", c.proId).gte("created_at", sinceIso).lt("created_at", untilIso);
  const [views, visits, saves, bookings, { data: reviews }] = await Promise.all([
    count(ev().eq("kind", "view").eq("surface", "explore")),
    count(ev().eq("kind", "view").eq("surface", "profile")),
    count(c.db.from("saved_pros").select("professional_id", { count: "exact", head: true }).eq("professional_id", c.proId).gte("created_at", sinceIso).lt("created_at", untilIso)),
    count(c.db.from("bookings").select("id", { count: "exact", head: true }).eq("professional_id", c.proId).neq("source", "request").gte("created_at", sinceIso).lt("created_at", untilIso)),
    c.db.from("professional_reviews").select("rating, comment, created_at").eq("professional_id", c.proId).order("created_at").limit(5000),
  ]);
  // Rating by month for the last six months.
  const thisMonth = `${c.today.slice(0, 7)}-01`;
  const trend = Array.from({ length: 6 }, (_, i) => {
    const from = shiftMonth(thisMonth, i - 5);
    const to = addDays(shiftMonth(from, 1), -1);
    const list = (reviews || []).filter((r) => {
      const d = localDay(r.created_at as string) as string;
      return d >= from && d <= to;
    });
    return {
      label: new Date(`${from}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
      rating: list.length ? Math.round((sum(list, (r) => Number(r.rating)) / list.length) * 10) / 10 : null,
      count: list.length,
    };
  });
  return {
    funnel: { views, visits, saves, bookings },
    ratingTrend: trend,
    words: recurringWords((reviews || []).map((r) => String(r.comment || "")).filter(Boolean)),
    suggestion: pick(suggestions({ profile: { views, visits, saves, bookings } })),
  };
}

async function boostsSection(c: Ctx) {
  const { data: boosts } = await c.db
    .from("boosts")
    .select("id, kind, amount_cents, starts_at, ends_at, created_at")
    .eq("purchased_by", c.proId)
    .eq("kind", "profile")
    .gt("amount_cents", 0)
    .order("starts_at", { ascending: false })
    .limit(24);
  const visits = await loadVisits(c.db, c.proId, c.today);
  const rows = await Promise.all(
    (boosts || []).map(async (b) => {
      const ev = () => c.db.from("spotlight_events").select("id", { count: "exact", head: true }).eq("professional_id", c.proId).gte("created_at", b.starts_at as string).lt("created_at", b.ends_at as string);
      const [views, profileVisits] = await Promise.all([ev().eq("kind", "view").eq("surface", "explore"), ev().eq("kind", "view").eq("surface", "profile").eq("via", "boost")]);
      const from = localDay(b.starts_at as string) as string;
      // Bookings that came from a boost, made while it ran or up to a week after.
      const until = addDays(localDay(b.ends_at as string) as string, 7);
      const led = visits.filter((v) => v.cameFrom === "boost" && v.createdDate && v.createdDate >= from && v.createdDate <= until && v.state !== "cancelled");
      return {
        id: b.id as string,
        from,
        to: localDay(b.ends_at as string) as string,
        cost: Number(b.amount_cents) || 0,
        views: views.count || 0,
        visits: profileVisits.count || 0,
        bookings: led.length,
        revenue: sum(led, (v) => v.sales),
      };
    })
  );
  const spent = sum(rows, (r) => r.cost);
  const revenue = sum(rows, (r) => r.revenue);
  return { boosts: rows, spent, revenue, suggestion: pick(suggestions({ boosts: { spent, revenue, count: rows.length } })) };
}

async function pricesSection(c: Ctx) {
  const { data: services } = await c.db.from("professional_services").select("service_name, price, is_active").eq("professional_id", c.proId).neq("is_active", false);
  if (!c.accessToken) return { services: [], suggestion: null };
  // As the pro, so the server function knows their trade and city. It only
  // ever returns the median and range, and nothing below 5 other pros.
  const asPro = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${c.accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const seen = new Set<string>();
  const list = (services || []).filter((s) => {
    const k = String(s.service_name || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const rows = await Promise.all(
    list.slice(0, 20).map(async (s) => {
      const { data } = await asPro.rpc("local_service_prices", { service: s.service_name });
      const r = (Array.isArray(data) ? data[0] : data) as { pros: number; median_cents: number | null; low_cents: number | null; high_cents: number | null } | null;
      const mine = Math.round(Number(s.price || 0) * 100) || null;
      const enough = !!r && r.median_cents !== null;
      return {
        service: s.service_name as string,
        mine,
        enough,
        median: enough ? r!.median_cents : null,
        low: enough ? r!.low_cents : null,
        high: enough ? r!.high_cents : null,
        vsMedian: enough && mine ? Math.round(((mine - (r!.median_cents as number)) / (r!.median_cents as number)) * 100) : null,
      };
    })
  );
  const below = rows.filter((r) => r.vsMedian !== null && r.vsMedian <= -20).sort((a, b) => (a.vsMedian as number) - (b.vsMedian as number))[0];
  const above = rows.filter((r) => r.vsMedian !== null && r.vsMedian >= 25).sort((a, b) => (b.vsMedian as number) - (a.vsMedian as number))[0];
  return {
    services: rows,
    suggestion: pick(suggestions({ prices: { enough: rows.some((r) => r.enough), below: below?.service || null, above: above?.service || null } })),
  };
}

async function goalsSection(c: Ctx) {
  const [{ data: profile }, visits] = await Promise.all([
    c.db.from("profiles").select("sales_goal_cents, goal_kind, goal_bookings").eq("id", c.proId).maybeSingle(),
    loadVisits(c.db, c.proId, c.today),
  ]);
  const kind = (profile?.goal_kind as GoalKind) || "revenue";
  const target = kind === "bookings" ? Number(profile?.goal_bookings) || 0 : Number(profile?.sales_goal_cents) || 0;
  if (!target) return { set: false, kind, suggestion: pick(suggestions({ goals: { set: false, onTrack: false, neededPerDay: 0, kind, daysLeft: 0 } })) };
  const g = goalProgress(kind, target, visits, c.today);
  return { set: true, ...g, suggestion: pick(suggestions({ goals: { set: true, onTrack: g.onTrack, neededPerDay: g.neededPerDay, kind, daysLeft: g.daysLeft } })) };
}

// ── Daily rollups ────────────────────────────────────────────────────────
// One row per pro per day, from the same visits (and so the same earnings
// rules). The overview reads these for long ranges; see the cron.

export function dailyRollup(visits: AVisit[], proId: string) {
  const first = firstVisits(visits);
  const days = new Map<string, { revenue_cents: number; bookings: number; booked_minutes: number; imported_minutes: number; no_shows: number; late_cancels: number; new_clients: number }>();
  const get = (d: string) => {
    let r = days.get(d);
    if (!r) days.set(d, (r = { revenue_cents: 0, bookings: 0, booked_minutes: 0, imported_minutes: 0, no_shows: 0, late_cancels: 0, new_clients: 0 }));
    return r;
  };
  for (const v of visits) {
    if (v.state === "upcoming") continue;
    const r = get(v.date);
    if (v.imported) r.imported_minutes += v.minutes;
    else if (v.state === "done") {
      r.revenue_cents += v.sales;
      r.bookings += 1;
      r.booked_minutes += v.minutes;
    } else if (v.state === "no_show") r.no_shows += 1;
    else if (v.lateCancel) r.late_cancels += 1;
  }
  for (const d of first.values()) get(d).new_clients += 1;
  return [...days.entries()].map(([day, r]) => ({ professional_id: proId, day, ...r }));
}

export function sumRollups(rows: { day: string; revenue_cents: number; bookings: number }[], p: Period) {
  const list = rows.filter((r) => r.day >= p.from && r.day <= p.to);
  return { revenue: sum(list, (r) => r.revenue_cents), bookings: sum(list, (r) => r.bookings) };
}

export const daysBetween = (p: Period) => diffDays(p.to, p.from) + 1;
