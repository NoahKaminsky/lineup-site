// Sample numbers for shops without a Studio plan. The page labels them
// clearly as an example; nothing here is anyone's real data.

const team = [
  { id: "a", name: "Example pro A", revenue: 412000, bookings: 71, bookedHours: 88, use: 78, perHour: 4680, rebook: 64, rating: 4.9, noShows: 1, winRate: 45 },
  { id: "b", name: "Example pro B", revenue: 298000, bookings: 58, bookedHours: 70, use: 61, perHour: 4260, rebook: 41, rating: 4.7, noShows: 3, winRate: 30 },
  { id: "c", name: "Example pro C", revenue: 132000, bookings: 26, bookedHours: 33, use: 39, perHour: 4000, rebook: 55, rating: 4.8, noShows: 0, winRate: null },
];

export const SHOP_SAMPLE = {
  overview: {
    revenue: { now: 842000, prev: 751800 },
    bookings: { now: 155, prev: 141 },
    avgTicket: { now: 5430, prev: 5330 },
    newClients: { now: 24, prev: 19 },
    rebook: { now: 58, prev: 61 },
    own: { commission: 126000, boothRent: 80000, memberships: 39000, total: 245000 },
    ownPrev: { total: 228000 },
    series: ["Nov 3", "Nov 10", "Nov 17", "Nov 24"].map((label, i) => ({ label, revenue: [201000, 219000, 228000, 194000][i], prevRevenue: [180000, 188000, 196000, 187800][i], bookings: [37, 40, 42, 36][i] })),
    services: ["Example cut", "Example colour"],
    pros: 3,
    empty: false,
    suggestion: { section: "shop_overview", text: "The shop's revenue is up 12%. Make sure every pro's hours are open far enough ahead to keep it going." },
  },
  team: { team, prev: team, flags: [{ proId: "b", text: "Example pro B's rebook rate dropped from 62% to 41% against the comparison period." }], suggestion: null },
  chairs: {
    chairs: team.map((t, i) => ({ proId: t.id, name: t.name, use: t.use, revenuePerChairHour: [3650, 2600, 1560][i], emptyHours: [25, 45, 52][i], emptiestDay: { dow: [2, 6, 3][i], emptyPercent: [40, 60, 70][i] } })),
    funnel: { openings: 1, views: 86, applications: 5, hires: 1 },
    suggestion: { section: "chairs", text: "Example pro C's chair is empty 70% of Wednesdays. Post a chair opening or send walk-ins their way." },
  },
  channels: {
    channels: [
      { key: "walk_in", label: "Walk-ins", count: 48, revenue: 228000 },
      { key: "phone", label: "Phone bookings", count: 17, revenue: 91000 },
      { key: "online", label: "Online bookings", count: 63, revenue: 352000 },
      { key: "request", label: "Requests passed to pros", count: 9, revenue: 61000 },
      { key: "booking_link", label: "Pros' own booking links", count: 18, revenue: 110000 },
    ],
    suggestion: null,
  },
  clients: {
    newClients: 24, returning: 98, shared: { total: 310, shared: 41, percent: 13 }, leavingCount: 9, leavingValue: 49000,
    retention: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({ label, newClients: [18, 22, 20, 25, 21, 24][i], d30: i < 5 ? [38, 42, 36, 45, 40][i] : null, d60: i < 4 ? [55, 60, 52, 63][i] : null, d90: i < 3 ? [66, 70, 64][i] : null })),
    leaving: [{ key: "x", name: "Example client", last: "2026-09-02", daysSince: 82, usualGap: 28, avgTicket: 6000 }],
    suggestion: { section: "shop_clients", text: "9 regulars are overdue with every pro at the shop, worth about $490 a visit. Reach out before they settle somewhere else." },
  },
  memberships: { active: 26, income: 39000, signups: 4, cancelled: 1, cancelRate: 4, idle: 11, suggestion: { section: "memberships", text: "11 members haven't visited in 30 days. Members who don't use it tend to cancel, so invite them in." } },
  rent: {
    rent: [{ proId: "c", name: "Example pro C", paidCents: 80000, dueCents: 80000, dueDate: "2026-12-01", late: false, interval: "month" }],
    collected: 80000, due: 80000, lateCents: 0, suggestion: null,
  },
  forecast: {
    confirmed: 512000, expected: 141000, confirmedCount: 96, expectedCount: 27,
    weeks: ["Nov 24", "Dec 1", "Dec 8", "Dec 15"].map((label, i) => ({ label, confirmed: [181000, 152000, 110000, 69000][i], expected: [21000, 33000, 40000, 47000][i] })),
    suggestion: null,
  },
  local: { enough: true, shops: 7, medianTicket: 5800, medianRebook: 55, ticketVs: -6, rebookVs: 3, mine: { avgTicket: 5430, rebook: 58 }, suggestion: null },
};
