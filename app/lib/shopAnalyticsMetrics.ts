// Shop Analytics: the pure calculations (team, chairs, channels, shared
// clients, memberships). No database; covered by tests/analytics. Money
// comes in already worked out by the earnings module.

import { addDays, atRisk, diffDays, heatmap, rebookRate, type AVisit, type OpenHours, type Pair, type Period } from "./analyticsMetrics";

export type ShopVisit = AVisit & { proId: string; channel?: "walk_in" | "phone" | "online" | "request" };

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const inP = (v: AVisit, p: Period) => v.date >= p.from && v.date <= p.to;
const done = (v: AVisit) => v.state === "done" && !v.imported;

// ── Team ────────────────────────────────────────────────────────────────

export type ProInput = { id: string; name: string; open: OpenHours; offDays?: Set<string>; rating: number | null; offers: { sent: number; won: number } };

export function proStats(visits: ShopVisit[], pro: ProInput, p: Period) {
  const mine = visits.filter((v) => v.proId === pro.id);
  const worked = mine.filter((v) => done(v) && inP(v, p));
  const h = heatmap(mine, pro.open, p, pro.offDays);
  const revenue = sum(worked, (v) => v.sales);
  const bookedMinutes = sum(worked, (v) => v.minutes);
  return {
    id: pro.id,
    name: pro.name,
    revenue,
    bookings: worked.length,
    bookedHours: Math.round((bookedMinutes / 60) * 10) / 10,
    use: h.openMinutes > 0 ? Math.min(pct(h.bookedMinutes, h.openMinutes) as number, 100) : null,
    perHour: bookedMinutes > 0 ? Math.round(revenue / (bookedMinutes / 60)) : 0,
    rebook: rebookRate(mine, p),
    rating: pro.rating,
    noShows: mine.filter((v) => v.state === "no_show" && inP(v, p)).length,
    winRate: pct(pro.offers.won, pro.offers.sent),
  };
}
export type ProStats = ReturnType<typeof proStats>;

// "Jess's rebook rate dropped from 62% to 41%": only big, meaningful moves.
export function teamFlags(now: ProStats[], prev: ProStats[], periodName = "this period") {
  const flags: { proId: string; text: string }[] = [];
  for (const a of now) {
    const b = prev.find((x) => x.id === a.id);
    if (!b) continue;
    const first = a.name.split(" ")[0];
    if (a.rebook !== null && b.rebook !== null && b.rebook - a.rebook >= 15) flags.push({ proId: a.id, text: `${first}'s rebook rate dropped from ${b.rebook}% to ${a.rebook}% ${periodName}.` });
    if (b.revenue >= 50000 && a.revenue <= b.revenue * 0.7) flags.push({ proId: a.id, text: `${first}'s revenue is down ${Math.round((1 - a.revenue / b.revenue) * 100)}% ${periodName}.` });
    if (a.use !== null && b.use !== null && b.use - a.use >= 20) flags.push({ proId: a.id, text: `${first}'s calendar went from ${b.use}% to ${a.use}% booked ${periodName}.` });
    if (a.noShows >= 3 && a.noShows >= b.noShows * 2) flags.push({ proId: a.id, text: `${first} had ${a.noShows} no-shows ${periodName}, up from ${b.noShows}.` });
  }
  return flags;
}

export const sortTeam = <K extends keyof ProStats>(rows: ProStats[], key: K) =>
  rows.slice().sort((a, b) => (Number(b[key] ?? -1) - Number(a[key] ?? -1)) || a.name.localeCompare(b.name));

// ── Chairs: one chair per pro (their open hours are their chair) ──────────

export function chairs(team: ProStats[], visits: ShopVisit[], pros: ProInput[], p: Period) {
  return team.map((t) => {
    const pro = pros.find((x) => x.id === t.id)!;
    const h = heatmap(visits.filter((v) => v.proId === t.id), pro.open, p, pro.offDays);
    const openHours = h.openMinutes / 60;
    // The weekday whose open hours sit empty most often.
    let worst: { dow: number; empty: number } | null = null;
    for (let dow = 0; dow < 7; dow++) {
      const open = sum(h.open[dow], (m) => m);
      if (open < 120) continue;
      const empty = 1 - Math.min(sum(h.booked[dow], (m) => m) / open, 1);
      if (!worst || empty > worst.empty) worst = { dow, empty };
    }
    return {
      proId: t.id,
      name: t.name,
      use: t.use,
      revenuePerChairHour: openHours > 0 ? Math.round(t.revenue / openHours) : 0,
      emptyHours: Math.round(Math.max(h.openMinutes - h.bookedMinutes, 0) / 60),
      emptiestDay: worst ? { dow: worst.dow, emptyPercent: Math.round(worst.empty * 100) } : null,
    };
  });
}

