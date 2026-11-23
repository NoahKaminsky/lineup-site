// In-app alerts on both Analytics pages: simple thresholds, and the same
// alert is never shown twice inside its window. Every rule is tested in
// tests/analytics/alerts.test.ts.

export type Alert = { key: string; title: string; body: string; windowDays: number };

export type AlertInput = {
  // This week (Mon to today, or the last 7 days) against the usual week
  // (the average of the 4 weeks before).
  weekRevenue: number;
  usualWeekRevenue: number;
  weekNoShows: number;
  usualWeekNoShows: number;
  goal: { reached: boolean; month: string } | null;
  // Shops only: pros whose rebook rate fell.
  rebookDrops?: { proId: string; name: string; from: number; to: number }[];
  weekKey: string; // e.g. "2026-11-23", the Monday of this week
};

const cad = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

export const ALERT_RULES = {
  revenueDropPercent: 30, // this week at least 30% under the usual week
  revenueMinUsual: 20000, // only when the usual week is $200 or more
  noShowSpike: 3, // at least 3 no-shows, and twice the usual
  rebookDropPoints: 15,
};

export function alertsFor(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  if (i.usualWeekRevenue >= ALERT_RULES.revenueMinUsual && i.weekRevenue <= i.usualWeekRevenue * (1 - ALERT_RULES.revenueDropPercent / 100)) {
    const down = Math.round((1 - i.weekRevenue / i.usualWeekRevenue) * 100);
    out.push({ key: `revenue_drop:${i.weekKey}`, title: `Revenue is down ${down}% this week`, body: `${cad(i.weekRevenue)} so far, against a usual week of about ${cad(i.usualWeekRevenue)}.`, windowDays: 7 });
  }
  if (i.weekNoShows >= ALERT_RULES.noShowSpike && i.weekNoShows >= Math.max(i.usualWeekNoShows * 2, 1)) {
    out.push({ key: `no_shows:${i.weekKey}`, title: `${i.weekNoShows} no-shows this week`, body: `${i.usualWeekNoShows < 1 ? "Usually there are none" : `Usually it's about ${Math.round(i.usualWeekNoShows)} a week`}. A no-show fee helps.`, windowDays: 7 });
  }
  for (const d of i.rebookDrops || []) {
    if (d.from - d.to < ALERT_RULES.rebookDropPoints) continue;
    out.push({ key: `rebook_drop:${d.proId}:${i.weekKey.slice(0, 7)}`, title: `${d.name.split(" ")[0]}'s rebook rate dropped`, body: `From ${d.from}% to ${d.to}% this month.`, windowDays: 30 });
  }
  if (i.goal?.reached) out.push({ key: `goal:${i.goal.month}`, title: `Goal reached for ${i.goal.month}`, body: "You hit this month's goal. Nice work.", windowDays: 31 });
  return out;
}

// Drop anything already shown inside its window.
export function newAlerts(candidates: Alert[], history: { key: string; created_at: string }[], now: number) {
  return candidates.filter((a) => !history.some((h) => h.key === a.key && now - Date.parse(h.created_at) < a.windowDays * 86_400_000));
}
