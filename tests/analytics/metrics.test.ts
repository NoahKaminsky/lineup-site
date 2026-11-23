// Pro Analytics: every metric, the forecast, retention, at-risk, local
// prices (minimum 5), goals, plan access and the suggestion rules.
import { describe, expect, it } from "vitest";
import {
  addDays,
  analyticsAccess,
  atRisk,
  buckets,
  change,
  checkPeriod,
  comparisonFor,
  forecast,
  goalProgress,
  heatmap,
  lifetimeValue,
  localPrice,
  lostBookings,
  openTimeValue,
  overview,
  periodFor,
  rebookRate,
  recurringWords,
  requestStats,
  retentionCohorts,
  revenueSeries,
  sources,
  type AVisit,
} from "@/app/lib/analyticsMetrics";
import {
  calendarRule,
  clientsRule,
  goalsRule,
  overviewRule,
  pricesRule,
  requestsRule,
  suggestions,
} from "@/app/lib/analyticsInsights";

const TODAY = "2026-11-22"; // a Sunday

const v = (date: string, sales: number, o: Partial<AVisit> = {}): AVisit => ({
  date,
  startMin: 600,
  minutes: 60,
  clientKey: "c1",
  service: "Cut",
  sales,
  state: date > TODAY ? "upcoming" : "done",
  ...o,
});

