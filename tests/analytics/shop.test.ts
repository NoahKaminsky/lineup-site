// Shop Analytics: team, chairs, channels, shared clients, memberships,
// local comparison (minimum 5 shops), alerts and duplicates, the weekly
// push (time zone, opt-in, customers never) and the shop suggestion rules.
import { describe, expect, it } from "vitest";
import { chairs, chairFunnel, channels, leavingShop, localShopCompare, membershipStats, proStats, sharedClients, sortTeam, teamFlags, type ProInput, type ShopVisit } from "@/app/lib/shopAnalyticsMetrics";
import { alertsFor, newAlerts, type AlertInput } from "@/app/lib/analyticsAlerts";
import { inSendWindow, shouldGetWeeklyPush, weekKey, weeklyPushMessage } from "@/app/lib/weeklyPush";
import { shopSuggestions } from "@/app/lib/analyticsInsights";

const TODAY = "2026-11-23";
const v = (proId: string, date: string, sales: number, o: Partial<ShopVisit> = {}): ShopVisit => ({ proId, date, startMin: 600, minutes: 60, clientKey: "c1", service: "Cut", sales, state: date > TODAY ? "upcoming" : "done", ...o });
const tue = [{ dow: 2, startMin: 540, endMin: 1020 }]; // Tuesdays 9-5
const NOV = { from: "2026-11-01", to: "2026-11-30" };
const pro = (id: string, name: string, extra: Partial<ProInput> = {}): ProInput => ({ id, name, open: tue, rating: 4.8, offers: { sent: 4, won: 1 }, ...extra });

describe("team", () => {
  const visits = [v("a", "2026-11-03", 6000, { clientKey: "x" }), v("a", "2026-11-10", 6000, { clientKey: "y" }), v("a", "2026-11-17", 0, { imported: true }), v("b", "2026-11-03", 4000, { minutes: 120, clientKey: "z" }), v("b", "2026-11-10", 0, { state: "no_show", clientKey: "q" })];
  const a = proStats(visits, pro("a", "Jess Test"), NOV);
  const b = proStats(visits, pro("b", "Sam Test"), NOV);
  it("revenue, booked hours, use of open hours, per hour, no-shows, win rate", () => {
    expect(a).toMatchObject({ revenue: 12000, bookings: 2, bookedHours: 2, perHour: 6000, winRate: 25, noShows: 0 });
    expect(a.use).toBe(Math.round((3 * 60 / (4 * 8 * 60)) * 100)); // imported counts as booked time
    expect(b).toMatchObject({ revenue: 4000, bookedHours: 2, perHour: 2000, noShows: 1 });
  });
  it("sorts by any metric", () => {
    expect(sortTeam([a, b], "perHour").map((t) => t.id)).toEqual(["a", "b"]);
    expect(sortTeam([a, b], "noShows").map((t) => t.id)).toEqual(["b", "a"]);
  });
  it("flags only big changes", () => {
    const prev = { ...a, rebook: 62, revenue: 60000 };
    const now = { ...a, rebook: 41 };
    expect(teamFlags([now], [prev], "this month").map((f) => f.text)).toEqual(["Jess's rebook rate dropped from 62% to 41% this month.", "Jess's revenue is down 80% this month."]);
    expect(teamFlags([{ ...a, rebook: 55 }], [{ ...a, rebook: 62 }])).toEqual([]);
  });
});

describe("chairs (one per pro)", () => {
  it("use, revenue per chair-hour, empty hours and the emptiest day", () => {
    const visits = [v("a", "2026-11-03", 8000, { minutes: 120 })];
    const t = proStats(visits, pro("a", "Jess"), NOV);
    const [c] = chairs([t], visits, [pro("a", "Jess")], NOV);
    expect(c).toMatchObject({ revenuePerChairHour: 250, emptyHours: 30, emptiestDay: { dow: 2, emptyPercent: 94 } });
  });
  it("opening funnel", () => {
    expect(chairFunnel([{ id: "o", created_at: "" }], 40, [{ status: "pending" }, { status: "accepted" }])).toEqual({ openings: 1, views: 40, applications: 2, hires: 1 });
  });
});

