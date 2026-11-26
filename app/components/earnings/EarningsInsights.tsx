"use client";

// The earnings report's "read it another way" half: take-home over time with
// the period before for comparison, by service, by day of the week, tips, and
// how clients paid. One series per chart, in ink, so no legend is needed;
// hover or tap a bar for its exact figures; each chart has a table for
// screen readers.

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { panelClass } from "@/app/studio/ui";
import { byPayment, byService, byWeekday, pctChange, periodStats, trend, type Bucket } from "@/app/lib/earningsInsights";
import { money } from "@/app/lib/earningsStatement";
import type { EarningsRow, Scope } from "@/app/lib/earningsCore";

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className={`${panelClass} p-5 sm:p-6`} aria-label={title}>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {sub ? <p className="mt-0.5 text-[13px] text-neutral-500">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Change({ now, prev, label, format }: { now: number; prev: number | null; label: string; format: (n: number) => string }) {
  const c = prev === null ? null : pctChange(now, prev);
  return (
    <div className="min-w-0 rounded-xl bg-ink/[0.035] px-3.5 py-3">
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{format(now)}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[12px] tabular-nums text-neutral-500">
        {c === null ? (
          "Nothing to compare yet"
        ) : (
          <>
            {c > 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-ink" aria-hidden="true" /> : c < 0 ? <ArrowDownRight className="h-3.5 w-3.5 text-[#A30D25]" aria-hidden="true" /> : null}
            <span className={c < 0 ? "text-[#A30D25]" : c > 0 ? "text-ink" : ""}>
              {c > 0 ? "+" : ""}
              {c}%
            </span>
            <span>vs before</span>
          </>
        )}
      </p>
    </div>
  );
}

// Vertical bars on one baseline (below it for a day of expenses), recessive
// gridlines, sparse labels, and a tooltip on hover or tap.
function BarChart({ data, caption }: { data: { label: string; cents: number; detail: string }[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.cents));
  const min = Math.min(0, ...data.map((d) => d.cents));
  const span = max - min || 1;
  const zero = (max / span) * 100; // % from the top where the baseline sits
  const every = data.length > 16 ? Math.ceil(data.length / 8) : data.length > 8 ? 2 : 1;
  const a = active !== null ? data[active] : null;

  return (
    <div>
      <div className="mb-2 h-10" aria-live="polite">
        {a ? (
          <>
            <p className="text-[12px] text-neutral-500">{a.label}</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {money(a.cents)} <span className="font-normal text-neutral-500">· {a.detail}</span>
            </p>
          </>
        ) : (
          <p className="text-[12px] text-neutral-500">Hover or tap a bar for its figures.</p>
        )}
      </div>
      <div className="relative h-40" onMouseLeave={() => setActive(null)}>
        {/* Gridlines: top, middle, baseline. */}
        {[0, 50].map((p) => (
          <div key={p} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-ink/[0.07]" style={{ top: `${p}%` }} />
        ))}
        <div aria-hidden="true" className="absolute inset-x-0 border-t border-ink/20" style={{ top: `${zero}%` }} />
        <span aria-hidden="true" className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[11px] tabular-nums text-neutral-400">
          {money(max)}
        </span>
        <div className="absolute inset-0 flex items-stretch gap-[2px]">
          {data.map((d, i) => {
            const h = (Math.abs(d.cents) / span) * 100;
            const up = d.cents >= 0;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${d.label}: ${money(d.cents)}, ${d.detail}`}
                className="group relative flex-1 focus-visible:outline-none"
              >
                <span
                  className={`absolute ${data.length <= 12 ? "inset-x-[18%]" : "inset-x-0"} transition-colors ${up ? "rounded-t-[4px]" : "rounded-b-[4px]"} ${
                    active === i ? "bg-ink" : active === null ? "bg-ink/80" : "bg-ink/25"
                  } group-focus-visible:ring-2 group-focus-visible:ring-ink/40`}
                  style={up ? { bottom: `${100 - zero}%`, height: `${Math.max(h, d.cents ? 1.5 : 0)}%` } : { top: `${zero}%`, height: `${h}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-neutral-500">
            {i % every === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{money(d.cents)}</td>
              <td>{d.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HBar({ label, value, share, detail }: { label: string; value: string; share: number; detail?: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-ink">{label}</span>
        <span className="shrink-0 tabular-nums text-ink">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
          <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />
        </span>
        {detail ? <span className="shrink-0 text-[12px] tabular-nums text-neutral-500">{detail}</span> : null}
      </div>
    </li>
  );
}

export default function EarningsInsights({
  rows,
  prevRows,
  from,
  to,
  scope,
}: {
  rows: EarningsRow[];
  prevRows: EarningsRow[] | null;
  from: string;
  to: string;
  scope: Scope;
}) {
  const stats = useMemo(() => periodStats(rows, scope), [rows, scope]);
  const prev = useMemo(() => (prevRows ? periodStats(prevRows, scope) : null), [prevRows, scope]);
  const buckets = useMemo(() => trend(rows, from, to, scope), [rows, from, to, scope]);
  const services = useMemo(() => byService(rows, scope), [rows, scope]);
  const weekdays = useMemo(() => byWeekday(rows, scope), [rows, scope]);
  const paid = useMemo(() => byPayment(rows), [rows]);
  const who = scope === "shop" ? "The shop's money" : "Your take-home";
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const unitLabel = days <= 31 ? "By day" : days <= 95 ? "By week" : "By month";
  const best = weekdays.reduce((b, d) => (d.cents > b.cents ? d : b), weekdays[0]);
  const hasWeekdays = weekdays.some((d) => d.cents);

  if (!rows.length) return null;

  const visitsWord = (n: number) => `${n} ${n === 1 ? "visit" : "visits"}`;

  return (
    <div className="space-y-6">
      <Card title={`${who} over time`} sub={`${unitLabel}, compared with the ${days} days before`}>
        <div className="grid grid-cols-2 gap-2">
          <Change label={scope === "shop" ? "Shop's money" : "Take-home"} now={stats.take} prev={prev?.take ?? null} format={money} />
          <Change label="Visits" now={stats.visits} prev={prev?.visits ?? null} format={(n) => String(n)} />
          <Change label="Per visit" now={stats.perVisit} prev={prev && prev.visits ? prev.perVisit : null} format={money} />
          {scope === "me" ? (
            <Change label="Tips" now={stats.tips} prev={prev?.tips ?? null} format={money} />
          ) : (
            <Change label="Client payments" now={stats.serviceSales} prev={prev?.serviceSales ?? null} format={money} />
          )}
        </div>
        <div className="mt-6">
          <BarChart
            caption={`${who} by period`}
            data={buckets.map((b: Bucket) => ({
              label: b.from === b.to ? new Date(`${b.from}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : b.label,
              cents: b.cents,
              detail: visitsWord(b.visits),
            }))}
          />
        </div>
      </Card>

      {services.length ? (
        <Card title="By service" sub="Most earned first, with how many and the average price">
          <ul className="space-y-4">
            {services.map((s) => (
              <HBar key={s.name} label={s.name} value={money(s.take)} share={s.share} detail={`${s.visits} × ${money(s.avgPrice)}`} />
            ))}
          </ul>
        </Card>
      ) : null}

      {hasWeekdays ? (
        <Card title="By day of the week" sub={best.cents > 0 ? `${best.label === "Sat" || best.label === "Sun" ? "Weekends" : "Your best day"}: ${{ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[best.label]}` : undefined}>
          <BarChart caption="Take-home by day of the week" data={weekdays.map((d) => ({ label: d.label, cents: d.cents, detail: visitsWord(d.visits) }))} />
        </Card>
      ) : null}

      <div className={`grid gap-6 ${scope === "me" ? "sm:grid-cols-2" : ""}`}>
        {scope === "me" ? (
        <Card title="Tips">
          <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{money(stats.tips)}</p>
          <p className="mt-1 text-[13px] leading-5 text-neutral-500">
            {stats.tipRate === null
              ? "No service sales yet."
              : `${stats.tipRate}% on top of service sales, from ${stats.tippedShare}% of visits.`}
          </p>
        </Card>
        ) : null}
        {paid.length ? (
          <Card title="How clients paid">
            <ul className="space-y-3.5">
              {paid.map((p) => (
                <HBar key={p.via} label={p.label} value={money(p.cents)} share={p.share} detail={`${p.share}%`} />
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
