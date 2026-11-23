// Pro Analytics: the pure calculations behind each section. No database and
// no Stripe, so every number is covered by tests in tests/analytics. Money
// always comes in already worked out by the earnings module
// (app/lib/earningsCore), so Analytics and Earnings never disagree.

export type AVisit = {
  date: string; // YYYY-MM-DD, local
  startMin: number;
  minutes: number;
  clientKey: string | null;
  clientName?: string | null;
  customerId?: string | null; // a LineUp customer (can be nudged)
  service: string;
  sales: number; // cents, from the earnings module; 0 for imported
  state: "done" | "upcoming" | "cancelled" | "no_show";
  lateCancel?: boolean;
  imported?: boolean; // booked time, never revenue
  cameFrom?: string | null;
  createdDate?: string | null;
};

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY);
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// ── Periods ─────────────────────────────────────────────────────────────

export type PeriodKind = "week" | "month" | "quarter" | "year" | "custom";
export type CompareMode = "previous" | "last_year";
export type Period = { from: string; to: string };

// The period up to today: this week (Mon to today), this month, quarter or year.
export function periodFor(kind: Exclude<PeriodKind, "custom">, today: string): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (kind === "week") {
    const dow = new Date(toMs(today)).getUTCDay();
    return { from: addDays(today, -((dow + 6) % 7)), to: today };
  }
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (kind === "quarter") return { from: `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`, to: today };
  return { from: `${y}-01-01`, to: today };
}

const shiftYear = (d: string, n: number) => {
  const y = Number(d.slice(0, 4)) + n;
  const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
  return `${y}-${md}`;
};

// What to compare a period with: the same length just before it, or the
// same dates a year earlier.
export function comparisonFor(p: Period, mode: CompareMode): Period {
  if (mode === "last_year") return { from: shiftYear(p.from, -1), to: shiftYear(p.to, -1) };
  const len = diffDays(p.to, p.from) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function checkPeriod(p: Period, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) return "Pick a start and end date.";
  if (p.from > p.to) return "The start date is after the end date.";
  if (diffDays(p.to, p.from) > 3 * 366) return "Pick three years or less.";
  if (p.from > today) return "Pick dates up to today.";
  return null;
}

// ── Overview ────────────────────────────────────────────────────────────

export type Pair = { now: number | null; prev: number | null };

const inP = (v: AVisit, p: Period) => v.date >= p.from && v.date <= p.to;
const paidDone = (v: AVisit) => v.state === "done" && !v.imported;

export function firstVisits(visits: AVisit[]) {
  const first = new Map<string, string>();
  for (const v of visits) {
    if (!v.clientKey || !paidDone(v)) continue;
    const f = first.get(v.clientKey);
    if (!f || v.date < f) first.set(v.clientKey, v.date);
  }
  return first;
}

// Of the clients seen in a period, the share who already have a later visit
// (done or booked). Needs at least 3 clients to mean anything.
export function rebookRate(visits: AVisit[], p: Period): number | null {
  const last = new Map<string, string>();
  const latest = new Map<string, string>();
  for (const v of visits) {
    if (!v.clientKey || (v.state !== "done" && v.state !== "upcoming")) continue;
    if ((latest.get(v.clientKey) || "") < v.date) latest.set(v.clientKey, v.date);
    if (v.state === "done" && inP(v, p) && (last.get(v.clientKey) || "") < v.date) last.set(v.clientKey, v.date);
  }
  if (last.size < 3) return null;
  let back = 0;
  for (const [k, d] of last) if ((latest.get(k) || "") > d) back++;
  return pct(back, last.size);
}

export function overview(visits: AVisit[], p: Period, cmp: Period) {
  const first = firstVisits(visits);
  const one = (q: Period) => {
    const done = visits.filter((v) => paidDone(v) && inP(v, q));
    const paid = done.filter((v) => v.sales > 0);
    return {
      revenue: sum(done, (v) => v.sales),
      bookings: done.length,
      avgTicket: paid.length ? Math.round(sum(paid, (v) => v.sales) / paid.length) : 0,
      newClients: [...first.values()].filter((d) => d >= q.from && d <= q.to).length,
      rebook: rebookRate(visits, q),
    };
  };
  const a = one(p);
  const b = one(cmp);
  const pair = (k: keyof typeof a): Pair => ({ now: a[k], prev: b[k] });
  return { revenue: pair("revenue"), bookings: pair("bookings"), avgTicket: pair("avgTicket"), newClients: pair("newClients"), rebook: pair("rebook") };
}

