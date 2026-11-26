"use client";

// A pro's Analytics: where the money comes from, who's slipping away, where
// the calendar loses money, and one thing to do about each. Every section
// loads on its own from /api/analytics/pro, so the page fills in quickly.
// No money is worked out here: the numbers come from the server, which uses
// the same earnings rules as the Earnings page.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bell, Download, FileText, Lock, RotateCw, Send } from "lucide-react";
import { studioFetch } from "@/app/studio/studioApi";
import { Button, Segmented, buttonClass, fieldClass, panelClass } from "@/app/studio/ui";
import type { Suggestion } from "@/app/lib/analyticsInsights";
import { SAMPLE } from "./proAnalyticsSample";

type PeriodKind = "week" | "month" | "quarter" | "year" | "custom";
type Compare = "previous" | "last_year";
export type Query = { period: PeriodKind; from: string; to: string; compare: Compare; service: string };
type Pair = { now: number | null; prev: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Record<string, any> & { suggestion?: Suggestion | null; locked?: boolean };

export const cad = (cents: number | null | undefined) => `$${Math.round((cents || 0) / 100).toLocaleString("en-CA")}`;
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "p" : "a"}`;
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

export function qs(q: Query) {
  const p = new URLSearchParams({ period: q.period, compare: q.compare });
  if (q.period === "custom") {
    p.set("from", q.from);
    p.set("to", q.to);
  }
  if (q.service) p.set("service", q.service);
  return p.toString();
}

// Where each section's CSV downloads from (null when there's nothing to download, e.g. the example).
export const CsvLinks = createContext<(section: string) => string | null>(() => null);

// One section's data: loading, error with retry, or locked for the plan.
export function useSection(name: string, q: Query, tick: number, sample: boolean, base = "/api/analytics/pro", sampleData: Record<string, Data> = SAMPLE as Record<string, Data>) {
  const [state, setState] = useState<{ key: string; data: Data | null; error: string | null; needsPlan?: boolean }>({ key: "", data: null, error: null });
  const key = `${name}?${qs(q)}#${tick}`;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (sample) return;
    let live = true;
    studioFetch<Data & { error?: string; needsPlan?: boolean }>(`${base}?section=${name}&${qs(q)}`).then((res) => {
      if (!live) return;
      if (!res.ok || res.data.needsPlan) setState({ key, data: null, error: res.data.error || "Could not load this section.", needsPlan: res.data.needsPlan });
      else setState({ key, data: res.data, error: null });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry, sample]);
  if (sample) return { data: sampleData[name], locked: false, error: null, needsPlan: false, loading: false, retry: () => {} };
  const current = state.key === key ? state : null;
  // Locked for this plan: no data, just the lock message.
  const locked = !!current?.data?.locked;
  return { data: locked ? null : current?.data || null, locked, error: current?.error || null, needsPlan: current?.needsPlan, loading: !current, retry: () => setRetry((n) => n + 1) };
}

// ── Small pieces ─────────────────────────────────────────────────────────

export function Delta({ pair, kind = "percent" }: { pair: Pair; kind?: "percent" | "points" }) {
  if (pair.now === null || pair.prev === null) return <span className="text-neutral-400">No comparison yet</span>;
  if (kind === "percent" && pair.prev === 0) return pair.now > 0 ? <span className="text-neutral-500">New this period</span> : <span className="text-neutral-400">None either period</span>;
  const diff = kind === "percent" ? Math.round(((pair.now - pair.prev) / pair.prev) * 100) : Math.round(pair.now - pair.prev);
  if (diff === 0) return <span className="text-neutral-500">Same as before</span>;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-ink">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(diff)}
      {kind === "percent" ? "%" : " pts"}
      <span className="font-normal text-neutral-500">&nbsp;vs before</span>
    </span>
  );
}