describe("channels and clients", () => {
  it("walk-ins, phone, online, requests and pros' own links, with revenue", () => {
    const c = channels([v("a", "2026-11-03", 3000, { channel: "walk_in" }), v("a", "2026-11-04", 3000, { channel: "phone" }), v("a", "2026-11-05", 5000, { channel: "online", cameFrom: "booking_link" }), v("a", "2026-11-06", 5000, { channel: "online", cameFrom: "discover" }), v("a", "2026-11-07", 7000, { channel: "request" })], NOV);
    expect(Object.fromEntries(c.map((x) => [x.key, x.revenue]))).toEqual({ walk_in: 3000, phone: 3000, online: 5000, request: 7000, booking_link: 5000 });
  });
  it("clients shared between pros", () => {
    expect(sharedClients([v("a", "2026-10-01", 1, { clientKey: "x" }), v("b", "2026-11-01", 1, { clientKey: "x" }), v("a", "2026-11-02", 1, { clientKey: "y" })])).toEqual({ total: 2, shared: 1, percent: 50 });
  });
  it("a client who moved to another pro isn't leaving the shop", () => {
    const dates = ["2026-06-01", "2026-06-22", "2026-07-13"];
    const moved = [...dates.map((d) => v("a", d, 5000, { clientKey: "m" })), v("b", "2026-11-10", 5000, { clientKey: "m" })];
    const gone = dates.map((d) => v("a", d, 5000, { clientKey: "g" }));
    expect(leavingShop([...moved, ...gone], TODAY).map((c) => c.key)).toEqual(["g"]);
  });
});

describe("memberships", () => {
  const list = [
    { id: "1", customer_id: "u1", status: "active", created_at: "2026-11-05T00:00:00Z", current_period_end: "2026-12-05T00:00:00Z", cancel_at_period_end: false },
    { id: "2", customer_id: "u2", status: "active", created_at: "2026-08-01T00:00:00Z", current_period_end: "2026-12-01T00:00:00Z", cancel_at_period_end: false },
    { id: "3", customer_id: "u3", status: "canceled", created_at: "2026-07-01T00:00:00Z", current_period_end: "2026-11-10T00:00:00Z", cancel_at_period_end: false },
  ];
  it("active, signups, cancellations, rate and idle members", () => {
    const m = membershipStats(list, new Map([["u1", "2026-11-20"], ["u2", "2026-09-01"]]), NOV, TODAY);
    expect(m).toMatchObject({ active: 2, signups: 1, cancelled: 1, cancelRate: 33, idle: 1, idleIds: ["u2"] });
  });
});

describe("local comparison", () => {
  it("hidden below 5 other shops, median only from 5 up", () => {
    expect(localShopCompare({ shops: 4, medianTicket: 5000, medianRebook: 50 }, { avgTicket: 4000, rebook: 40 })).toEqual({ enough: false, shops: 4 });
    expect(localShopCompare({ shops: 5, medianTicket: 5000, medianRebook: 50 }, { avgTicket: 4000, rebook: 40 })).toMatchObject({ enough: true, ticketVs: -20, rebookVs: -10 });
  });
});

describe("alerts", () => {
  const base: AlertInput = { weekRevenue: 50000, usualWeekRevenue: 60000, weekNoShows: 1, usualWeekNoShows: 1, goal: null, weekKey: "2026-11-23" };
  it("fire on a sharp revenue drop, a no-show spike, a rebook drop and a goal", () => {
    expect(alertsFor(base)).toEqual([]);
    const all = alertsFor({ ...base, weekRevenue: 30000, weekNoShows: 4, goal: { reached: true, month: "November" }, rebookDrops: [{ proId: "p", name: "Jess Test", from: 62, to: 41 }, { proId: "q", name: "Sam", from: 50, to: 45 }] });
    expect(all.map((a) => a.key)).toEqual(["revenue_drop:2026-11-23", "no_shows:2026-11-23", "rebook_drop:p:2026-11", "goal:November"]);
    expect(all[0].title).toBe("Revenue is down 50% this week");
  });
  it("small weeks don't trigger the revenue alert", () => {
    expect(alertsFor({ ...base, weekRevenue: 0, usualWeekRevenue: 15000 })).toEqual([]);
  });
  it("never the same alert twice inside its window", () => {
    const a = alertsFor({ ...base, weekRevenue: 10000 });
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(newAlerts(a, [{ key: "revenue_drop:2026-11-23", created_at: "2026-11-23T15:00:00Z" }], now)).toEqual([]);
    expect(newAlerts(a, [{ key: "revenue_drop:2026-11-23", created_at: "2026-11-10T15:00:00Z" }], now)).toHaveLength(1);
    expect(newAlerts(a, [], now)).toHaveLength(1);
  });
});