export function chairFunnel(openings: { id: string; created_at: string }[], views: number, applications: { status: string }[]) {
  return { openings: openings.length, views, applications: applications.length, hires: applications.filter((a) => a.status === "accepted" || a.status === "hired").length };
}

// ── Channels ────────────────────────────────────────────────────────────

export const CHANNEL_LABEL = { walk_in: "Walk-ins", phone: "Phone bookings", online: "Online bookings", request: "Requests passed to pros", booking_link: "Pros' own booking links" } as const;
export type ShopChannel = keyof typeof CHANNEL_LABEL;

export function channelOf(v: ShopVisit): ShopChannel {
  if (v.channel === "walk_in" || v.channel === "phone" || v.channel === "request") return v.channel;
  return v.cameFrom === "booking_link" ? "booking_link" : "online";
}

export function channels(visits: ShopVisit[], p: Period) {
  const map = new Map<ShopChannel, { count: number; revenue: number }>();
  for (const v of visits.filter((x) => done(x) && inP(x, p))) {
    const k = channelOf(v);
    const s = map.get(k) || { count: 0, revenue: 0 };
    s.count++;
    s.revenue += v.sales;
    map.set(k, s);
  }
  return (Object.keys(CHANNEL_LABEL) as ShopChannel[]).map((key) => ({ key, label: CHANNEL_LABEL[key], ...(map.get(key) || { count: 0, revenue: 0 }) }));
}

// ── Clients ─────────────────────────────────────────────────────────────

// Clients who've seen more than one pro at the shop.
export function sharedClients(visits: ShopVisit[]) {
  const pros = new Map<string, Set<string>>();
  for (const v of visits.filter(done)) {
    if (!v.clientKey) continue;
    pros.set(v.clientKey, (pros.get(v.clientKey) || new Set()).add(v.proId));
  }
  const total = pros.size;
  const shared = [...pros.values()].filter((s) => s.size >= 2).length;
  return { total, shared, percent: pct(shared, total) };
}

// At risk of leaving the shop entirely: overdue across every pro (a client
// who moved from one pro to another isn't leaving).
export const leavingShop = (visits: ShopVisit[], today: string) => atRisk(visits, today);

// ── Memberships ─────────────────────────────────────────────────────────

export type MembershipInput = { id: string; customer_id: string; status: string; created_at: string; current_period_end: string | null; cancel_at_period_end: boolean };

export function membershipStats(list: MembershipInput[], lastVisit: Map<string, string>, p: Period, today: string, idleDays = 30) {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const live = (m: MembershipInput) => ["active", "trialing", "past_due"].includes(m.status);
  const active = list.filter(live);
  const signups = list.filter((m) => (day(m.created_at) as string) >= p.from && (day(m.created_at) as string) <= p.to).length;
  // Cancelled: ended (or set to end) in the period.
  const cancelled = list.filter((m) => (m.status === "canceled" || m.cancel_at_period_end) && day(m.current_period_end) && (day(m.current_period_end) as string) >= p.from && (day(m.current_period_end) as string) <= p.to).length;
  const startCount = list.filter((m) => (day(m.created_at) as string) < p.from && (!day(m.current_period_end) || (day(m.current_period_end) as string) >= p.from || live(m))).length;
  const idle = active.filter((m) => {
    const last = lastVisit.get(m.customer_id);
    return !last || diffDays(today, last) >= idleDays;
  });
  return { active: active.length, signups, cancelled, cancelRate: pct(cancelled, startCount + signups), idle: idle.length, idleIds: idle.map((m) => m.customer_id) };
}

// ── Local comparison: shown only from 5 other shops up ───────────────────

export const LOCAL_MIN_SHOPS = 5;
export function localShopCompare(stats: { shops: number; medianTicket: number | null; medianRebook: number | null }, mine: { avgTicket: number; rebook: number | null }) {
  if (stats.shops < LOCAL_MIN_SHOPS || stats.medianTicket === null) return { enough: false as const, shops: stats.shops };
  return {
    enough: true as const,
    shops: stats.shops,
    medianTicket: stats.medianTicket,
    medianRebook: stats.medianRebook,
    ticketVs: Math.round(((mine.avgTicket - stats.medianTicket) / stats.medianTicket) * 100),
    rebookVs: mine.rebook !== null && stats.medianRebook !== null ? mine.rebook - stats.medianRebook : null,
  };
}

export const pairOf = (now: number | null, prev: number | null): Pair => ({ now, prev });
export { addDays };
