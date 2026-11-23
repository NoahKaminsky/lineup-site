// CSV for any Analytics section, from the same data the screen shows, so
// the two always match. Money fields are in cents in the data and become
// dollars here; comparisons ({ now, prev }) become two columns.

const MONEY = new Set([
  "revenue", "prevRevenue", "cents", "spent", "cost", "avgTicket", "perHour", "income", "collected", "due", "lateCents", "confirmed", "expected",
  "median", "low", "high", "mine", "spend", "revenuePerChairHour", "paidCents", "dueCents", "lifetimeValue", "atRiskValue", "leavingValue",
  "commission", "boothRent", "memberships", "total", "medianTicket", "neededPerDay", "soFar", "booked", "target", "pace",
]);
const SKIP = new Set(["suggestion", "section", "access", "today", "period", "compare", "ms", "idleIds", "services"]);

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (key: string, v: unknown) => (MONEY.has(key) && typeof v === "number" ? (v / 100).toFixed(2) : v);
const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const isPair = (v: unknown): v is { now: unknown; prev: unknown } => !!v && typeof v === "object" && "now" in (v as object) && "prev" in (v as object);

export function sectionCsv(section: string, data: Record<string, unknown>, header: { name: string; from: string; to: string; compareFrom: string; compareTo: string; money?: boolean }) {
  const lines: string[] = [cell(`${header.name}: ${label(section)}, ${header.from} to ${header.to} (compared with ${header.compareFrom} to ${header.compareTo}). Amounts in Canadian dollars.`), ""];
  const scalars: [string, unknown, unknown][] = [];
  const tables: [string, Record<string, unknown>[]][] = [];
  const nested: [string, Record<string, unknown>][] = [];
  for (const [k, v] of Object.entries(data)) {
    if (SKIP.has(k)) continue;
    // A pair counts as money when its own name is a money field
    // (revenue, avgTicket); counts stay counts.
    if (isPair(v)) scalars.push([k, money(k, v.now), money(k, v.prev)]);
    else if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null && !Array.isArray(v[0])) tables.push([k, v as Record<string, unknown>[]]);
    else if (v && typeof v === "object" && !Array.isArray(v)) nested.push([k, v as Record<string, unknown>]);
    else if (!Array.isArray(v)) scalars.push([k, money(k, v), ""]);
  }
  for (const [k, obj] of nested) for (const [k2, v2] of Object.entries(obj)) if (!SKIP.has(k2) && (typeof v2 !== "object" || v2 === null)) scalars.push([`${k} ${k2}`, money(k2, v2), ""]);
  if (scalars.length) {
    lines.push(["Metric", "This period", "Comparison"].join(","));
    for (const [k, a, b] of scalars) lines.push([label(k), a, b].map(cell).join(","));
  }
  for (const [k, rows] of tables) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !SKIP.has(c) && rows.every((r) => typeof r[c] !== "object" || r[c] === null));
    lines.push("", cell(label(k)), cols.map((c) => cell(label(c))).join(","));
    for (const r of rows) lines.push(cols.map((c) => cell(money(c, r[c]))).join(","));
  }
  return lines.join("\n") + "\n";
}