describe("weekly push", () => {
  it("Monday morning in their own time zone", () => {
    expect(inSendWindow(new Date("2026-11-23T14:00:00Z"), null)).toBe(true); // 8am Winnipeg
    expect(inSendWindow(new Date("2026-11-23T14:00:00Z"), "America/Vancouver")).toBe(true); // 6am
    expect(inSendWindow(new Date("2026-11-23T14:00:00Z"), "America/Halifax")).toBe(true); // 10am
    expect(inSendWindow(new Date("2026-11-23T14:00:00Z"), "Asia/Tokyo")).toBe(false); // 11pm
    expect(inSendWindow(new Date("2026-11-24T14:00:00Z"), null)).toBe(false); // Tuesday
    expect(inSendWindow(new Date("2026-11-23T14:00:00Z"), "Not/AZone")).toBe(true); // falls back to Winnipeg
  });
  it("one key per week, so it's sent once", () => {
    expect(weekKey(new Date("2026-11-23T14:00:00Z"), null)).toBe("2026-11-23");
    expect(weekKey(new Date("2026-11-29T20:00:00Z"), null)).toBe("2026-11-23");
  });
  it("opted-in pros and owners only, never customers", () => {
    expect(shouldGetWeeklyPush({ id: "1", role: "professional", weekly_push_opt_in: true })).toBe(true);
    expect(shouldGetWeeklyPush({ id: "1", role: "professional", weekly_push_opt_in: false })).toBe(false);
    expect(shouldGetWeeklyPush({ id: "1", role: "professional", weekly_push_opt_in: null })).toBe(false);
    expect(shouldGetWeeklyPush({ id: "1", role: "customer", weekly_push_opt_in: true })).toBe(false);
  });
  it("three headline numbers and one suggestion, opening Analytics", () => {
    expect(weeklyPushMessage({ shop: true, revenue: 842000, prevRevenue: 751800, bookings: 120, newClients: 14, suggestion: "11 members haven't visited in 30 days." })).toEqual({
      title: "Your shop made $8,420 last week, up 12%",
      body: "120 bookings, 14 new clients. 11 members haven't visited in 30 days.",
      url: "/studio/analytics",
    });
  });
});

describe("shop suggestion rules", () => {
  it("empty chair, idle members, late rent, leaving clients", () => {
    const s = shopSuggestions({
      chairs: { worst: { name: "Jess", dow: 6, emptyPercent: 60 }, emptyHours: 10 },
      memberships: { active: 20, idle: 11, cancelRate: 5 },
      rent: { late: [{ name: "Sam", cents: 40000 }] },
      clients: { leaving: 4, leavingValue: 20000, sharedPercent: 10 },
    });
    expect(s.map((x) => x.text)).toEqual([
      "Jess's chair is empty 60% of Saturdays. Post a chair opening or send walk-ins their way.",
      "4 regulars are overdue with every pro at the shop, worth about $200 a visit. Reach out before they settle somewhere else.",
      "11 members haven't visited in 30 days. Members who don't use it tend to cancel, so invite them in.",
      "Sam's booth rent is late, $400 in all.",
    ]);
  });
  it("local only when there's enough data", () => {
    expect(shopSuggestions({ local: { enough: false, ticketVs: -30, rebookVs: null } })).toEqual([]);
  });
});