describe("periods", () => {
  it("week starts Monday, month/quarter/year start on the first", () => {
    expect(periodFor("week", TODAY)).toEqual({ from: "2026-11-16", to: TODAY });
    expect(periodFor("month", TODAY)).toEqual({ from: "2026-11-01", to: TODAY });
    expect(periodFor("quarter", TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(periodFor("year", TODAY)).toEqual({ from: "2026-01-01", to: TODAY });
  });
  it("compares with the period before or the same dates last year", () => {
    expect(comparisonFor({ from: "2026-11-01", to: "2026-11-22" }, "previous")).toEqual({ from: "2026-10-10", to: "2026-10-31" });
    expect(comparisonFor({ from: "2026-11-01", to: "2026-11-22" }, "last_year")).toEqual({ from: "2025-11-01", to: "2025-11-22" });
    expect(comparisonFor({ from: "2028-02-29", to: "2028-02-29" }, "last_year")).toEqual({ from: "2027-02-28", to: "2027-02-28" });
  });
  it("checks custom ranges", () => {
    expect(checkPeriod({ from: "2026-11-10", to: "2026-11-01" }, TODAY)).toMatch(/after/);
    expect(checkPeriod({ from: "2026-12-01", to: "2026-12-02" }, TODAY)).toMatch(/up to today/);
    expect(checkPeriod({ from: "2026-01-01", to: "2026-02-01" }, TODAY)).toBeNull();
  });
  it("charts days, weeks or months depending on length", () => {
    expect(buckets({ from: "2026-11-01", to: "2026-11-22" })).toHaveLength(22);
    expect(buckets({ from: "2026-10-01", to: "2026-11-22" })).toHaveLength(8);
    expect(buckets({ from: "2026-01-01", to: "2026-11-22" })).toHaveLength(11);
  });
});

describe("overview", () => {
  const visits = [
    v("2026-11-02", 5000, { clientKey: "a" }),
    v("2026-11-03", 7000, { clientKey: "b" }),
    v("2026-11-04", 0, { clientKey: "c", imported: true }), // imported: booked time, never revenue
    v("2026-11-05", 4000, { clientKey: "d", state: "cancelled" }),
    v("2026-10-20", 3000, { clientKey: "a" }),
    v("2026-12-02", 5000, { clientKey: "b" }),
  ];
  const o = overview(visits, { from: "2026-11-01", to: "2026-11-22" }, { from: "2026-10-10", to: "2026-10-31" });
  it("counts revenue, bookings and average ticket from finished, non-imported visits", () => {
    expect(o.revenue).toEqual({ now: 12000, prev: 3000 });
    expect(o.bookings).toEqual({ now: 2, prev: 1 });
    expect(o.avgTicket.now).toBe(6000);
    expect(change(o.revenue)).toBe(300);
  });
  it("counts new clients by their first ever visit", () => {
    expect(o.newClients).toEqual({ now: 1, prev: 1 }); // b is new in Nov, a was new in Oct
  });
  it("revenue series lines up with the comparison period", () => {
    const s = revenueSeries(visits, { from: "2026-11-01", to: "2026-11-22" }, { from: "2026-10-10", to: "2026-10-31" });
    expect(s.reduce((t, b) => t + b.revenue, 0)).toBe(12000);
    expect(s.reduce((t, b) => t + b.prevRevenue, 0)).toBe(3000);
  });
});

describe("clients", () => {
  // A regular every ~21 days, last seen 50 days ago with nothing booked.
  const regular = ["2026-07-01", "2026-07-22", "2026-08-12", "2026-09-02", "2026-10-03"].map((d) => v(d, 6000, { clientKey: "reg", clientName: "TEST Regular", customerId: "cust-reg" }));
  // Same gap but booked again: not at risk.
  const booked = ["2026-08-01", "2026-08-22", "2026-09-12", "2026-12-01"].map((d) => v(d, 5000, { clientKey: "bk" }));
  // One visit only: not a regular.
  const once = [v("2026-06-01", 9000, { clientKey: "once" })];
  // Long gone (over 8 months): not at risk.
  const gone = ["2025-01-01", "2025-02-01", "2025-03-01"].map((d) => v(d, 5000, { clientKey: "gone" }));

  it("at risk: regulars well past their usual gap with nothing booked", () => {
    const list = atRisk([...regular, ...booked, ...once, ...gone], TODAY);
    expect(list.map((c) => c.key)).toEqual(["reg"]);
    expect(list[0]).toMatchObject({ usualGap: 24, daysSince: 50, avgTicket: 6000, customerId: "cust-reg" });
  });
  it("not at risk inside 1.4x the gap", () => {
    expect(atRisk(regular, "2026-10-30")).toHaveLength(0); // 27 days, gap 24
  });
  it("lifetime value is the average spend per client", () => {
    expect(lifetimeValue([...regular, ...once])).toBe((30000 + 9000) / 2);
  });
  it("retention: share of each month's new clients back within 30, 60, 90 days", () => {
    const visits = [
      v("2026-06-05", 1, { clientKey: "x" }), v("2026-06-25", 1, { clientKey: "x" }), // back in 20 days
      v("2026-06-10", 1, { clientKey: "y" }), v("2026-08-01", 1, { clientKey: "y" }), // back in 52 days
      v("2026-06-15", 1, { clientKey: "z" }), // never back
      v("2026-11-10", 1, { clientKey: "n" }), // too recent to say
    ];
    const r = retentionCohorts(visits, TODAY, 6);
    const june = r.find((m) => m.month === "2026-06")!;
    expect(june).toMatchObject({ newClients: 3, d30: 33, d60: 67, d90: 67 });
    expect(r.find((m) => m.month === "2026-11")).toMatchObject({ newClients: 1, d30: null });
  });
});

describe("forecast", () => {
  it("keeps confirmed and expected apart", () => {
    const visits = [
      v("2026-11-25", 8000, { clientKey: "a" }), // confirmed
      v("2026-12-30", 8000, { clientKey: "a" }), // beyond 30 days
      v("2026-11-24", 0, { clientKey: "imp", imported: true, state: "upcoming" }),
      // A regular every 28 days, last on Nov 5: due Dec 3, nothing booked.
      ...["2026-08-13", "2026-09-10", "2026-10-08", "2026-11-05"].map((d) => v(d, 5000, { clientKey: "due" })),
    ];
    const f = forecast(visits, [{ clientKey: "st", nextDate: "2026-12-01", cents: 4000 }, { clientKey: "a", nextDate: "2026-11-25", cents: 8000 }], TODAY);
    expect(f.confirmed).toBe(8000);
    expect(f.expected).toBe(4000 + 5000); // standing (not already booked) + the due regular
    expect(f.weeks.reduce((s, w) => s + w.confirmed, 0)).toBe(8000);
    expect(f.weeks.reduce((s, w) => s + w.expected, 0)).toBe(9000);
  });
});

describe("calendar", () => {
  const open = [{ dow: 2, startMin: 9 * 60, endMin: 17 * 60 }]; // Tuesdays 9 to 5
  const p = { from: "2026-11-01", to: "2026-11-30" }; // 4 Tuesdays
  const visits = [
    v("2026-11-03", 5000, { startMin: 10 * 60, minutes: 60 }),
    v("2026-11-10", 0, { startMin: 10 * 60, minutes: 60, imported: true }), // booked time
    v("2026-11-17", 5000, { startMin: 9 * 60 + 30, minutes: 60 }),
  ];
  it("heatmap counts open and booked minutes by day and hour, imported included", () => {
    const h = heatmap(visits, open, p);
    expect(h.openMinutes).toBe(4 * 8 * 60);
    expect(h.bookedMinutes).toBe(180);
    expect(h.booked[2][10 - h.hourStart]).toBe(120 + 30);
    expect(h.busiest?.hour).toBe(10);
    expect(h.emptiest?.dow).toBe(2);
  });
  it("time off is skipped", () => {
    expect(heatmap(visits, open, p, new Set(["2026-11-24"])).openMinutes).toBe(3 * 8 * 60);
  });
  it("open time value is free hours times the hourly revenue", () => {
    expect(openTimeValue(600, 120, 10000, 120)).toEqual({ freeHours: 8, perHour: 5000, cents: 40000 });
  });
  it("counts no-shows and late cancellations", () => {
    const l = lostBookings([v("2026-11-02", 5000, { state: "no_show" }), v("2026-11-03", 3000, { state: "cancelled", lateCancel: true }), v("2026-11-04", 3000, { state: "cancelled" }), v("2026-11-05", 3000)], { from: "2026-11-01", to: TODAY });
    expect(l).toMatchObject({ noShows: 1, lateCancels: 1, lostCents: 8000 });
  });
});

describe("sources", () => {
  it("groups revenue by where the booking came from; older ones are not tracked", () => {
    const s = sources([v("2026-11-02", 5000, { cameFrom: "booking_link" }), v("2026-11-03", 7000, { cameFrom: "discover" }), v("2026-11-04", 2000, { cameFrom: null }), v("2026-11-05", 0, { imported: true, cameFrom: "discover" })], { from: "2026-11-01", to: TODAY });
    expect(s.map((x) => [x.key, x.count, x.revenue])).toEqual([["discover", 1, 7000], ["booking_link", 1, 5000], ["not_tracked", 1, 2000]]);
  });
});

describe("requests", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 1) + h * 3_600_000).toISOString();
  it("win rate overall, by response time and by price against the local median", () => {
    const r = requestStats([
      { requestCreatedAt: at(0), offeredAt: at(0.5), won: true, priceCents: 4000, medianCents: 5000 },
      { requestCreatedAt: at(0), offeredAt: at(0.75), won: true, priceCents: 5000, medianCents: 5000 },
      { requestCreatedAt: at(0), offeredAt: at(3), won: false, priceCents: 6000, medianCents: 5000 },
      { requestCreatedAt: at(0), offeredAt: at(10), won: false, priceCents: null, medianCents: null },
    ]);
    expect(r).toMatchObject({ offers: 4, won: 2, rate: 50, medianMinutes: 113 });
    expect(r.bySpeed.map((b) => b.rate)).toEqual([100, 0, 0]);
    expect(r.byPrice.map((b) => b.offers)).toEqual([1, 1, 1]);
  });
});

