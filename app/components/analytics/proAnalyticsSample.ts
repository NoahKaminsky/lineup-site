// Sample numbers for pros whose plan doesn't include Analytics. The page
// labels them clearly as an example; nothing here is anyone's real data.

const weeks = ["Nov 3", "Nov 10", "Nov 17", "Nov 24"];
const grid = (fill: (dow: number, h: number) => number) => Array.from({ length: 7 }, (_, dow) => Array.from({ length: 10 }, (_, h) => fill(dow, h)));
const open = grid((dow) => (dow === 0 || dow === 1 ? 0 : 240));
const booked = grid((dow, h) => (dow === 0 || dow === 1 ? 0 : dow === 2 && h >= 6 ? 30 : dow >= 5 ? 220 : 150));

export const SAMPLE = {
  services: {
    byService: [
      { name: "Skin fade", bookings: 52, revenue: 239200, avgTicket: 4600, perHour: 6133, share: 37, change: 12, cameBack: 71 },
      { name: "Cut and beard", bookings: 31, revenue: 186000, avgTicket: 6000, perHour: 5143, share: 29, change: 4, cameBack: 64 },
      { name: "Kids cut", bookings: 22, revenue: 66000, avgTicket: 3000, perHour: 6000, share: 10, change: -8, cameBack: 82 },
      { name: "Line up", bookings: 13, revenue: 26000, avgTicket: 2000, perHour: 6000, share: 4, change: null, cameBack: 55 },
    ],
    suggestion: null,
  },
  overview: {
    revenue: { now: 642000, prev: 571000 },
    bookings: { now: 118, prev: 109 },
    avgTicket: { now: 5440, prev: 5240 },
    newClients: { now: 21, prev: 17 },
    rebook: { now: 64, prev: 58 },
    rating: { now: 4.9, period: 4.9, prev: 4.8, count: 86 },
    series: weeks.map((label, i) => ({ label, revenue: [148000, 162000, 171000, 161000][i], prevRevenue: [139000, 141000, 150000, 141000][i], bookings: [27, 30, 32, 29][i] })),
    services: ["Example cut", "Example colour"],
    empty: false,
    suggestion: { section: "overview", text: "Revenue is up 12% on the comparison period. Keep your calendar open ahead so the growth has room." },
  },
  forecast: {
    confirmed: 412000, expected: 138000, confirmedCount: 74, expectedCount: 24, emptyDays: 1,
    weeks: weeks.map((label, i) => ({ label, confirmed: [146000, 118000, 92000, 56000][i], expected: [22000, 31000, 39000, 46000][i] })),
    suggestion: { section: "forecast", text: "$1,380 more is likely from regulars who haven't booked yet. Reminding them turns expected into confirmed." },
  },
  clients: {
    newClients: 21, returning: 74, lifetimeValue: 41200, atRiskCount: 6, atRiskValue: 33600,
    retention: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({ month: `x${i}`, label, newClients: [14, 18, 16, 19, 17, 21][i], d30: i < 5 ? [36, 41, 38, 44, 40][i] : null, d60: i < 4 ? [57, 61, 55, 63][i] : null, d90: i < 3 ? [68, 70, 66][i] : null })),
    top: [{ name: "Example client A", spend: 186000, visits: 31 }, { name: "Example client B", spend: 142000, visits: 24 }, { name: "Example client C", spend: 98000, visits: 17 }],
    atRisk: [
      { key: "a", name: "Example client D", customerId: null, last: "2026-09-28", daysSince: 56, usualGap: 28, visits: 9, avgTicket: 6000, nudgedDaysAgo: null },
      { key: "b", name: "Example client E", customerId: null, last: "2026-10-02", daysSince: 52, usualGap: 21, visits: 14, avgTicket: 5500, nudgedDaysAgo: null },
    ],
    suggestion: { section: "clients", text: "6 regulars are overdue, worth about $336 in visits. Send the 6 on LineUp a nudge." },
  },
  calendar: {
    hourStart: 9, hourEnd: 18, open, booked, hasHours: true,
    busiest: { dow: 6, hour: 11, open: 240, booked: 220 }, emptiest: { dow: 2, hour: 15, open: 240, booked: 30 },
    openThisMonth: { freeHours: 34, perHour: 7800, cents: 265200 }, lost: { noShows: 2, lateCancels: 3, lostCents: 27000, rate: 4 },
    suggestion: { section: "calendar", text: "Tuesdays around 3pm are usually empty. Boost those hours to fill them." },
  },
  sources: {
    trackedSince: "2026-11-23",
    sources: [
      { key: "booking_link", label: "Your booking link", revenue: 268000, count: 49 },
      { key: "discover", label: "Discover", revenue: 154000, count: 29 },
      { key: "regular", label: "Regular appointments", revenue: 121000, count: 22 },
      { key: "request", label: "Requests", revenue: 61000, count: 11 },
      { key: "spotlight", label: "Spotlight", revenue: 38000, count: 7 },
    ],
    suggestion: null,
  },
  requests: {
    offers: 32, won: 13, rate: 41, medianMinutes: 74, missed: 9,
    bySpeed: [{ label: "Within an hour", rate: 58, offers: 19 }, { label: "1 to 6 hours", rate: 22, offers: 9 }, { label: "Later", rate: 0, offers: 4 }],
    byPrice: [{ label: "Below the local median", rate: 50, offers: 8 }, { label: "Around it", rate: 45, offers: 15 }, { label: "Above it", rate: 22, offers: 9 }],
    missedByService: [{ label: "Example service", count: 5 }, { label: "Another service", count: 4 }],
    missedByDay: [1, 0, 2, 1, 1, 2, 2],
    suggestion: { section: "requests", text: "You win 58% of requests you answer within an hour, against 17% when you're slower. Turn on request notifications." },
  },
  profile: {
    funnel: { views: 2140, visits: 388, saves: 46, bookings: 61 },
    ratingTrend: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({ label, rating: [4.8, 4.9, 4.8, 5, 4.9, 4.9][i], count: 6 })),
    words: [{ word: "friendly", count: 14 }, { word: "clean", count: 11 }, { word: "detail", count: 7 }],
    suggestion: null,
  },
  boosts: {
    spent: 3998, revenue: 46000,
    boosts: [{ id: "s1", from: "2026-11-01", to: "2026-11-07", cost: 1999, views: 640, visits: 71, bookings: 5, revenue: 27000 }, { id: "s2", from: "2026-10-04", to: "2026-10-10", cost: 1999, views: 512, visits: 48, bookings: 3, revenue: 19000 }],
    suggestion: { section: "boosts", text: "Your boosts brought in $460 for $40. They pay off for you, so boost your quiet days." },
  },
  prices: {
    services: [{ service: "Example cut", mine: 4500, enough: true, median: 5000, low: 3500, high: 7000, vsMedian: -10 }, { service: "Example colour", mine: 14000, enough: true, median: 12500, low: 9000, high: 18000, vsMedian: 12 }],
    suggestion: null,
  },
  goals: {
    set: true, kind: "revenue", target: 700000, soFar: 642000, booked: 46000, percent: 92, pace: 760000, daysLeft: 7, neededPerDay: 1700, onTrack: true,
    suggestion: null,
  },
};
