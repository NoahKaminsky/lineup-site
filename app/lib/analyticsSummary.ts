// What goes on the one-page Analytics PDF, picked from the same section
// data the screen shows (so they always match).
import type { SummaryInput } from "./analyticsPdf";

const cad = (cents: number | null | undefined) => `$${Math.round((cents || 0) / 100).toLocaleString("en-CA")}`;
type Pair = { now: number | null; prev: number | null };
const delta = (p: Pair, kind: "percent" | "points" = "percent") => {
  if (p.now === null || p.prev === null) return "No comparison yet";
  if (kind === "points") return p.now === p.prev ? "Same as before" : `${p.now > p.prev ? "Up" : "Down"} ${Math.abs(p.now - p.prev)} pts`;
  if (p.prev === 0) return p.now > 0 ? "New this period" : "None either period";
  const d = Math.round(((p.now - p.prev) / p.prev) * 100);
  return d === 0 ? "Same as before" : `${d > 0 ? "Up" : "Down"} ${Math.abs(d)}%`;
};
const pctOr = (n: number | null) => (n === null ? "–" : `${n}%`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D = Record<string, any>;

export function summaryInput(scope: "me" | "shop", head: { name: string; from: string; to: string; compareLabel: string }, d: { overview: D; forecast: D; mix: D; extra?: D }): SummaryInput {
  const o = d.overview;
  const kpis = [
    { label: "Revenue", value: cad(o.revenue.now), delta: delta(o.revenue) },
    { label: "Bookings", value: String(o.bookings.now), delta: delta(o.bookings) },
    { label: "Average ticket", value: cad(o.avgTicket.now), delta: delta(o.avgTicket) },
    { label: "New clients", value: String(o.newClients.now), delta: delta(o.newClients) },
    { label: "Rebooked", value: pctOr(o.rebook.now), delta: delta(o.rebook, "points") },
    scope === "shop"
      ? { label: "Shop's own income", value: cad(o.own.total), delta: delta({ now: o.own.total, prev: o.ownPrev.total }) }
      : { label: "Next 30 days", value: cad(d.forecast.confirmed + d.forecast.expected), delta: `${cad(d.forecast.confirmed)} confirmed` },
  ];
  const tables: SummaryInput["tables"] = [];
  if (scope === "shop") {
    tables.push({ title: "The shop's own income", rows: [{ label: "Commission from the team", value: cad(o.own.commission) }, { label: "Booth rent", value: cad(o.own.boothRent) }, { label: "Memberships", value: cad(o.own.memberships) }] });
    tables.push({ title: "Bookings by channel", rows: (d.mix.channels as { label: string; count: number; revenue: number }[]).map((c) => ({ label: `${c.label} (${c.count})`, value: cad(c.revenue) })) });
    if (d.extra?.team) tables.push({ title: "Team", rows: (d.extra.team as { name: string; revenue: number; bookings: number }[]).map((t) => ({ label: `${t.name} (${t.bookings} bookings)`, value: cad(t.revenue) })) });
  } else {
    tables.push({ title: "Where bookings come from", rows: (d.mix.sources as { label: string; key: string; count: number; revenue: number }[]).map((x) => ({ label: `${x.key === "not_tracked" ? "Not tracked" : x.label} (${x.count})`, value: cad(x.revenue) })) });
  }
  tables.push({ title: "Next 30 days", rows: [{ label: "Confirmed", value: cad(d.forecast.confirmed) }, { label: "Expected from regulars due back", value: cad(d.forecast.expected) }] });
  const suggestions = [d.overview, d.forecast, d.mix, d.extra].map((x) => x?.suggestion?.text).filter(Boolean) as string[];
  return { scope, ...head, kpis, tables, suggestions };
}