// Percent change, or null when there's nothing to compare with.
export function change(p: Pair): number | null {
  if (p.now === null || p.prev === null || p.prev === 0) return null;
  return Math.round(((p.now - p.prev) / p.prev) * 100);
}

// A chart's buckets: days for up to 31 days, weeks up to ~6 months, months after.
export function buckets(p: Period): { label: string; from: string; to: string }[] {
  const len = diffDays(p.to, p.from) + 1;
  const out: { label: string; from: string; to: string }[] = [];
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-CA", { ...o, timeZone: "UTC" });
  if (len <= 31) {
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push({ label: fmt(d, { month: "short", day: "numeric" }), from: d, to: d });
  } else if (len <= 190) {
    for (let d = p.from; d <= p.to; d = addDays(d, 7)) {
      const end = addDays(d, 6) > p.to ? p.to : addDays(d, 6);
      out.push({ label: fmt(d, { month: "short", day: "numeric" }), from: d, to: end });
    }
  } else {
    let d = `${p.from.slice(0, 7)}-01`;
    while (d <= p.to) {
      const next = shiftMonth(d, 1);
      const end = addDays(next, -1);
      out.push({ label: fmt(d, { month: "short", ...(p.from.slice(0, 4) !== p.to.slice(0, 4) ? { year: "2-digit" } : {}) }), from: d < p.from ? p.from : d, to: end > p.to ? p.to : end });
      d = next;
    }
  }
  return out;
}

export function shiftMonth(first: string, n: number) {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

export function revenueSeries(visits: AVisit[], p: Period, cmp: Period) {
  const shift = diffDays(p.from, cmp.from);
  return buckets(p).map((b) => {
    const now = visits.filter((v) => paidDone(v) && v.date >= b.from && v.date <= b.to);
    const before = visits.filter((v) => paidDone(v) && v.date >= addDays(b.from, -shift) && v.date <= addDays(b.to, -shift));
    return { label: b.label, revenue: sum(now, (v) => v.sales), bookings: now.length, prevRevenue: sum(before, (v) => v.sales) };
  });
}

// ── Clients ─────────────────────────────────────────────────────────────

export type ClientStats = { key: string; name: string; customerId: string | null; dates: string[]; spend: number };

export function clientStats(visits: AVisit[]): ClientStats[] {
  const map = new Map<string, ClientStats>();
  for (const v of visits.filter(paidDone).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!v.clientKey) continue;
    const c = map.get(v.clientKey) || { key: v.clientKey, name: v.clientName || "Client", customerId: null, dates: [], spend: 0 };
    c.dates.push(v.date);
    c.spend += v.sales;
    if (v.customerId) c.customerId = v.customerId;
    if (v.clientName) c.name = v.clientName;
    map.set(v.clientKey, c);
  }
  return [...map.values()];
}

export function usualGap(dates: string[]): number | null {
  if (dates.length < 2) return null;
  return Math.max(Math.round(diffDays(dates[dates.length - 1], dates[0]) / (dates.length - 1)), 1);
}

// A regular (2+ visits) is at risk once they're well past their usual gap
// (40% over, and at least a week) with nothing booked. Past 8 months they're
// counted as gone, not at risk.
export function isOverdue(daysSince: number, gap: number | null) {
  if (!gap) return false;
  return daysSince > Math.max(gap * 1.4, gap + 7) && daysSince <= 240;
}

export function atRisk(visits: AVisit[], today: string) {
  const booked = new Set(visits.filter((v) => v.state === "upcoming" && v.clientKey).map((v) => v.clientKey as string));
  return clientStats(visits)
    .map((c) => {
      const last = c.dates[c.dates.length - 1];
      const gap = usualGap(c.dates);
      const daysSince = diffDays(today, last);
      return { key: c.key, name: c.name, customerId: c.customerId, last, daysSince, usualGap: gap, visits: c.dates.length, avgTicket: Math.round(c.spend / c.dates.length), spend: c.spend };
    })
    .filter((c) => !booked.has(c.key) && isOverdue(c.daysSince, c.usualGap))
    .sort((a, b) => b.spend - a.spend);
}