describe("local prices", () => {
  it("hidden below 5 other pros", () => {
    expect(localPrice([4000, 5000, 6000, 7000], 5000)).toEqual({ enough: false, pros: 4 });
  });
  it("median and range only, from 5 pros up", () => {
    const l = localPrice([4000, 5000, 6000, 7000, 8000], 4500);
    expect(l).toMatchObject({ enough: true, pros: 5, median: 6000, low: 4000, high: 8000, vsMedian: -25 });
    expect(Object.keys(l)).not.toContain("prices");
  });
});

describe("goals", () => {
  it("progress, pace and what's needed per day", () => {
    const visits = [v("2026-11-02", 50000), v("2026-11-20", 50000), v("2026-11-28", 20000)];
    const g = goalProgress("revenue", 200000, visits, TODAY);
    expect(g).toMatchObject({ soFar: 100000, booked: 20000, daysLeft: 8, onTrack: false, percent: 50, neededPerDay: 10000 });
    expect(g.pace).toBe(Math.round((100000 / 22) * 30));
    expect(goalProgress("revenue", 120000, visits, TODAY)).toMatchObject({ onTrack: true, neededPerDay: 0 });
    expect(goalProgress("bookings", 4, visits, TODAY)).toMatchObject({ soFar: 2, booked: 1 });
  });
});

describe("plan access, exactly as plans.ts", () => {
  it("none without a live plan, basic for Apprentice, full for Pro, Master and shop members", () => {
    expect(analyticsAccess({ subscription_plan: null, subscription_status: null })).toBe("none");
    expect(analyticsAccess({ subscription_plan: "pro", subscription_status: "canceled" })).toBe("none");
    expect(analyticsAccess({ subscription_plan: "apprentice", subscription_status: "active" })).toBe("basic");
    expect(analyticsAccess({ subscription_plan: "pro", subscription_status: "trialing" })).toBe("full");
    expect(analyticsAccess({ subscription_plan: "master", subscription_status: "active" })).toBe("full");
    expect(analyticsAccess({ studioMember: true })).toBe("full");
  });
});

describe("reviews", () => {
  it("finds words that come up in more than one review", () => {
    expect(recurringWords(["Super friendly and the fade was clean", "Clean fade, friendly vibe", "Clean lines"]).map((w) => w.word)).toEqual(["clean", "fade", "friendly"]);
  });
});

