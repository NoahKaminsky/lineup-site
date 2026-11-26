// Earnings, read a few more ways: over time (with the period before for
// comparison), by service, by how clients paid, by day of the week, tips,
// and a spreadsheet export. Everything is worked out from the same rows as
// the statement, so the totals always agree with it (tests/money/earningsInsights).
import { SERVICE_TYPES, type EarningsRow, type Scope } from "./earningsCore";

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const key = (t: number) => new Date(t).toISOString().slice(0, 10);
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

export const take = (r: EarningsRow, scope: Scope) => (scope === "shop" ? r.toShopCents : r.toProCents);
// A visit that counts: a service that wasn't cancelled and refunded.
const isVisit = (r: EarningsRow) => SERVICE_TYPES.includes(r.type) && r.refundCents === 0;

export function previousRange(from: string, to: string) {
  const days = Math.round((ms(to) - ms(from)) / DAY) + 1;
  return { from: key(ms(from) - days * DAY), to: key(ms(from) - DAY) };
}

export type Bucket = { key: string; label: string; from: string; to: string; cents: number; visits: number };

// Days for up to a month, weeks (Monday start) up to ~3 months, then months.
export function trend(rows: EarningsRow[], from: string, to: string, scope: Scope): Bucket[] {
  const days = Math.round((ms(to) - ms(from)) / DAY) + 1;
  const unit: "day" | "week" | "month" = days <= 31 ? "day" : days <= 95 ? "week" : "month";
  const buckets: Bucket[] = [];
  if (unit === "month") {
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7)) - 1;
    while (key(Date.UTC(y, m, 1)) <= to) {
      const start = key(Date.UTC(y, m, 1));
      const end = key(Date.UTC(y, m + 1, 0));
      buckets.push({
        key: start.slice(0, 7),
        label: new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
        from: start < from ? from : start,
        to: end > to ? to : end,
        cents: 0,
        visits: 0,
      });
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
  } else {
    let t = ms(from);
    if (unit === "week") t -= ((new Date(t).getUTCDay() + 6) % 7) * DAY;
    const step = unit === "week" ? 7 : 1;
    while (key(t) <= to) {
      const start = key(t) < from ? from : key(t);
      const endT = t + (step - 1) * DAY;
      const end = key(endT) > to ? to : key(endT);
      const d = new Date(t);
      buckets.push({
        key: key(t),
        label:
          unit === "day" && days <= 7
            ? d.toLocaleDateString("en-CA", { weekday: "short", timeZone: "UTC" })
            : d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }),
        from: start,
        to: end,
        cents: 0,
        visits: 0,
      });
      t += step * DAY;
    }
  }
  for (const r of rows) {
    const b = buckets.find((x) => r.date >= x.from && r.date <= x.to);
    if (!b) continue;
    b.cents += take(r, scope);
    if (isVisit(r)) b.visits++;
  }
  return buckets;
}

export type PeriodStats = { take: number; visits: number; perVisit: number; serviceSales: number; tips: number; tipRate: number | null; tippedShare: number | null };

export function periodStats(rows: EarningsRow[], scope: Scope): PeriodStats {
  const visits = rows.filter(isVisit);
  const serviceSales = sum(visits, (r) => r.priceCents);
  const tips = sum(visits, (r) => r.tipCents);
  const visitTake = sum(visits, (r) => take(r, scope));
  return {
    take: sum(rows, (r) => take(r, scope)),
    visits: visits.length,
    perVisit: visits.length ? Math.round(visitTake / visits.length) : 0,
    serviceSales,
    tips,
    tipRate: serviceSales > 0 ? Math.round((tips / serviceSales) * 1000) / 10 : null,
    tippedShare: visits.length ? Math.round((visits.filter((r) => r.tipCents > 0).length / visits.length) * 100) : null,
  };
}

// Percent change, or null when there's nothing to compare with.
export function pctChange(now: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((now - prev) / Math.abs(prev)) * 100);
}

export type ServiceLine = { name: string; visits: number; sales: number; take: number; avgPrice: number; share: number };

export function byService(rows: EarningsRow[], scope: Scope, top = 6): ServiceLine[] {
  const map = new Map<string, { name: string; visits: number; sales: number; take: number }>();
  for (const r of rows.filter(isVisit)) {
    const name = (r.item || "Service").trim();
    const k = name.toLowerCase();
    const s = map.get(k) || { name, visits: 0, sales: 0, take: 0 };
    s.visits++;
    s.sales += r.priceCents;
    s.take += take(r, scope);
    map.set(k, s);
  }
  const all = [...map.values()].sort((a, b) => b.take - a.take || b.visits - a.visits);
  const total = sum(all, (s) => s.take) || 1;
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length) head.push({ name: `${rest.length} more`, visits: sum(rest, (s) => s.visits), sales: sum(rest, (s) => s.sales), take: sum(rest, (s) => s.take) });
  return head.map((s) => ({ ...s, avgPrice: s.visits ? Math.round(s.sales / s.visits) : 0, share: Math.round((s.take / total) * 100) }));
}

const PAID_LABEL: Record<EarningsRow["paidVia"], string> = {
  lineup: "Paid on LineUp",
  at_shop: "Paid at the shop",
  cash: "Cash",
  card: "Card (your own reader)",
  etransfer: "E-transfer",
  other: "Other",
};

// What clients paid (price + tip) and how: money in only, no expenses or fees.
export function byPayment(rows: EarningsRow[]) {
  const map = new Map<EarningsRow["paidVia"], number>();
  for (const r of rows) {
    if (r.type === "expense" || r.type === "lineup_plan" || r.refundCents > 0) continue;
    const paid = r.priceCents - r.giftCents + r.tipCents;
    if (paid <= 0) continue;
    map.set(r.paidVia, (map.get(r.paidVia) || 0) + paid);
  }
  const total = sum([...map.values()], (v) => v) || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([via, cents]) => ({ via, label: PAID_LABEL[via], cents, share: Math.round((cents / total) * 100) }));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Take-home by day of the week (Monday first), with the number of visits.
export function byWeekday(rows: EarningsRow[], scope: Scope) {
  const out = WEEKDAYS.map((label) => ({ label, cents: 0, visits: 0 }));
  for (const r of rows) {
    const i = (new Date(`${r.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    out[i].cents += take(r, scope);
    if (isVisit(r)) out[i].visits++;
  }
  return out;
}

// One row per line, for a spreadsheet. Amounts in dollars.
export function earningsCsv(rows: EarningsRow[], scope: Scope) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const d = (c: number) => (c / 100).toFixed(2);
  const head = ["Date", "Type", "Item", "Client", "Pro", "Paid via", "Price", "Tip", "Gift card", "LineUp fees", "Shop's cut", "Refund", scope === "shop" ? "To the shop" : "To you"];
  const lines = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => [r.date, r.type, r.item, r.client, r.proName, PAID_LABEL[r.paidVia], d(r.priceCents), d(r.tipCents), d(r.giftCents), d(r.lineupFeeCents), d(r.toShopCents), d(r.refundCents), d(take(r, scope))].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}