// For each month's new clients, the share who came back within 30, 60 and
// 90 days of their first visit. A window that hasn't fully passed is null.
export function retentionCohorts(visits: AVisit[], today: string, months = 6) {
  const stats = clientStats(visits);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const out: { month: string; label: string; newClients: number; d30: number | null; d60: number | null; d90: number | null }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = shiftMonth(thisMonth, -i);
    const end = addDays(shiftMonth(start, 1), -1);
    const cohort = stats.filter((c) => c.dates[0] >= start && c.dates[0] <= end);
    const within = (days: number) => {
      // Only clients whose window has fully passed count.
      const ready = cohort.filter((c) => addDays(c.dates[0], days) <= today);
      if (!ready.length || ready.length < cohort.length) return null;
      return pct(ready.filter((c) => c.dates.some((d) => d > c.dates[0] && diffDays(d, c.dates[0]) <= days)).length, ready.length);
    };
    out.push({
      month: start.slice(0, 7),
      label: new Date(`${start}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
      newClients: cohort.length,
      d30: within(30),
      d60: within(60),
      d90: within(90),
    });
  }
  return out;
}

// Average spend per client over everything they've booked.
export function lifetimeValue(visits: AVisit[]) {
  const stats = clientStats(visits);
  return stats.length ? Math.round(sum(stats, (c) => c.spend) / stats.length) : 0;
}

// ── Forecast: the next 30 days ──────────────────────────────────────────
// Confirmed: bookings already made. Expected: standing appointments that
// haven't made a booking yet, and regulars due back by their usual gap who
// have nothing booked, each at their average ticket.

export type Standing = { clientKey: string | null; nextDate: string | null; cents: number };

export function forecast(visits: AVisit[], standing: Standing[], today: string, days = 30) {
  const end = addDays(today, days);
  const upcoming = visits.filter((v) => v.state === "upcoming" && !v.imported && v.date > today && v.date <= end);
  const confirmed = sum(upcoming, (v) => v.sales);
  const bookedKeys = new Set(visits.filter((v) => v.state === "upcoming" && v.clientKey).map((v) => v.clientKey as string));

  const fromStanding = standing.filter((s) => s.nextDate && s.nextDate > today && s.nextDate <= end && !(s.clientKey && bookedKeys.has(s.clientKey)));
  const standingKeys = new Set(fromStanding.map((s) => s.clientKey).filter(Boolean) as string[]);

  const due = clientStats(visits)
    .map((c) => {
      const gap = usualGap(c.dates);
      const last = c.dates[c.dates.length - 1];
      return { c, gap, dueOn: gap ? addDays(last, gap) : null, daysSince: diffDays(today, last) };
    })
    .filter((x) => x.gap && x.dueOn && !bookedKeys.has(x.c.key) && !standingKeys.has(x.c.key) && x.dueOn <= end && !isOverdue(x.daysSince, x.gap) && x.daysSince <= 240);

  const expectedStanding = sum(fromStanding, (s) => s.cents);
  const expectedDue = sum(due, (x) => Math.round(x.c.spend / x.c.dates.length));
  const weeks = [0, 1, 2, 3].map((w) => {
    const a = addDays(today, w * 7 + 1);
    const b = w === 3 ? end : addDays(today, w * 7 + 7);
    return {
      label: new Date(`${a}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }),
      confirmed: sum(upcoming.filter((v) => v.date >= a && v.date <= b), (v) => v.sales),
      expected:
        sum(fromStanding.filter((s) => (s.nextDate as string) >= a && (s.nextDate as string) <= b), (s) => s.cents) +
        sum(due.filter((x) => (x.dueOn as string) >= a && (x.dueOn as string) <= b), (x) => Math.round(x.c.spend / x.c.dates.length)),
    };
  });
  // Clients already overdue land in the first week if they come back.
  return { confirmed, expected: expectedStanding + expectedDue, confirmedCount: upcoming.length, expectedCount: fromStanding.length + due.length, weeks };
}

// ── Calendar ────────────────────────────────────────────────────────────

export type OpenHours = { dow: number; startMin: number; endMin: number }[];

