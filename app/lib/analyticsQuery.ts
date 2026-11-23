// Reads the Analytics controls from a request URL: period, custom dates,
// comparison and service filter. Shared by the pro and shop routes.
import { checkPeriod, comparisonFor, periodFor, type CompareMode, type Period, type PeriodKind } from "./analyticsMetrics";

export function readQuery(url: URL, today: string): { error: string } | { period: Period; compare: Period; service: string | null; mode: CompareMode } {
  const kind = (url.searchParams.get("period") || "month") as PeriodKind;
  const period =
    kind === "custom"
      ? { from: url.searchParams.get("from") || "", to: url.searchParams.get("to") || "" }
      : periodFor((["week", "month", "quarter", "year"].includes(kind) ? kind : "month") as Exclude<PeriodKind, "custom">, today);
  const bad = checkPeriod(period, today);
  if (bad) return { error: bad };
  if (period.to > today) period.to = today;
  const mode: CompareMode = url.searchParams.get("compare") === "last_year" ? "last_year" : "previous";
  return { period, compare: comparisonFor(period, mode), service: (url.searchParams.get("service") || "").trim().slice(0, 120) || null, mode };
}

export const bearer = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;
