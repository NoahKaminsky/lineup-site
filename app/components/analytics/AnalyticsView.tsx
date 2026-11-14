"use client";

// Analytics for a pro ("me") or a whole shop. Everything comes from
// /api/analytics, which works it out from real bookings and front-desk
// appointments. Leads with what to do next, then the numbers behind it.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Lock } from "lucide-react";
import { peekStudio, studioFetch } from "@/app/studio/studioApi";
import { EmptyState, Section, Segmented, Tag, buttonClass, panelClass } from "@/app/studio/ui";
import type { AnalyticsSummary, Pair, TeamRow } from "@/app/lib/analytics";

type Scope = "me" | "shop";
type Days = "30" | "90" | "365";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday first: that's how a shop's week reads.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const cad = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
function hourLabel(h: number) {
  const ampm = h >= 12 ? "p" : "a";
  return `${h % 12 === 0 ? 12 : h % 12}${ampm}`;
}

function Delta({ pair, kind = "percent", goodWhenDown = false }: { pair: { now: number | null; prev: number | null }; kind?: "percent" | "points"; goodWhenDown?: boolean }) {
  if (pair.now === null || pair.prev === null) return null;
  if (kind === "percent" && pair.prev === 0) return pair.now > 0 ? <span className="text-xs text-neutral-500">New this period</span> : null;
  const diff = kind === "percent" ? Math.round(((pair.now - pair.prev) / pair.prev) * 100) : pair.now - pair.prev;
  if (diff === 0) return <span className="text-xs text-neutral-500">Same as before</span>;
  const up = diff > 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-emerald-700" : "text-[#A30D25]"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(diff)}
      {kind === "percent" ? "%" : " pts"}
      <span className="font-normal text-neutral-500">&nbsp;vs before</span>
    </span>
  );
}