// Booked and open minutes by weekday and hour, for the heatmap. Imported
// appointments count as booked time.
export function heatmap(visits: AVisit[], open: OpenHours, p: Period, offDays: Set<string> = new Set()) {
  let hourStart = 23;
  let hourEnd = 0;
  for (const o of open) {
    hourStart = Math.min(hourStart, Math.floor(o.startMin / 60));
    hourEnd = Math.max(hourEnd, Math.ceil(o.endMin / 60) - 1);
  }
  const counted = visits.filter((v) => inP(v, p) && (v.state === "done" || v.state === "upcoming"));
  for (const v of counted) {
    hourStart = Math.min(hourStart, Math.floor(v.startMin / 60));
    hourEnd = Math.max(hourEnd, Math.floor((v.startMin + Math.max(v.minutes, 1) - 1) / 60));
  }
  if (hourStart > hourEnd) [hourStart, hourEnd] = [9, 17];
  const hours = hourEnd - hourStart + 1;
  const booked = Array.from({ length: 7 }, () => Array(hours).fill(0) as number[]);
  const openMin = Array.from({ length: 7 }, () => Array(hours).fill(0) as number[]);

  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    if (offDays.has(d)) continue;
    const dow = new Date(toMs(d)).getUTCDay();
    for (const o of open.filter((x) => x.dow === dow)) {
      for (let h = 0; h < hours; h++) {
        const a = Math.max(o.startMin, (hourStart + h) * 60);
        const b = Math.min(o.endMin, (hourStart + h + 1) * 60);
        if (b > a) openMin[dow][h] += b - a;
      }
    }
  }
  for (const v of counted) {
    const dow = new Date(toMs(v.date)).getUTCDay();
    for (let h = 0; h < hours; h++) {
      const a = Math.max(v.startMin, (hourStart + h) * 60);
      const b = Math.min(v.startMin + v.minutes, (hourStart + h + 1) * 60);
      if (b > a) booked[dow][h] += b - a;
    }
  }
  const cells: { dow: number; hour: number; booked: number; open: number }[] = [];
  for (let dow = 0; dow < 7; dow++) for (let h = 0; h < hours; h++) cells.push({ dow, hour: hourStart + h, booked: booked[dow][h], open: openMin[dow][h] });
  const withOpen = cells.filter((c) => c.open >= 60);
  const rate = (c: (typeof cells)[number]) => Math.min(c.booked / c.open, 1);
  return {
    hourStart,
    hourEnd,
    booked,
    open: openMin,
    busiest: withOpen.slice().sort((a, b) => rate(b) - rate(a) || b.booked - a.booked)[0] || null,
    emptiest: withOpen.slice().sort((a, b) => rate(a) - rate(b) || b.open - a.open)[0] || null,
    openMinutes: sum(cells, (c) => c.open),
    bookedMinutes: Math.min(sum(cells, (c) => c.booked), sum(cells, (c) => c.open) || Infinity),
  };
}

// Unbooked open hours times what the pro makes in an hour of work.
export function openTimeValue(openMinutes: number, bookedMinutes: number, revenue: number, workedMinutes: number) {
  const free = Math.max(openMinutes - bookedMinutes, 0);
  const perHour = workedMinutes > 0 ? Math.round(revenue / (workedMinutes / 60)) : 0;
  return { freeHours: Math.round((free / 60) * 10) / 10, perHour, cents: Math.round((free / 60) * perHour) };
}

export function lostBookings(visits: AVisit[], p: Period) {
  const list = visits.filter((v) => inP(v, p) && !v.imported);
  const noShows = list.filter((v) => v.state === "no_show");
  const late = list.filter((v) => v.state === "cancelled" && v.lateCancel);
  return { noShows: noShows.length, lateCancels: late.length, lostCents: sum([...noShows, ...late], (v) => v.sales), rate: pct(noShows.length + late.length, list.filter((v) => v.state !== "upcoming" && v.state !== "cancelled").length + late.length) };
}

// ── Where bookings come from ────────────────────────────────────────────

export const SOURCE_LABEL: Record<string, string> = {
  booking_link: "Your booking link",
  discover: "Discover",
  request: "Requests",
  spotlight: "Spotlight",
  boost: "Boosts",
  referral: "Referrals",
  gift_card: "Gift cards",
  regular: "Regular appointments",
  front_desk: "Walk-ins and phone",
  not_tracked: "Not tracked",
};

export function sources(visits: AVisit[], p: Period) {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const v of visits.filter((x) => paidDone(x) && inP(x, p))) {
    const k = v.cameFrom && v.cameFrom in SOURCE_LABEL ? v.cameFrom : "not_tracked";
    const s = map.get(k) || { count: 0, revenue: 0 };
    s.count++;
    s.revenue += v.sales;
    map.set(k, s);
  }
  return [...map.entries()].map(([key, s]) => ({ key, label: SOURCE_LABEL[key], ...s })).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

// ── Requests ────────────────────────────────────────────────────────────

export type OfferInput = { requestCreatedAt: string; offeredAt: string; won: boolean; priceCents: number | null; medianCents: number | null };

