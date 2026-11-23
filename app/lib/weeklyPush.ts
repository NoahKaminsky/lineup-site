// The opt-in weekly push summary: who gets it, when, and what it says.
// Pure, so the time zone and opt-in rules are tested. Push only: never
// email or SMS, never customers.

export const DEFAULT_TIME_ZONE = "America/Winnipeg";

// Monday, 6am to noon, in the person's own time zone.
export function inSendWindow(now: Date, timeZone: string | null | undefined) {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  }
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return weekday === "Mon" && hour >= 6 && hour < 12;
}

// The Monday this week, in their time zone (the key that stops a repeat).
export function weekKey(now: Date, timeZone: string | null | undefined) {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const local = now.toLocaleDateString("en-CA", { timeZone: tz });
  const d = new Date(`${local}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export type Recipient = { id: string; role: string | null; weekly_push_opt_in: boolean | null };

// Pros and shop owners who turned it on. Customers never.
export function shouldGetWeeklyPush(r: Recipient) {
  const role = String(r.role || "").toLowerCase();
  return r.weekly_push_opt_in === true && !!role && !role.includes("customer");
}

const cad = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

export function weeklyPushMessage(p: { shop: boolean; revenue: number; prevRevenue: number; bookings: number; newClients: number; suggestion: string | null }) {
  const change = p.prevRevenue > 0 ? Math.round(((p.revenue - p.prevRevenue) / p.prevRevenue) * 100) : null;
  const trend = change === null ? "" : change === 0 ? ", same as the week before" : `, ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`;
  const title = `${p.shop ? "Your shop" : "You"} made ${cad(p.revenue)} last week${trend}`;
  const body = `${p.bookings} booking${p.bookings === 1 ? "" : "s"}, ${p.newClients} new client${p.newClients === 1 ? "" : "s"}.${p.suggestion ? ` ${p.suggestion}` : ""}`;
  return { title, body: body.length > 220 ? `${body.slice(0, 217)}...` : body, url: p.shop ? "/studio/analytics" : "/analytics" };
}