function Kpi({ label, value, sub, delta, strong = false }: { label: string; value: string; sub?: ReactNode; delta?: ReactNode; strong?: boolean }) {
  return (
    <div className={`${panelClass} p-4 ${strong ? "bg-ink text-white ring-0" : ""}`}>
      <p className={`text-xs font-medium ${strong ? "text-white/70" : "text-neutral-500"}`}>{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      <div className={`mt-1 min-h-4 text-xs ${strong ? "text-white/60 [&_span]:!text-white/80" : "text-neutral-500"}`}>{delta || sub}</div>
    </div>
  );
}

// Sales per day, week or month, with the period before as a lighter bar.
function TrendChart({ data }: { data: AnalyticsSummary["trend"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => Math.max(d.sales, d.prevSales)), 1);
  const H = 140;
  const step = 100 / data.length;
  const shown = active ?? data.length - 1;
  const d = data[shown];
  const every = data.length > 14 ? Math.ceil(data.length / 7) : 1;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-medium text-ink">
          {d.label}: <span className="tabular-nums">{cad(d.sales)}</span>
          <span className="font-normal text-neutral-500">
            {" "}
            · {d.visits} appointment{d.visits === 1 ? "" : "s"} · {cad(d.prevSales)} the period before
          </span>
        </p>
        <p className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ink" /> This period
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-neutral-300" /> Period before
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Sales over time, this period against the one before">
        {[0.5, 1].map((g) => (
          <line key={g} x1="0" x2="100" y1={H - g * (H - 8)} y2={H - g * (H - 8)} stroke="currentColor" className="text-neutral-200" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((b, i) => {
          const x = i * step;
          const w = step * 0.36;
          const h1 = (b.prevSales / max) * (H - 8);
          const h2 = (b.sales / max) * (H - 8);
          return (
            <g key={i} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={x} y={0} width={step} height={H} fill="transparent" />
              <rect x={x + step * 0.1} y={H - h1} width={w} height={h1} className="fill-neutral-300" />
              <rect x={x + step * 0.1 + w + step * 0.06} y={H - h2} width={w} height={h2} className={i === shown ? "fill-[#C8102E]" : "fill-ink"} />
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
    </div>
  );
}

function Meter({ value, tone = "ink" }: { value: number; tone?: "ink" | "muted" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.07]">
      <div className={`h-full rounded-full ${tone === "ink" ? "bg-ink" : "bg-neutral-400"}`} style={{ width: `${Math.max(Math.min(value, 100), value > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

function Heatmap({ schedule }: { schedule: AnalyticsSummary["schedule"] }) {
  const [tip, setTip] = useState<string | null>(null);
  const max = Math.max(...schedule.heat.flat(), 1);
  const hours = schedule.heat[0]?.length || 0;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `2.25rem repeat(${hours}, minmax(1.4rem, 1fr))`, minWidth: "100%" }}>
          <span />
          {Array.from({ length: hours }, (_, i) => (
            <span key={i} className="text-center text-[10px] text-neutral-500">
              {hourLabel(schedule.hourStart + i)}
            </span>
          ))}
          {WEEK_ORDER.map((dow) => (
            <div key={dow} className="contents">
              <span className="self-center text-xs text-neutral-500">{DAYS_SHORT[dow]}</span>
              {schedule.heat[dow].map((n, i) => {
                const label = `${DAYS_SHORT[dow]} ${hourLabel(schedule.hourStart + i)}: ${n} appointment${n === 1 ? "" : "s"}`;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={label}
                    onMouseEnter={() => setTip(label)}
                    onFocus={() => setTip(label)}
                    onClick={() => setTip(label)}
                    className="h-6 rounded-[5px] bg-ink ring-ink/30 transition hover:ring-2 focus-visible:ring-2"
                    style={{ opacity: n === 0 ? 0.06 : 0.2 + 0.8 * (n / max) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">{tip || "Darker means more appointments started in that hour. Tap a square for the count."}</p>
    </div>
  );
}

type TeamKey = "sales" | "visits" | "avgTicket" | "tipRate" | "utilization" | "rebookRate" | "newClients" | "lostRate" | "salesPerHour" | "shopCents";
const TEAM_COLS: { key: TeamKey; label: string; fmt: (t: TeamRow) => string; lowIsGood?: boolean }[] = [
  { key: "sales", label: "Sales", fmt: (t) => cad(t.sales) },
  { key: "visits", label: "Appts", fmt: (t) => String(t.visits) },
  { key: "avgTicket", label: "Avg ticket", fmt: (t) => cad(t.avgTicket) },
  { key: "salesPerHour", label: "Per hour", fmt: (t) => cad(t.salesPerHour) },
  { key: "utilization", label: "Booked", fmt: (t) => (t.utilization === null ? "–" : `${t.utilization}%`) },
  { key: "rebookRate", label: "Come back", fmt: (t) => (t.rebookRate === null ? "–" : `${t.rebookRate}%`) },
  { key: "newClients", label: "New clients", fmt: (t) => String(t.newClients) },
  { key: "tipRate", label: "Tips", fmt: (t) => `${t.tipRate}%` },
  { key: "lostRate", label: "Missed", fmt: (t) => `${t.lostRate}%`, lowIsGood: true },
  { key: "shopCents", label: "To shop", fmt: (t) => cad(t.shopCents) },
];

function TeamTable({ team }: { team: TeamRow[] }) {
  const [sort, setSort] = useState<TeamKey>("sales");
  const col = TEAM_COLS.find((c) => c.key === sort)!;
  const rows = useMemo(() => {
    const val = (t: TeamRow) => (t[sort] === null ? -1 : (t[sort] as number));
    return team.slice().sort((a, b) => (col.lowIsGood ? val(a) - val(b) : val(b) - val(a)));
  }, [team, sort, col.lowIsGood]);
  const best = (key: TeamKey, lowIsGood?: boolean) => {
    const vals = team.filter((t) => t.visits > 0 && t[key] !== null).map((t) => t[key] as number);
    return vals.length > 1 ? (lowIsGood ? Math.min(...vals) : Math.max(...vals)) : null;
  };
  return (
    <div className={`${panelClass} overflow-x-auto`}>
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs text-neutral-500">
            <th className="px-4 py-3 text-left font-medium">Pro</th>
            {TEAM_COLS.map((c) => (
              <th key={c.key} className="px-2 py-3 text-right font-medium" aria-sort={sort === c.key ? (c.lowIsGood ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => setSort(c.key)} className={`rounded px-1 py-0.5 hover:text-ink ${sort === c.key ? "text-ink underline underline-offset-4" : ""}`}>
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id} className="border-b border-hairline last:border-0">
              <td className="px-4 py-3 font-medium text-ink">
                <span className="mr-2 inline-block w-4 text-xs tabular-nums text-neutral-400">{i + 1}</span>
                {t.name}
              </td>
              {TEAM_COLS.map((c) => {
                const top = t.visits > 0 && t[c.key] !== null && best(c.key, c.lowIsGood) === t[c.key];
                return (
                  <td key={c.key} className={`px-3 py-3 text-right tabular-nums ${top ? "font-semibold text-ink" : "text-neutral-700"}`}>
                    {c.fmt(t)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LockedCard({ scope }: { scope: Scope }) {
  const items =
    scope === "shop"
      ? ["Every pro side by side: sales, booked time, clients who come back", "Clients overdue for a visit, and what they're worth", "Which hours and days sit empty", "Services ranked by what they earn per hour"]
      : ["Clients overdue for a visit, with what each is worth", "How much of your open time is booked, hour by hour", "Services ranked by what they earn per hour", "Where bookings come from, and what's lost to no-shows"];
  return (
    <div className={`${panelClass} p-6`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Lock className="h-4 w-4" aria-hidden="true" />
        {scope === "shop" ? "Shop analytics come with a Studio plan" : "The full picture comes with Pro and Master"}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            {t}
          </li>
        ))}
      </ul>
      <Link href={scope === "shop" ? "/studio" : "/subscription"} className={`${buttonClass("primary")} mt-5`}>
        See plans
      </Link>
    </div>
  );
}

export default function AnalyticsView({ scope }: { scope: Scope }) {
  const [days, setDays] = useState<Days>("90");
  const path = `/api/analytics?scope=${scope}&days=${days}`;
  const [loaded, setLoaded] = useState<Record<string, AnalyticsSummary>>({});
  const [error, setError] = useState<{ message: string; needsPlan?: boolean } | null>(null);
  const data = loaded[path] || peekStudio<AnalyticsSummary>(path);

  useEffect(() => {
    let cancelled = false;
    studioFetch<AnalyticsSummary & { error?: string; needsPlan?: boolean }>(path).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError({ message: res.data.error || "Could not load analytics.", needsPlan: res.data.needsPlan });
        return;
      }
      setError(null);
      setLoaded((prev) => ({ ...prev, [path]: res.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error?.needsPlan) return <LockedCard scope={scope} />;
  if (error && !data) return <p className="text-sm text-[#A30D25]">{error.message}</p>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  const k = data.kpis;
  const shop = scope === "shop";
  const s = data.schedule;
  const maxChannel = Math.max(...data.channels.map((c) => c.count), 1);
  const maxService = Math.max(...data.services.map((x) => x.sales), 1);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Period"
          size="sm"
          value={days}
          onChange={setDays}
          options={[
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "365", label: "12 months" },
          ]}
        />
        <p className="text-xs text-neutral-500">
          {shortDate(data.range.from)} to {shortDate(data.range.to)}, compared with the period before
        </p>
      </div>

      {data.empty ? (
        <EmptyState
          title="No appointments yet"
          body={shop ? "Once the team has bookings or walk-ins, the shop's numbers build here on their own." : "Once you've had a booking, your numbers build here on their own."}
        />
      ) : (
        <>
          {data.insights.length ? (
            <Section title="What to do next" description="Worked out from your bookings, most useful first.">
              <div className="grid gap-3 md:grid-cols-2">
                {data.insights.map((i) => (
                  <div key={i.title} className={`${panelClass} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">{i.title}</p>
                      <Tag tone={i.tone === "warn" ? "signal" : i.tone === "good" ? "ink" : "muted"}>{i.tone === "warn" ? "Act on this" : i.tone === "good" ? "Going well" : "Opportunity"}</Tag>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-neutral-600">{i.body}</p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi strong label="Sales" value={cad(k.sales.now)} delta={<Delta pair={k.sales} />} />
            <Kpi label={shop ? "Shop's share" : "Your take"} value={cad(k.take.now)} delta={<Delta pair={k.take} />} sub={shop ? "Commission on team sales" : "After fees and commission"} />
            <Kpi label="Appointments" value={String(k.visits.now)} delta={<Delta pair={k.visits} />} />
            <Kpi label="Average ticket" value={cad(k.avgTicket.now)} delta={<Delta pair={k.avgTicket} />} />
            {!data.locked ? (
              <>
                <Kpi
                  label="Open time booked"
                  value={k.utilization.now === null ? "–" : `${k.utilization.now}%`}
                  delta={<Delta pair={k.utilization} kind="points" />}
                  sub={k.utilization.now === null ? "Set your hours to see this" : undefined}
                />
                <Kpi label="Clients who come back" value={k.rebookRate === null ? "–" : `${k.rebookRate}%`} sub={k.rebookRate === null ? "Needs a few more clients" : "Returned or rebooked after a visit"} />
                <Kpi label="New clients" value={String(k.newClients.now)} delta={<Delta pair={k.newClients} />} />
                <Kpi label="Cancelled or no-show" value={`${k.lostRate.now}%`} delta={<Delta pair={k.lostRate as Pair} kind="points" goodWhenDown />} />
              </>
            ) : null}
          </div>

          <Section title="Sales over time">
            <div className={`${panelClass} p-4 sm:p-5`}>
              <TrendChart data={data.trend} />
            </div>
          </Section>

          <Section title="On the books" description="Booked for the next 30 days.">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Booked sales" value={cad(data.onTheBooks.sales)} />
              <Kpi label="Appointments" value={String(data.onTheBooks.visits)} sub={`${data.onTheBooks.next7Visits} in the next 7 days`} />
              <Kpi label="Regulars on repeat" value={String(data.onTheBooks.regulars)} sub="Standing appointments" />
              <Kpi label="Tips" value={`${k.tipRate.now}%`} delta={<Delta pair={k.tipRate} kind="points" />} sub="Of sales" />
            </div>
          </Section>

          {data.locked ? (
            <LockedCard scope={scope} />
          ) : (
            <>
              {shop && data.team.length ? (
                <Section title="The team" description="Tap a column to rank by it. The best number in each column is in bold.">
                  <TeamTable team={data.team} />
                </Section>
              ) : null}

              <Section
                title="Clients to win back"
                description={
                  data.clients.atRiskCount
                    ? `${data.clients.atRiskCount} overdue with nothing booked. One visit each is worth about ${cad(data.clients.atRiskValue)}.`
                    : "Clients who usually come back sooner and have nothing booked show up here."
                }
              >
                {data.clients.atRisk.length ? (
                  <ul className={`${panelClass} divide-y divide-hairline`}>
                    {data.clients.atRisk.slice(0, 12).map((c, i) => (
                      <li key={`${c.name}-${i}`} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                          <p className="truncate text-xs text-neutral-500">
                            Last in {shortDate(c.last)}, {c.daysSince} days ago
                            {c.usualGap ? ` · usually every ${c.usualGap} days` : " · came once"}
                            {c.proName ? ` · ${c.proName}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums text-ink">{cad(c.avgTicket)}</p>
                          <p className="text-xs text-neutral-500">
                            {c.visits} visit{c.visits === 1 ? "" : "s"}
                          </p>
                        </div>
                        {c.bookingId ? (
                          <Link href={`/bookings/${c.bookingId}`} className={buttonClass("secondary", "sm")}>
                            Message
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`${panelClass} px-4 py-6 text-center text-sm text-neutral-500`}>Nobody is overdue. Nice.</p>
                )}
              </Section>

              <div className="grid gap-8 lg:grid-cols-2">
                <Section title="Clients" description={`${data.clients.active} served this period.`}>
                  <div className={`${panelClass} space-y-4 p-4`}>
                    <div>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="text-neutral-700">Returning</span>
                        <span className="tabular-nums text-ink">{data.clients.returning}</span>
                      </div>
                      <Meter value={data.clients.active ? (data.clients.returning / data.clients.active) * 100 : 0} />
                    </div>
                    <div>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="text-neutral-700">New</span>
                        <span className="tabular-nums text-ink">{data.clients.fresh}</span>
                      </div>
                      <Meter tone="muted" value={data.clients.active ? (data.clients.fresh / data.clients.active) * 100 : 0} />
                    </div>
                    <p className="border-t border-hairline pt-3 text-sm text-neutral-600">
                      {k.retention.rate === null
                        ? "Retention shows once there's a previous period to compare."
                        : `${k.retention.came} of the ${k.retention.of} clients from the period before came back or are booked (${k.retention.rate}%).`}
                    </p>
                  </div>
                </Section>

                <Section title="Best clients" description="By what they've spent, all time.">
                  {data.clients.top.length ? (
                    <ul className={`${panelClass} divide-y divide-hairline`}>
                      {data.clients.top.slice(0, 6).map((c, i) => (
                        <li key={`${c.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="min-w-0 truncate text-ink">{c.name}</span>
                          <span className="shrink-0 tabular-nums text-neutral-500">
                            {c.visits} visit{c.visits === 1 ? "" : "s"} · <span className="font-medium text-ink">{cad(c.spend)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">Shows once clients have visited.</p>
                  )}
                </Section>
              </div>

              <Section
                title={shop ? "The shop's week" : "Your week"}
                description={
                  s.availHoursPerWeek
                    ? `${s.bookedHoursPerWeek} of ${s.availHoursPerWeek} open hours booked in a typical week, at ${cad(s.salesPerHour)} an hour${s.tenPointValue ? `. Every 10 more points booked is about ${cad(s.tenPointValue)} a week` : ""}.`
                    : shop ? "Once the team sets their hours, this shows how much open time is booked." : "Set your hours and this shows how much of your open time is booked."
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={`${panelClass} space-y-3 p-4`}>
                    {WEEK_ORDER.map((dow) => {
                      const d = s.byDay[dow];
                      const rate = d.availMin > 0 ? Math.min(Math.round((d.bookedMin / d.availMin) * 100), 100) : null;
                      return (
                        <div key={dow} className="flex items-center gap-3 text-sm">
                          <span className="w-9 text-neutral-500">{DAYS_SHORT[dow]}</span>
                          <div className="flex-1">
                            <Meter value={rate ?? 0} />
                          </div>
                          <span className="w-28 text-right text-xs tabular-nums text-neutral-500">
                            {rate === null ? (d.visits ? `${d.visits} appts` : "Closed") : `${rate}% · ${cad(d.sales)}`}
                          </span>
                        </div>
                      );
                    })}
                    {s.leadDays !== null ? <p className="border-t border-hairline pt-3 text-xs text-neutral-500">Clients book {s.leadDays} days ahead on average.</p> : null}
                  </div>
                  <div className={`${panelClass} p-4`}>
                    <Heatmap schedule={s} />
                  </div>
                </div>
              </Section>

              {data.services.length ? (
                <Section title="Services" description="Ranked by sales. Per hour shows which ones are worth your time.">
                  <div className={`${panelClass} overflow-x-auto`}>
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-hairline text-left text-xs text-neutral-500">
                          <th className="px-4 py-3 font-medium">Service</th>
                          <th className="px-3 py-3 text-right font-medium">Booked</th>
                          <th className="px-3 py-3 text-right font-medium">Avg price</th>
                          <th className="px-3 py-3 text-right font-medium">Per hour</th>
                          <th className="px-4 py-3 text-right font-medium">Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.services.map((x) => (
                          <tr key={x.name} className="border-b border-hairline last:border-0">
                            <td className="px-4 py-3">
                              <p className="font-medium text-ink">{x.name}</p>
                              <div className="mt-1.5 max-w-[14rem]">
                                <Meter value={(x.sales / maxService) * 100} />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{x.count}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{cad(x.avg)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{cad(x.perHour)}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{cad(x.sales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              ) : null}

              <div className="grid gap-8 lg:grid-cols-2">
                <Section title="How clients book">
                  <div className={`${panelClass} space-y-3 p-4`}>
                    {data.channels.map((c) => (
                      <div key={c.key}>
                        <div className="mb-1.5 flex justify-between gap-3 text-sm">
                          <span className="text-neutral-700">{c.label}</span>
                          <span className="tabular-nums text-neutral-500">
                            {c.count} · <span className="text-ink">{cad(c.sales)}</span>
                          </span>
                        </div>
                        <Meter value={(c.count / maxChannel) * 100} />
                      </div>
                    ))}
                    <p className="border-t border-hairline pt-3 text-xs text-neutral-500">
                      {data.outcomes.cancelled} cancelled and {data.outcomes.noShow} no-show this period, about {cad(data.outcomes.lostSales)} of work.
                    </p>
                  </div>
                </Section>

                <Section title="Getting found" description="This period, on LineUp. Profile visits started counting in November 2026.">
                  <dl className={`${panelClass} divide-y divide-hairline`}>
                    {[
                      [shop ? "Visits to the team's profiles" : "Profile visits", String(data.reach.visits)],
                      ["Booked online", data.reach.visits ? `${data.reach.visitBookings} (${Math.min(Math.round((data.reach.visitBookings / data.reach.visits) * 100), 100)}% of visits)` : String(data.reach.visitBookings)],
                      ["Seen in Explore", String(data.reach.views)],
                      ["Taps through to a profile", data.reach.views ? `${data.reach.taps} (${Math.round((data.reach.taps / data.reach.views) * 100)}%)` : String(data.reach.taps)],
                      ["Saved by clients", String(data.reach.saves)],
                      ["Request offers won", data.reach.offersSent ? `${data.reach.offersWon} of ${data.reach.offersSent} (${Math.round((data.reach.offersWon / data.reach.offersSent) * 100)}%)` : "None sent"],
                      ["Rating", data.reach.rating === null ? "No reviews yet" : `${data.reach.rating} from ${data.reach.reviews} review${data.reach.reviews === 1 ? "" : "s"}`],
                      ["Reviews this period", data.reach.recentReviews ? `${data.reach.recentReviews}, averaging ${data.reach.recentRating}` : "None"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                        <dt className="text-neutral-700">{label}</dt>
                        <dd className="font-medium tabular-nums text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              </div>
            </>
          )}
        </>
      )}

      <p className="max-w-2xl text-xs leading-5 text-neutral-500">
        Sales are service prices for appointments that happened, before fees and tips. Walk-ins and phone bookings count once they&apos;re marked done; a
        walk-in only counts as a returning client if a phone number or name was taken. For money in and out by tax year, see{" "}
        <Link href={shop ? "/studio/earnings" : "/earnings"} className="font-medium text-ink underline underline-offset-2">
          Earnings
        </Link>
        .
      </p>
    </div>
  );
}