const median = (list: number[]) => {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function requestStats(offers: OfferInput[]) {
  const minutes = offers.map((o) => Math.max(Math.round((Date.parse(o.offeredAt) - Date.parse(o.requestCreatedAt)) / 60000), 0));
  const rate = (list: OfferInput[]) => ({ offers: list.length, won: list.filter((o) => o.won).length, rate: pct(list.filter((o) => o.won).length, list.length) });
  const speed = [
    { label: "Within an hour", test: (m: number) => m <= 60 },
    { label: "1 to 6 hours", test: (m: number) => m > 60 && m <= 360 },
    { label: "Later", test: (m: number) => m > 360 },
  ].map((b) => ({ label: b.label, ...rate(offers.filter((_, i) => b.test(minutes[i]))) }));
  const priced = offers.filter((o) => o.priceCents && o.medianCents);
  const price = [
    { label: "Below the local median", test: (o: OfferInput) => (o.priceCents as number) < (o.medianCents as number) * 0.95 },
    { label: "Around it", test: (o: OfferInput) => Math.abs((o.priceCents as number) - (o.medianCents as number)) <= (o.medianCents as number) * 0.05 },
    { label: "Above it", test: (o: OfferInput) => (o.priceCents as number) > (o.medianCents as number) * 1.05 },
  ].map((b) => ({ label: b.label, ...rate(priced.filter(b.test)) }));
  return { ...rate(offers), medianMinutes: median(minutes), bySpeed: speed, byPrice: price };
}

// ── Local prices ────────────────────────────────────────────────────────
// Only ever the median and range, and only once at least 5 other pros in
// the same trade and city have a price for the service.

export const LOCAL_MIN_PROS = 5;

export function localPrice(otherProsPrices: number[], mine: number | null) {
  if (otherProsPrices.length < LOCAL_MIN_PROS) return { enough: false as const, pros: otherProsPrices.length };
  const s = otherProsPrices.slice().sort((a, b) => a - b);
  const med = median(s) as number;
  return {
    enough: true as const,
    pros: s.length,
    median: med,
    low: s[Math.floor((s.length - 1) * 0.1)],
    high: s[Math.ceil((s.length - 1) * 0.9)],
    mine,
    vsMedian: mine ? Math.round(((mine - med) / med) * 100) : null,
  };
}

// ── Goals ───────────────────────────────────────────────────────────────

export type GoalKind = "revenue" | "bookings";

export function goalProgress(kind: GoalKind, target: number, visits: AVisit[], today: string) {
  const from = `${today.slice(0, 7)}-01`;
  const end = addDays(shiftMonth(from, 1), -1);
  const value = (list: AVisit[]) => (kind === "revenue" ? sum(list, (v) => v.sales) : list.length);
  const soFar = value(visits.filter((v) => paidDone(v) && v.date >= from && v.date <= today));
  const booked = value(visits.filter((v) => v.state === "upcoming" && !v.imported && v.date > today && v.date <= end));
  const elapsed = diffDays(today, from) + 1;
  const monthDays = diffDays(end, from) + 1;
  const daysLeft = monthDays - elapsed;
  const pace = Math.round((soFar / elapsed) * monthDays);
  const needed = Math.max(target - soFar - booked, 0);
  return {
    kind,
    target,
    soFar,
    booked,
    pace,
    daysLeft,
    neededPerDay: daysLeft > 0 ? Math.ceil(needed / daysLeft) : needed,
    onTrack: soFar + booked >= target || pace >= target,
    percent: target > 0 ? Math.min(Math.round((soFar / target) * 100), 100) : 0,
  };
}

// ── Plans ───────────────────────────────────────────────────────────────
// Exactly as app/lib/plans.ts lists them: no paid plan, no Analytics;
// Apprentice gets "Basic analytics" (the overview and its chart); Pro and
// Master get "Full analytics". Shop members get Pro features from the shop.

export type AnalyticsAccess = "none" | "basic" | "full";

export function analyticsAccess(p: { subscription_plan?: string | null; subscription_status?: string | null; studioMember?: boolean }): AnalyticsAccess {
  if (p.studioMember) return "full";
  const live = p.subscription_status === "active" || p.subscription_status === "trialing";
  if (!live) return "none";
  if (p.subscription_plan === "pro" || p.subscription_plan === "master") return "full";
  if (p.subscription_plan === "apprentice") return "basic";
  return "none";
}

// ── Reviews: recurring words ────────────────────────────────────────────

const STOP = new Set(
  "a an and are as at be been but by did do for from had has have he her his i if in is it its just me my of on or our she so that the their them they this to too us very was we were what when which who will with would you your really great good best amazing always again get got go went made make one also all can could than then there here been being am im ive dont didnt".split(" ")
);

export function recurringWords(reviews: string[], top = 8) {
  const counts = new Map<string, number>();
  for (const text of reviews) {
    const words = new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s']/g, " ")
        .replace(/'/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w))
    );
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([word, count]) => ({ word, count }));
}