export function Card({ id, title, headline, sub, children, suggestion, onAction, state, className = "", csv }: {
  id: string;
  title: string;
  headline?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  suggestion?: Suggestion | null;
  onAction?: (s: Suggestion) => void;
  state: { loading: boolean; error: string | null; locked?: boolean; retry: () => void };
  className?: string;
  csv?: string | null; // download link for this section
}) {
  const csvFor = useContext(CsvLinks);
  csv = csv === undefined ? csvFor(id) : csv;
  return (
    <section id={id} className={`${panelClass} scroll-mt-24 p-5 ${className}`} aria-busy={state.loading}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {csv && !state.loading && !state.error && !state.locked ? (
          <a href={csv} download className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-neutral-500 hover:text-ink sm:min-h-0" aria-label={`Download ${title} as CSV`}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
          </a>
        ) : null}
      </div>
      {state.loading ? (
        <div className="mt-4 space-y-3" aria-label="Loading">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-28 animate-pulse rounded-xl bg-neutral-100" />
        </div>
      ) : state.error ? (
        <div className="mt-3">
          <p className="text-sm text-neutral-600">{state.error}</p>
          <Button className="mt-3" onClick={state.retry}>
            <RotateCw className="h-4 w-4" aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : state.locked ? (
        <div className="mt-3 flex items-start gap-2 text-sm text-neutral-600">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Part of full analytics on Pro and Master.{" "}
            <Link href="/subscription" className="font-medium text-ink underline underline-offset-2">
              See plans
            </Link>
          </p>
        </div>
      ) : (
        <>
          {headline !== undefined ? <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{headline}</p> : null}
          {sub ? <p className="mt-1 text-sm text-neutral-500">{sub}</p> : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {suggestion ? (
            <div className="mt-4 flex flex-col gap-3 rounded-xl bg-neutral-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-neutral-700">{suggestion.text}</p>
              {suggestion.action ? (
                suggestion.action.do.kind === "link" ? (
                  <Link href={suggestion.action.do.href} className={`${buttonClass("primary", "sm")} shrink-0`}>
                    {suggestion.action.label}
                  </Link>
                ) : (
                  <Button variant="primary" size="sm" className="shrink-0" onClick={() => onAction?.(suggestion)}>
                    {suggestion.action.label}
                  </Button>
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function Bars({ rows, format = cad, max }: { rows: { label: string; value: number; note?: string }[]; format?: (n: number) => string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-neutral-700">{r.label}</span>
            <span className="shrink-0 tabular-nums text-ink">
              {format(r.value)}
              {r.note ? <span className="ml-1.5 text-xs text-neutral-500">{r.note}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max((r.value / top) * 100, r.value > 0 ? 2 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Revenue per bucket, with the comparison period as a lighter bar.
export function RevenueChart({ data, compareLabel }: { data: { label: string; revenue: number; prevRevenue: number; bookings: number }[]; compareLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => Math.max(d.revenue, d.prevRevenue)), 1);
  const H = 120;
  const step = 100 / data.length;
  const shown = active ?? data.length - 1;
  const d = data[shown];
  const every = data.length > 12 ? Math.ceil(data.length / 6) : 1;
  return (
    <div>
      <p className="mb-2 text-sm text-ink">
        {d.label}: <span className="tabular-nums font-medium">{cad(d.revenue)}</span>
        <span className="text-neutral-500"> · {d.bookings} booking{d.bookings === 1 ? "" : "s"} · {cad(d.prevRevenue)} {compareLabel}</span>
      </p>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-32 w-full touch-pan-y" role="img" aria-label="Revenue over the period against the comparison">
        {data.map((b, i) => {
          const w = step * 0.36;
          const h1 = (b.prevRevenue / max) * (H - 6);
          const h2 = (b.revenue / max) * (H - 6);
          return (
            <g key={i} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              <rect x={i * step + step * 0.1} y={H - h1} width={w} height={h1} className="fill-neutral-300" />
              <rect x={i * step + step * 0.16 + w} y={H - h2} width={w} height={h2} className={i === shown ? "fill-ink" : "fill-neutral-700"} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-neutral-500">
        {data.map((b, i) => (
          <span key={i} className="flex-1 truncate text-center">
            {i % every === 0 ? b.label : ""}
          </span>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> This period</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-300" /> {compareLabel}</span>
      </p>
    </div>
  );
}

export function Kpi({ label, value, pair, kind }: { label: string; value: string; pair: Pair; kind?: "percent" | "points" }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-0.5 text-xs">
        <Delta pair={pair} kind={kind} />
      </p>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────

export type S = ReturnType<typeof useSection>;
export const st = (s: S) => ({ loading: s.loading, error: s.error, locked: s.locked, retry: s.retry });

function Overview({ s, compareLabel }: { s: S; compareLabel: string }) {
  const d = s.data;
  return (
    <Card id="overview" title="Revenue" state={st(s)} suggestion={d?.suggestion} headline={d ? cad(d.revenue.now) : undefined} sub={d ? <Delta pair={d.revenue} /> : null}>
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Kpi label="Bookings" value={String(d.bookings.now)} pair={d.bookings} />
            <Kpi label="Average ticket" value={cad(d.avgTicket.now)} pair={d.avgTicket} />
            <Kpi label="New clients" value={String(d.newClients.now)} pair={d.newClients} />
            <Kpi label="Rebooked" value={d.rebook.now === null ? "–" : `${d.rebook.now}%`} pair={d.rebook} kind="points" />
            <Kpi label="Rating" value={d.rating.now === null ? "–" : `${d.rating.now} ★`} pair={{ now: d.rating.period, prev: d.rating.prev }} kind="points" />
          </div>
          <div className="mt-5">
            <RevenueChart data={d.series} compareLabel={compareLabel} />
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Service sales after refunds, counted the same way as Earnings.{" "}
            <Link href="/earnings" className="font-medium text-ink underline underline-offset-2">
              See full earnings
            </Link>
          </p>
        </>
      ) : null}
    </Card>
  );
}

function Forecast({ s }: { s: S }) {
  const d = s.data;
  const max = d ? Math.max(...d.weeks.map((w: { confirmed: number; expected: number }) => w.confirmed + w.expected), 1) : 1;
  return (
    <Card id="forecast" title="Next 30 days" state={st(s)} suggestion={d?.suggestion} headline={d ? cad(d.confirmed + d.expected) : undefined} sub={d ? `${cad(d.confirmed)} confirmed from ${d.confirmedCount} booking${d.confirmedCount === 1 ? "" : "s"}, ${cad(d.expected)} expected from ${d.expectedCount} regular${d.expectedCount === 1 ? "" : "s"} due back` : null}>
      {d ? (
        <div className="grid grid-cols-4 items-end gap-2" role="img" aria-label="Confirmed and expected revenue by week">
          {d.weeks.map((w: { label: string; confirmed: number; expected: number }) => (
            <div key={w.label} className="text-center">
              <div className="mx-auto flex h-24 w-full max-w-12 flex-col justify-end overflow-hidden rounded-md bg-ink/[0.04]">
                <div className="bg-neutral-300" style={{ height: `${(w.expected / max) * 100}%` }} />
                <div className="bg-ink" style={{ height: `${(w.confirmed / max) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500">{w.label}</p>
              <p className="text-xs tabular-nums text-ink">{cad(w.confirmed + w.expected)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {d ? (
        <p className="mt-3 flex gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Confirmed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-neutral-300" /> Expected</span>
        </p>
      ) : null}
    </Card>
  );
}

type RiskRow = { key: string; name: string; customerId: string | null; last: string; daysSince: number; usualGap: number | null; visits: number; avgTicket: number; nudgedDaysAgo: number | null };

function Clients({ s, nudge, sending }: { s: S; nudge: (ids: string[] | "all") => void; sending: string | null }) {
  const d = s.data;
  return (
    <Card id="clients" title="Clients" state={st(s)} suggestion={d?.suggestion} onAction={() => nudge("all")} headline={d ? `${d.newClients + d.returning}` : undefined} sub={d ? `${d.newClients} new and ${d.returning} returning this period. Average client worth ${cad(d.lifetimeValue)} so far.` : null}>
      {d ? (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-medium text-neutral-500">Came back within 30, 60 and 90 days, by first-visit month</h3>
            <div className="mt-2 grid grid-cols-[3rem_repeat(3,minmax(0,1fr))_2.5rem] gap-x-2 gap-y-1.5 text-xs">
              <span />
              {["30 days", "60 days", "90 days"].map((h) => (
                <span key={h} className="text-neutral-500">{h}</span>
              ))}
              <span className="text-right text-neutral-500">New</span>
              {d.retention.map((m: { month: string; label: string; newClients: number; d30: number | null; d60: number | null; d90: number | null }) => (
                <div key={m.month} className="contents">
                  <span className="text-neutral-600">{m.label}</span>
                  {[m.d30, m.d60, m.d90].map((v, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                        <span className="block h-full rounded-full bg-ink" style={{ width: `${v ?? 0}%` }} />
                      </span>
                      <span className="w-8 text-right tabular-nums text-ink">{v === null ? (m.newClients ? "…" : "–") : `${v}%`}</span>
                    </span>
                  ))}
                  <span className="text-right tabular-nums text-neutral-600">{m.newClients}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">&ldquo;…&rdquo; means it&apos;s too soon to tell.</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium text-neutral-500">
                At risk: {d.atRiskCount} regular{d.atRiskCount === 1 ? "" : "s"} past their usual gap, worth about {cad(d.atRiskValue)}
              </h3>
            </div>
            {d.atRisk.length ? (
              <ul className="mt-2 divide-y divide-hairline">
                {(d.atRisk as RiskRow[]).slice(0, 8).map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-neutral-500">
                        Usually every {c.usualGap} days, last on {shortDate(c.last)} ({c.daysSince} days ago) · {cad(c.avgTicket)} a visit
                      </p>
                    </div>
                    {c.customerId ? (
                      c.nudgedDaysAgo !== null ? (
                        <span className="shrink-0 text-xs text-neutral-500">Nudged {c.nudgedDaysAgo === 0 ? "today" : `${c.nudgedDaysAgo}d ago`}</span>
                      ) : (
                        <Button size="sm" className="shrink-0" loading={sending === c.customerId} onClick={() => nudge([c.customerId as string])}>
                          <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send rebook nudge
                        </Button>
                      )
                    ) : (
                      <span className="shrink-0 text-xs text-neutral-500">Booked outside LineUp</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-600">Nobody is overdue right now.</p>
            )}
          </div>

          {d.top.length ? (
            <div>
              <h3 className="text-xs font-medium text-neutral-500">Top clients, all time</h3>
              <Bars rows={d.top.map((t: { name: string; spend: number; visits: number }) => ({ label: t.name, value: t.spend, note: `${t.visits} visit${t.visits === 1 ? "" : "s"}` }))} />
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Calendar({ s }: { s: S }) {
  const d = s.data;
  const [tip, setTip] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const hours = d ? d.hourEnd - d.hourStart + 1 : 0;
  return (
    <Card
      id="calendar"
      title="Open time this month"
      state={st(s)}
      suggestion={d?.suggestion}
      headline={d ? cad(d.openThisMonth.cents) : undefined}
      sub={d ? (d.hasHours ? `${d.openThisMonth.freeHours} open hours not booked yet, at your ${cad(d.openThisMonth.perHour)} an hour.` : "Set your weekly hours in Calendar to see your open time.") : null}
    >
      {d ? (
        <>
          <div className="overflow-x-auto">
            {/* Bigger squares on phones (easy to tap; the grid scrolls sideways
                with the day names pinned), the original size from 640px up. */}
            <div
              className="inline-grid gap-[3px] [--cell:1.75rem] sm:[--cell:1.15rem]"
              onMouseLeave={() => setTip(picked)}
              style={{ gridTemplateColumns: `2rem repeat(${hours}, minmax(var(--cell), 1fr))`, minWidth: "100%" }}
            >
              <span className="sticky left-0 z-10 bg-surface" />
              {Array.from({ length: hours }, (_, i) => (
                <span key={i} className="text-center text-[10px] text-neutral-500">{(d.hourStart + i) % 2 === 0 ? hourLabel(d.hourStart + i) : ""}</span>
              ))}
              {WEEK.map((dow) => (
                <div key={dow} className="contents">
                  <span className="sticky left-0 z-10 flex items-center self-stretch bg-surface text-[11px] text-neutral-500">{DAYS_SHORT[dow]}</span>
                  {Array.from({ length: hours }, (_, i) => {
                    const booked = d.booked[dow][i] as number;
                    const open = d.open[dow][i] as number;
                    const rate = open > 0 ? Math.min(booked / open, 1) : booked > 0 ? 1 : 0;
                    const label = `${DAYS_SHORT[dow]} ${hourLabel(d.hourStart + i)}: ${open ? `${Math.round(rate * 100)}% booked` : booked ? "booked outside your hours" : "closed"}`;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={label}
                        aria-pressed={picked === label}
                        onClick={() => {
                          setTip(label);
                          setPicked(label);
                        }}
                        onMouseEnter={() => setTip(label)}
                        className={`h-8 rounded-[4px] sm:h-6 ${open || booked ? "" : "bg-transparent ring-1 ring-inset ring-ink/[0.05]"} ${
                          picked === label ? "outline outline-2 outline-offset-1 outline-ink" : ""
                        }`}
                        style={open || booked ? { background: rate === 0 ? "rgba(10,10,10,0.06)" : `rgba(10,10,10,${0.18 + 0.82 * rate})` } : undefined}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p aria-live="polite" className="mt-2 text-xs text-neutral-500">{tip || "Darker is more booked. Pale squares are open hours with nothing booked; tap one for detail."}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-xl bg-neutral-50 p-3">
              <dt className="text-xs text-neutral-500">Busiest</dt>
              <dd className="mt-0.5 text-ink">{d.busiest ? `${DAYS_SHORT[d.busiest.dow]} ${hourLabel(d.busiest.hour)}` : "–"}</dd>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3">
              <dt className="text-xs text-neutral-500">Emptiest</dt>
              <dd className="mt-0.5 text-ink">{d.emptiest ? `${DAYS_SHORT[d.emptiest.dow]} ${hourLabel(d.emptiest.hour)}` : "–"}</dd>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3">
              <dt className="text-xs text-neutral-500">No-shows</dt>
              <dd className="mt-0.5 tabular-nums text-ink">{d.lost.noShows}</dd>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3">
              <dt className="text-xs text-neutral-500">Late cancellations</dt>
              <dd className="mt-0.5 tabular-nums text-ink">{d.lost.lateCancels}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </Card>
  );
}

function Sources({ s }: { s: S }) {
  const d = s.data;
  const total = d ? d.sources.reduce((t: number, x: { revenue: number }) => t + x.revenue, 0) : 0;
  const since = d ? shortDate(d.trackedSince) : "";
  return (
    <Card id="sources" title="Where bookings come from" state={st(s)} suggestion={d?.suggestion} headline={d ? cad(total) : undefined} sub={d ? `By where each client found you. Bookings before ${since} weren't tracked.` : null}>
      {d ? (
        d.sources.length ? (
          <Bars rows={d.sources.map((x: { key: string; label: string; revenue: number; count: number }) => ({ label: x.key === "not_tracked" ? `Not tracked before ${since}` : x.label, value: x.revenue, note: `${x.count} booking${x.count === 1 ? "" : "s"}` }))} />
        ) : (
          <p className="text-sm text-neutral-600">No bookings in this period yet.</p>
        )
      ) : null}
    </Card>
  );
}

function Requests({ s }: { s: S }) {
  const d = s.data;
  const mins = (m: number | null) => (m === null ? "–" : m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);
  return (
    <Card id="requests" title="Requests" state={st(s)} suggestion={d?.suggestion} headline={d ? (d.rate === null ? "–" : `${d.rate}%`) : undefined} sub={d ? `of ${d.offers} offer${d.offers === 1 ? "" : "s"} won. Median reply ${mins(d.medianMinutes)} after the request.` : null}>
      {d ? (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-medium text-neutral-500">Win rate by how fast you replied</h3>
            <Bars max={100} format={(n) => `${n}%`} rows={d.bySpeed.map((b: { label: string; rate: number | null; offers: number }) => ({ label: b.label, value: b.rate ?? 0, note: `of ${b.offers}` }))} />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-neutral-500">Win rate by price, against other offers on the same request</h3>
            <Bars max={100} format={(n) => `${n}%`} rows={d.byPrice.map((b: { label: string; rate: number | null; offers: number }) => ({ label: b.label, value: b.rate ?? 0, note: `of ${b.offers}` }))} />
          </div>
          <div>
            <h3 className="text-xs font-medium text-neutral-500">
              {d.missed} request{d.missed === 1 ? "" : "s"} near you in your trade went unanswered
            </h3>
            {d.missed ? (
              <>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {d.missedByService.map((m: { label: string; count: number }) => (
                    <li key={m.label} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                      {m.label} · {m.count}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-500">
                  {WEEK.map((dow) => (
                    <div key={dow}>
                      <div className="mx-auto mb-1 flex h-12 w-full max-w-8 items-end overflow-hidden rounded bg-ink/[0.04]">
                        <div className="w-full bg-ink" style={{ height: `${(d.missedByDay[dow] / Math.max(...d.missedByDay, 1)) * 100}%` }} />
                      </div>
                      {DAYS_SHORT[dow]}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Profile({ s }: { s: S }) {
  const d = s.data;
  const f = d?.funnel;
  return (
    <Card id="profile" title="Profile" state={st(s)} suggestion={d?.suggestion} headline={f ? `${f.visits}` : undefined} sub={f ? "profile visits this period" : null}>
      {d ? (
        <div className="space-y-5">
          <Bars
            format={(n) => n.toLocaleString("en-CA")}
            rows={[
              { label: "Seen in Discover", value: f.views },
              { label: "Opened your profile", value: f.visits },
              { label: "Saved you", value: f.saves },
              { label: "Booked online", value: f.bookings },
            ]}
          />
          <div>
            <h3 className="text-xs font-medium text-neutral-500">Rating by month</h3>
            <div className="mt-2 grid grid-cols-6 gap-1.5 text-center">
              {d.ratingTrend.map((m: { label: string; rating: number | null; count: number }) => (
                <div key={m.label} className="rounded-lg bg-neutral-50 px-1 py-2">
                  <p className="text-sm tabular-nums text-ink">{m.rating ?? "–"}</p>
                  <p className="text-[10px] text-neutral-500">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
          {d.words.length ? (
            <div>
              <h3 className="text-xs font-medium text-neutral-500">Words that keep coming up in reviews</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {d.words.map((w: { word: string; count: number }) => (
                  <li key={w.word} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                    {w.word} · {w.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Boosts({ s }: { s: S }) {
  const d = s.data;
  return (
    <Card id="boosts" title="Boosts and Spotlight" state={st(s)} suggestion={d?.suggestion} headline={d ? cad(d.revenue) : undefined} sub={d ? (d.boosts.length ? `came from boosts that cost ${cad(d.spent)}` : "You haven't boosted your profile yet.") : null}>
      {d?.boosts.length ? (
        <ul className="divide-y divide-hairline">
          {d.boosts.map((b: { id: string; from: string; to: string; cost: number; views: number; visits: number; bookings: number; revenue: number }) => (
            <li key={b.id} className="py-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-ink">{shortDate(b.from)} to {shortDate(b.to)}</span>
                <span className="tabular-nums text-ink">{cad(b.revenue)}</span>
              </div>
              <p className="text-xs text-neutral-500">
                Cost {cad(b.cost)} · {b.views} views · {b.visits} visits · {b.bookings} booking{b.bookings === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Prices({ s }: { s: S }) {
  const d = s.data;
  const rows = (d?.services || []) as { service: string; mine: number | null; enough: boolean; median: number | null; low: number | null; high: number | null; vsMedian: number | null }[];
  const any = rows.some((r) => r.enough);
  return (
    <Card id="prices" title="Local prices" state={st(s)} suggestion={d?.suggestion} sub={d ? "Your prices against the middle of what other pros in your trade and city charge. Never anyone's name or single price." : null}>
      {d ? (
        any ? (
          <ul className="space-y-4">
            {rows.map((r) =>
              r.enough ? (
                <li key={r.service}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink">{r.service}</span>
                    <span className="shrink-0 tabular-nums text-neutral-600">
                      You {cad(r.mine)} · median {cad(r.median)}
                    </span>
                  </div>
                  <PriceRange low={r.low as number} high={r.high as number} median={r.median as number} mine={r.mine} />
                </li>
              ) : (
                <li key={r.service} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{r.service}</span>
                  <span className="shrink-0 text-xs text-neutral-500">Not enough local data yet</span>
                </li>
              )
            )}
          </ul>
        ) : (
          <p className="text-sm text-neutral-600">There isn&apos;t enough local data yet. Prices show once at least 5 other pros in your trade and city offer the same service.</p>
        )
      ) : null}
    </Card>
  );
}

function PriceRange({ low, high, median, mine }: { low: number; high: number; median: number; mine: number | null }) {
  const lo = Math.min(low, mine ?? low);
  const hi = Math.max(high, mine ?? high);
  const at = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  return (
    <div className="relative mt-2 h-4" role="img" aria-label={`Local range ${cad(low)} to ${cad(high)}, median ${cad(median)}${mine ? `, yours ${cad(mine)}` : ""}`}>
      <div className="absolute top-1.5 h-1 rounded-full bg-neutral-300" style={{ left: `${at(low)}%`, width: `${Math.max(at(high) - at(low), 1)}%` }} />
      <div className="absolute top-0.5 h-3 w-0.5 bg-neutral-500" style={{ left: `${at(median)}%` }} />
      {mine ? <div className="absolute top-0 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-ink shadow" style={{ left: `${at(mine)}%` }} /> : null}
    </div>
  );
}

function Goals({ s, onSaved, open }: { s: S; onSaved: () => void; open: boolean }) {
  const d = s.data;
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<"revenue" | "bookings">("revenue");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showForm = editing || open || (d && !d.set);

  async function save(clear = false) {
    const n = Number(value.replace(/[$,\s]/g, ""));
    if (!clear && (!Number.isFinite(n) || n <= 0)) return setError(kind === "revenue" ? "Enter a dollar amount." : "Enter a number of bookings.");
    setBusy(true);
    setError(null);
    const body = kind === "revenue" ? { scope: "me", cents: clear ? null : Math.round(n * 100) } : { scope: "me", kind: "bookings", bookings: clear ? null : Math.round(n) };
    const res = await studioFetch<{ error?: string }>("/api/analytics/goal", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.data.error || "Could not save the goal.");
    setEditing(false);
    setValue("");
    onSaved();
  }

  const fmt = (n: number) => (d?.kind === "bookings" ? `${n}` : cad(n));
  return (
    <Card id="goals" title="Monthly goal" state={st(s)} suggestion={d && d.set ? d.suggestion : null} headline={d?.set ? `${d.percent}%` : undefined} sub={d?.set ? `${fmt(d.soFar)} of ${fmt(d.target)}${d.kind === "bookings" ? " bookings" : ""}, ${fmt(d.booked)} more booked. ${d.onTrack ? "On track." : `Needs about ${fmt(d.neededPerDay)} a day for the ${d.daysLeft} days left.`}` : null}>
      {d?.set ? (
        <div className="relative h-2.5 overflow-hidden rounded-full bg-ink/[0.07]" role="img" aria-label={`${d.percent}% of the goal`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-neutral-400" style={{ width: `${Math.min(((d.soFar + d.booked) / d.target) * 100, 100)}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${d.percent}%` }} />
        </div>
      ) : null}
      {d ? (
        showForm ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {!d.set ? <p className="text-sm text-neutral-600">Pick a monthly goal and see each day whether you&apos;re on pace.</p> : null}
            <Segmented value={kind} onChange={setKind} options={[{ value: "revenue", label: "Revenue" }, { value: "bookings", label: "Bookings" }]} label="Goal type" />
            <div className="flex flex-wrap items-center gap-2">
              {kind === "revenue" ? <span className="text-sm text-neutral-500">$</span> : null}
              <input inputMode={kind === "revenue" ? "decimal" : "numeric"} aria-label={kind === "revenue" ? "Monthly revenue goal in dollars" : "Monthly bookings goal"} className={`${fieldClass} h-10 w-32`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "revenue" ? "4000" : "60"} />
              <Button variant="primary" type="submit" loading={busy}>
                Save goal
              </Button>
              {d.set ? (
                <Button type="button" onClick={() => void save(true)} disabled={busy}>
                  Remove
                </Button>
              ) : null}
            </div>
            {error ? <p className="text-[13px] text-[#A30D25]">{error}</p> : null}
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-3 text-xs text-neutral-500 underline underline-offset-2 hover:text-ink">
            Change goal
          </button>
        )
      ) : null}
    </Card>
  );
}

// Alerts: things worth knowing now (revenue down sharply, a no-show spike,
// a goal reached). Each shows once in its window; the server keeps track.
export function AlertsList({ scope, tick }: { scope: "me" | "shop"; tick: number }) {
  const [alerts, setAlerts] = useState<{ key: string; title: string; body: string; created_at: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    studioFetch<{ alerts?: { key: string; title: string; body: string; created_at: string }[] }>(`/api/analytics/alerts?scope=${scope}`).then((res) => {
      if (live) setAlerts(res.ok ? res.data.alerts || [] : []);
    });
    return () => {
      live = false;
    };
  }, [scope, tick]);
  if (!alerts?.length) return null;
  return (
    <section aria-label="Alerts" className={`${panelClass} p-4`}>
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.key} className="flex gap-3">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-ink">{a.title}</p>
              <p className="text-sm text-neutral-600">{a.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PdfButton({ scope, q }: { scope: "me" | "shop"; q: Query }) {
  return (
    <a href={`/api/analytics/summary?scope=${scope}&${qs(q)}`} download className={`${buttonClass("secondary")} h-11`}>
      <FileText className="h-4 w-4" aria-hidden="true" /> Summary PDF
    </a>
  );
}

// ── The page ─────────────────────────────────────────────────────────────

export default function ProAnalytics() {
  const [q, setQ] = useState<Query>({ period: "month", from: "", to: "", compare: "previous", service: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const overviewLive = useSection("overview", q, tick, false);
  // No plan with Analytics: every section shows a labelled example instead.
  const sample = !!overviewLive.needsPlan;
  const overviewSample = useSection("overview", q, tick, true);
  const overview = sample ? overviewSample : overviewLive;
  const servicesS = useSection("services", q, tick, sample);
  const forecast = useSection("forecast", q, tick, sample);
  const clients = useSection("clients", q, tick, sample);
  const calendar = useSection("calendar", q, tick, sample);
  const sources = useSection("sources", q, tick, sample);
  const requests = useSection("requests", q, tick, sample);
  const profile = useSection("profile", q, tick, sample);
  const boosts = useSection("boosts", q, tick, sample);
  const prices = useSection("prices", q, tick, sample);
  const goals = useSection("goals", q, tick, sample);


  const nudge = useCallback(
    async (ids: string[] | "all") => {
      if (sample) return;
      setSending(ids === "all" ? "all" : ids[0]);
      setNotice(null);
      const res = await studioFetch<{ sent?: number; skipped?: string; error?: string }>("/api/analytics/winback", { method: "POST", body: { scope: "me", customerIds: ids } });
      setSending(null);
      if (!res.ok) return setNotice(res.data.error || "Could not send the nudge.");
      setNotice(res.data.sent ? `Sent ${res.data.sent} rebook nudge${res.data.sent === 1 ? "" : "s"}.` : res.data.skipped || "Nobody left to nudge.");
      setTick((t) => t + 1);
    },
    [sample]
  );

  const compareLabel = q.compare === "last_year" ? "same time last year" : "period before";
  const services: string[] = overview.data?.services || [];
  const empty = !sample && overview.data?.empty;

  return (
    <div className="space-y-4">
      {sample ? (
        <div className={`${panelClass} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="text-sm font-semibold text-ink">This is an example with sample numbers</p>
            <p className="mt-1 text-sm text-neutral-600">Analytics come with Apprentice, Pro and Master. Here&apos;s what yours would show.</p>
          </div>
          <Link href="/subscription" className={`${buttonClass("primary")} shrink-0`}>
            See plans
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={q.period} onChange={(period) => setQ((x) => ({ ...x, period, ...(period === "custom" ? {} : { from: "", to: "" }) }))} options={PERIODS} label="Period" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select aria-label="Compare with" className={`${fieldClass} h-10`} value={q.compare} onChange={(e) => setQ((x) => ({ ...x, compare: e.target.value as Compare }))}>
            <option value="previous">vs period before</option>
            <option value="last_year">vs last year</option>
          </select>
          <select aria-label="Service" className={`${fieldClass} h-10`} value={q.service} onChange={(e) => setQ((x) => ({ ...x, service: e.target.value }))}>
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {!sample ? <PdfButton scope="me" q={q} /> : null}
      </div>
      {!sample ? <AlertsList scope="me" tick={tick} /> : null}
      {q.period === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ((x) => ({ ...x, from: draft.from, to: draft.to }));
          }}
        >
          <label className="text-xs text-neutral-500">
            From
            <input type="date" className={`${fieldClass} mt-1 h-10`} value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </label>
          <label className="text-xs text-neutral-500">
            To
            <input type="date" className={`${fieldClass} mt-1 h-10`} value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </label>
          <Button type="submit" variant="primary" disabled={!draft.from || !draft.to}>
            Show
          </Button>
        </form>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {empty ? (
        <div className={`${panelClass} p-6`}>
          <p className="text-sm font-semibold text-ink">Your analytics start with your first booking</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-600">
            Once clients book, this page shows your revenue and how it&apos;s changing, the next 30 days, which regulars are due back, the hours that sit empty and where your bookings come from, each with one thing to do about it.
          </p>
          <Link href="/calendar" className={`${buttonClass("primary")} mt-4`}>
            Open your calendar
          </Link>
        </div>
      ) : null}

      {q.period === "custom" && (!q.from || !q.to) ? null : (
        <CsvLinks.Provider value={(name) => (sample ? null : `/api/analytics/pro?section=${name}&${qs(q)}&format=csv`)}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Overview s={overview} compareLabel={compareLabel} />
          </div>
          <div className="lg:col-span-2">
            <ServicesCard s={servicesS} />
          </div>
          <Forecast s={forecast} />
          <Goals s={goals} onSaved={() => setTick((t) => t + 1)} open={false} />
          <div className="lg:col-span-2">
            <Clients s={clients} nudge={(ids) => void nudge(ids)} sending={sending} />
          </div>
          <div className="lg:col-span-2">
            <Calendar s={calendar} />
          </div>
          <Sources s={sources} />
          <Requests s={requests} />
          <Profile s={profile} />
          <Boosts s={boosts} />
          <div className="lg:col-span-2">
            <Prices s={prices} />
          </div>
        </div>
        </CsvLinks.Provider>
      )}
    </div>
  );
}

// ── Services ─────────────────────────────────────────────────────────────
// What each service earns, per hour of chair time, how that changed, and how
// many of the clients who had it came back. A table on laptops, stacked rows
// on phones. Shared by pro and shop Analytics.
type ServiceRow = { name: string; bookings: number; revenue: number; avgTicket: number; perHour: number | null; share: number; change: number | null; cameBack: number | null };

export function ServicesCard({ s, who = "your" }: { s: S; who?: "your" | "the shop's" }) {
  const rows: ServiceRow[] = s.data?.byService || [];
  const best = rows.filter((r) => r.perHour !== null).sort((a, b) => (b.perHour || 0) - (a.perHour || 0))[0];
  return (
    <Card
      id="services"
      title="Services"
      state={st(s)}
      headline={rows.length ? rows[0].name : undefined}
      sub={
        rows.length
          ? rows[0].revenue > 0
            ? `${rows[0].share}% of ${who} revenue this period.${best && best.name !== rows[0].name ? ` ${best.name} earns the most per hour (${cad(best.perHour)}).` : ""}`
            : "Most booked this period."
          : s.data
          ? "No completed services this period."
          : null
      }
    >
      {rows.length ? (
        <div className="-mx-1 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-3 px-1 pb-2 text-[11px] font-medium text-neutral-500 md:grid">
            <span>Service</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">Bookings</span>
            <span className="text-right">Average</span>
            <span className="text-right">Per hour</span>
            <span className="text-right">Came back</span>
          </div>
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <li key={r.name} className="grid grid-cols-2 gap-x-3 gap-y-1 px-1 py-3 md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] md:items-center">
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden="true">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(r.share, 2)}%` }} />
                  </span>
                </div>
                <p className="text-sm tabular-nums text-ink md:text-right">
                  <span className="text-neutral-500 md:hidden">Revenue </span>
                  {cad(r.revenue)}
                  {r.change !== null ? (
                    <span className={`ml-1.5 text-[11px] ${r.change < 0 ? "text-[#A30D25]" : "text-neutral-500"}`}>
                      {r.change > 0 ? "+" : ""}
                      {r.change}%
                    </span>
                  ) : null}
                </p>
                <p className="text-sm tabular-nums text-neutral-700 md:text-right">
                  <span className="text-neutral-500 md:hidden">Bookings </span>
                  {r.bookings}
                </p>
                <p className="text-sm tabular-nums text-neutral-700 md:text-right">
                  <span className="text-neutral-500 md:hidden">Average </span>
                  {cad(r.avgTicket)}
                </p>
                <p className="text-sm tabular-nums text-neutral-700 md:text-right">
                  <span className="text-neutral-500 md:hidden">Per hour </span>
                  {r.perHour === null ? "–" : cad(r.perHour)}
                </p>
                <p className="text-sm tabular-nums text-neutral-700 md:text-right">
                  <span className="text-neutral-500 md:hidden">Came back </span>
                  {r.cameBack === null ? "–" : `${r.cameBack}%`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