describe("suggestion rules", () => {
  it("overdue regulars get a one-tap nudge", () => {
    expect(clientsRule({ atRisk: 6, atRiskNudgeable: 6, atRiskValue: 36000 })).toMatchObject({ text: expect.stringContaining("6 regulars are overdue"), action: { do: { kind: "nudge_all" } } });
    expect(clientsRule({ atRisk: 2, atRiskNudgeable: 0, atRiskValue: 1 })?.action).toBeUndefined();
    expect(clientsRule({ atRisk: 0, atRiskNudgeable: 0, atRiskValue: 0 })).toBeNull();
    expect(clientsRule({ atRisk: 7, atRiskNudgeable: 0, atRiskValue: 1, alreadyNudged: 1 })?.text).toBe("1 overdue regular has had a nudge in the last 30 days. The other 6 booked outside LineUp, so give them a call or a text.");
    expect(clientsRule({ atRisk: 7, atRiskNudgeable: 1, atRiskValue: 33000 })?.text).toMatch(/1 of them booked on LineUp and can get a nudge/);
  });
  it("empty hours suggest a boost", () => {
    const s = calendarRule({ emptiest: { dow: 2, hour: 15, open: 240, booked: 0 }, freeHours: 10, openValue: 1, noShows: 0, lateCancels: 0 });
    expect(s?.text).toBe("Tuesdays around 3pm are usually empty. Boost those hours to fill them.");
  });
  it("revenue drop points at overdue clients", () => {
    expect(overviewRule({ revenueChange: -20, bookingsChange: -25, avgTicketChange: 0, rebook: 50 })?.text).toMatch(/down 20%, mostly from fewer bookings/);
    expect(overviewRule({ revenueChange: 2, bookingsChange: 0, avgTicketChange: 0, rebook: 50 })).toBeNull();
  });
  it("fast answers win more requests", () => {
    expect(requestsRule({ offers: 10, winRate: 40, medianMinutes: 90, fastWinRate: 60, slowWinRate: 20, missed: 0 })?.text).toMatch(/60% of requests you answer within an hour/);
  });
  it("prices only when there's enough local data", () => {
    expect(pricesRule({ enough: false, below: "Cut", above: null })).toBeNull();
    expect(pricesRule({ enough: true, below: "Cut", above: null })?.text).toMatch(/Cut is priced well under/);
  });
  it("goals: set one, or what's needed when behind", () => {
    expect(goalsRule({ set: false, onTrack: false, neededPerDay: 0, kind: "revenue", daysLeft: 8 })?.action?.do).toEqual({ kind: "set_goal" });
    expect(goalsRule({ set: true, onTrack: false, neededPerDay: 22500, kind: "revenue", daysLeft: 8 })?.text).toMatch(/\$225 a day/);
  });
  it("one suggestion per section at most", () => {
    const all = suggestions({
      clients: { atRisk: 3, atRiskNudgeable: 3, atRiskValue: 1 },
      goals: { set: false, onTrack: false, neededPerDay: 0, kind: "revenue", daysLeft: 3 },
      overview: { revenueChange: -30, bookingsChange: -30, avgTicketChange: 0, rebook: 20 },
    });
    expect(new Set(all.map((s) => s.section)).size).toBe(all.length);
  });
  it("addDays crosses months", () => expect(addDays("2026-11-30", 1)).toBe("2026-12-01"));
});

describe("rebook rate is fair to recent periods", () => {
  it("counts each visit, so a regular seen often this month counts as rebooked", () => {
    const vv = (key: string, date: string) => ({ date, startMin: 600, minutes: 60, clientKey: key, service: "Cut", sales: 1, state: "done" as const });
    const regular = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map((d) => vv("r", d));
    const once = [vv("o", "2026-10-20")];
    // Three of the regular's visits have a later one; the Nov 23 one is too recent; Oct 20 isn't in November.
    expect(rebookRate([...regular, ...once], { from: "2026-11-01", to: "2026-11-23" }, "2026-11-23")).toBe(100);
    expect(rebookRate([...regular, ...once], { from: "2026-10-01", to: "2026-11-23" }, "2026-11-23")).toBe(75);
  });
  it("clients seen in the last 3 weeks with nothing booked aren't counted yet", () => {
    const vv = (key: string, date: string, state: "done" | "upcoming" = "done") => ({ date, startMin: 600, minutes: 60, clientKey: key, service: "Cut", sales: 1, state });
    const visits = [
      vv("a", "2026-10-05"), vv("a", "2026-11-01"), // came back
      vv("b", "2026-10-10"), vv("b", "2026-11-05"), // came back
      vv("c", "2026-10-20"), vv("c", "2026-12-01", "upcoming"), // booked
      vv("d", "2026-10-08"), // not back
      vv("e", "2026-10-25"), // not back: too soon to tell on Nov 10, counted by Nov 22
    ];
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    expect(rebookRate(visits, oct)).toBe(60); // 3 of 5
    expect(rebookRate(visits, oct, "2026-11-10")).toBe(75); // e left out: 3 of 4
    expect(rebookRate(visits, oct, "2026-11-22")).toBe(60); // e counted: 3 of 5
  });
});
