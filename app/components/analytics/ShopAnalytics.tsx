"use client";

// A shop's Analytics, for the owner and managers: which pros, chairs and
// hours make the shop money, where it's leaking, and one thing to do about
// each. Every section loads on its own from /api/analytics/shop; no money
// is worked out here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { studioFetch } from "@/app/studio/studioApi";
import { Button, Segmented, Sheet, buttonClass, fieldClass, panelClass } from "@/app/studio/ui";
import type { ShopSuggestion } from "@/app/lib/analyticsInsights";
import { AlertsList, Bars, Card, CsvLinks, Delta, Kpi, PdfButton, RevenueChart, cad, qs, st, type Query, type S } from "./ProAnalytics";
import { SHOP_SAMPLE } from "./shopAnalyticsSample";

const BASE = "/api/analytics/shop";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
] as const;
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const pctOr = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n}%`);

type ProRow = { id: string; name: string; revenue: number; bookings: number; bookedHours: number; use: number | null; perHour: number; rebook: number | null; rating: number | null; noShows: number; winRate: number | null };
const TEAM_COLS: { key: keyof ProRow; label: string; fmt: (t: ProRow) => string }[] = [
  { key: "revenue", label: "Revenue", fmt: (t) => cad(t.revenue) },
  { key: "bookedHours", label: "Booked hours", fmt: (t) => `${t.bookedHours}` },
  { key: "use", label: "Hours used", fmt: (t) => pctOr(t.use) },
  { key: "perHour", label: "Per hour", fmt: (t) => cad(t.perHour) },
  { key: "rebook", label: "Rebook", fmt: (t) => pctOr(t.rebook) },
  { key: "rating", label: "Rating", fmt: (t) => (t.rating === null ? "–" : `${t.rating} ★`) },
  { key: "noShows", label: "No-shows", fmt: (t) => `${t.noShows}` },
  { key: "winRate", label: "Offers won", fmt: (t) => pctOr(t.winRate) },
];

function Team({ s, onPick }: { s: S; onPick: (id: string) => void }) {
  const d = s.data;
  const [sort, setSort] = useState<keyof ProRow>("revenue");
  const rows = ((d?.team || []) as ProRow[]).slice().sort((a, b) => Number(b[sort] ?? -1) - Number(a[sort] ?? -1) || a.name.localeCompare(b.name));
  return (
    <Card id="team" title="Team" state={st(s)} suggestion={d?.suggestion as never} headline={d ? `${rows.length} pro${rows.length === 1 ? "" : "s"}` : undefined} sub={d && rows.length === 1 ? "The comparison fills in once a second pro joins." : null}>
      {d ? (
        <>
          {d.flags.some((f: { text: string }) => !String(d.suggestion?.text || "").startsWith(f.text)) ? (
            <ul className="mb-4 space-y-1.5">
              {(d.flags as { proId: string; text: string }[]).filter((f) => !String(d.suggestion?.text || "").startsWith(f.text)).map((f) => (
                <li key={f.text} className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-ink">
                  {f.text}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-neutral-500 lg:hidden">
            Sort by
            <select className={`${fieldClass} h-9`} value={sort} onChange={(e) => setSort(e.target.value as keyof ProRow)} aria-label="Sort the team by">
              {TEAM_COLS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {/* Phones: stacked cards. */}
          <ul className="mt-3 space-y-2.5 lg:hidden">
            {rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onPick(t.id)} className="w-full rounded-xl bg-neutral-50 p-3.5 text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">{t.name}</span>
                    <span className="tabular-nums text-ink">{TEAM_COLS.find((c) => c.key === sort)!.fmt(t)}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {cad(t.revenue)} · {t.use === null ? "no weekly hours set" : `${pctOr(t.use)} of hours booked`} · {cad(t.perHour)}/h · rebook {pctOr(t.rebook)} · {t.noShows} no-show{t.noShows === 1 ? "" : "s"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {/* Desktop: a table, sortable by any column. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-neutral-500">
                  <th className="py-2 text-left font-medium">Pro</th>
                  {TEAM_COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-right font-medium" aria-sort={sort === c.key ? "descending" : "none"}>
                      <button type="button" onClick={() => setSort(c.key)} className={`rounded px-1 hover:text-ink ${sort === c.key ? "text-ink underline underline-offset-4" : ""}`}>
                        {c.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-hairline last:border-0">
                    <td className="py-2.5">
                      <button type="button" onClick={() => onPick(t.id)} className="font-medium text-ink underline decoration-neutral-300 underline-offset-4 hover:decoration-ink">
                        {t.name}
                      </button>
                    </td>
                    {TEAM_COLS.map((c) => (
                      <td key={c.key} className="px-2 py-2.5 text-right tabular-nums text-neutral-700">
                        {c.fmt(t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function ProSheet({ id, q, onClose }: { id: string | null; q: Query; onClose: () => void }) {
  const [data, setData] = useState<{ key: string; d: Record<string, never> & Record<string, unknown> } | null>(null);
  const key = `${id}?${qs(q)}`;
  useEffect(() => {
    if (!id) return;
    let live = true;
    studioFetch<Record<string, unknown>>(`${BASE}?section=pro&pro=${id}&${qs(q)}`).then((res) => live && setData({ key, d: res.data as never }));
    return () => {
      live = false;
    };
  }, [id, key, q]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data?.key === key ? (data.d as any) : null;
  return (
    <Sheet open={!!id} onClose={onClose} title={d?.name || "Team member"}>
      {!d ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      ) : d.error ? (
        <p className="text-sm text-neutral-600">{d.error}</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-neutral-500">Their work at the shop only.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Kpi label="Revenue" value={cad(d.revenue.now)} pair={d.revenue} />
            <Kpi label="Bookings" value={String(d.bookings.now)} pair={d.bookings} />
            <Kpi label="Average ticket" value={cad(d.avgTicket.now)} pair={d.avgTicket} />
            <Kpi label="Rebooked" value={pctOr(d.rebook.now)} pair={d.rebook} kind="points" />
          </div>
          <RevenueChart data={d.series} compareLabel="before" />
          {d.services.length ? <Bars rows={d.services.map((x: { label: string; revenue: number; count: number }) => ({ label: x.label, value: x.revenue, note: `${x.count}` }))} /> : null}
          <p className="text-sm text-neutral-600">{d.overdue ? `${d.overdue} of their regulars are overdue.` : "None of their regulars are overdue."}</p>
        </div>
      )}
    </Sheet>
  );
}

// The whole page in one request (nine at once queue on the server).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sections = Record<string, any>;
function useShopSections(q: Query) {
  const key = qs(q);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; sections: Sections | null; error: string | null; needsPlan: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    studioFetch<{ sections?: Sections; error?: string; needsPlan?: boolean }>(`${BASE}?section=all&${key}`).then((res) => {
      if (!live) return;
      setState({ key: `${key}#${retry}`, sections: res.ok ? res.data.sections || null : null, error: res.ok ? null : res.data.error || "Could not load the shop's analytics.", needsPlan: !!res.data.needsPlan });
    });
    return () => {
      live = false;
    };
  }, [key, retry]);
  const current = state?.key === `${key}#${retry}` ? state : null;
  return { sections: current?.sections || null, error: current?.error || null, needsPlan: !!current?.needsPlan, loading: !current, retry: () => setRetry((n) => n + 1) };
}

export default function ShopAnalytics() {
  const [q, setQ] = useState<Query>({ period: "month", from: "", to: "", compare: "previous", service: "" });
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [pro, setPro] = useState<string | null>(null);
  const tick = 0;
  const all = useShopSections(q);
  const sample = all.needsPlan;
  const pick = (name: keyof typeof SHOP_SAMPLE): S =>
    sample
      ? { data: SHOP_SAMPLE[name] as never, locked: false, error: null, needsPlan: false, loading: false, retry: () => {} }
      : { data: (all.sections?.[name] && !all.sections[name].error ? all.sections[name] : null) as never, locked: false, error: all.error || all.sections?.[name]?.error || null, needsPlan: false, loading: all.loading, retry: all.retry };
  const overview = pick("overview");
  const team = pick("team");
  const chairs = pick("chairs");
  const channels = pick("channels");
  const clients = pick("clients");
  const memberships = pick("memberships");
  const rent = pick("rent");
  const forecast = pick("forecast");
  const local = pick("local");

  const o = overview.data;
  const services: string[] = o?.services || [];
  const sug = (s: S) => (s.data?.suggestion as ShopSuggestion | null) || null;

  return (
    <div className="space-y-4">
      {sample ? (
        <div className={`${panelClass} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="text-sm font-semibold text-ink">This is an example with sample numbers</p>
            <p className="mt-1 text-sm text-neutral-600">Shop analytics come with Studio and Studio Plus. Here&apos;s what yours would show.</p>
          </div>
          <Link href="/studio/plans" className={`${buttonClass("primary")} shrink-0`}>
            See plans
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={q.period} onChange={(period) => setQ((x) => ({ ...x, period }))} options={PERIODS.map((p) => ({ ...p }))} label="Period" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select aria-label="Compare with" className={`${fieldClass} h-10`} value={q.compare} onChange={(e) => setQ((x) => ({ ...x, compare: e.target.value as Query["compare"] }))}>
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
        {!sample ? <PdfButton scope="shop" q={q} /> : null}
      </div>
      {q.period === "custom" ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQ((x) => ({ ...x, from: draft.from, to: draft.to })); }}>
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
      {!sample ? <AlertsList scope="shop" tick={tick} /> : null}

      {!sample && o?.empty ? (
        <div className={`${panelClass} p-6`}>
          <p className="text-sm font-semibold text-ink">Your shop&apos;s analytics start with its first appointments</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-600">
            Once your team takes bookings and walk-ins, this page compares your pros, shows which chairs and hours earn the most, where clients come from, and what the next 30 days look like.
          </p>
          <Link href="/studio/schedule" className={`${buttonClass("primary")} mt-4`}>
            Open the schedule
          </Link>
        </div>
      ) : null}

      {q.period === "custom" && (!q.from || !q.to) ? null : (
        <CsvLinks.Provider value={(name) => (sample ? null : `${BASE}?section=${name}&${qs(q)}&format=csv`)}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <Card id="overview" title="Shop revenue" state={st(overview)} suggestion={sug(overview) as never} headline={o ? cad(o.revenue.now) : undefined} sub={o ? <Delta pair={o.revenue} /> : null}>
                {o ? (
                  <>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <Kpi label="Bookings" value={String(o.bookings.now)} pair={o.bookings} />
                      <Kpi label="New clients" value={String(o.newClients.now)} pair={o.newClients} />
                      <Kpi label="Rebooked" value={pctOr(o.rebook.now)} pair={o.rebook} kind="points" />
                      <Kpi label="Average ticket" value={cad(o.avgTicket.now)} pair={o.avgTicket} />
                      <Kpi label="Shop's own income" value={cad(o.own.total)} pair={{ now: o.own.total, prev: o.ownPrev.total }} />
                    </div>
                    <p className="mt-3 text-xs text-neutral-500">
                      Own income: {cad(o.own.commission)} commission from the team, {cad(o.own.boothRent)} booth rent, {cad(o.own.memberships)} memberships.
                    </p>
                    <div className="mt-5">
                      <RevenueChart data={o.series} compareLabel={q.compare === "last_year" ? "same time last year" : "period before"} />
                    </div>
                    <p className="mt-4 text-xs text-neutral-500">
                      The team&apos;s service sales after refunds, counted the same way as Earnings.{" "}
                      <Link href="/studio/earnings" className="font-medium text-ink underline underline-offset-2">
                        See full earnings
                      </Link>
                    </p>
                  </>
                ) : null}
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Team s={team} onPick={sample ? () => {} : setPro} />
            </div>
            <Card id="chairs" title="Chairs" state={st(chairs)} suggestion={sug(chairs) as never} headline={chairs.data ? `${chairs.data.chairs.reduce((t: number, c: { emptyHours: number }) => t + c.emptyHours, 0)} h` : undefined} sub={chairs.data ? "of open chair time not booked this period. Each pro's hours are their chair." : null}>
              {chairs.data ? (
                <div className="space-y-5">
                  <ul className="divide-y divide-hairline">
                    {chairs.data.chairs.map((c: { proId: string; name: string; use: number | null; revenuePerChairHour: number; emptyHours: number; emptiestDay: { dow: number; emptyPercent: number } | null }) => (
                      <li key={c.proId} className="py-2.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-ink">{c.name}</span>
                          <span className="tabular-nums text-ink">{c.use === null ? "No weekly hours set" : `${cad(c.revenuePerChairHour)} per chair-hour`}</span>
                        </div>
                        <p className="text-xs text-neutral-500">
                          {c.use === null ? "Set their hours in Calendar to see how full their chair is." : `${pctOr(c.use)} used · ${c.emptyHours} empty hours${c.emptiestDay ? ` · ${DAYS[c.emptiestDay.dow]}s ${c.emptiestDay.emptyPercent}% empty` : ""}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <h3 className="mb-2 text-xs font-medium text-neutral-500">Chair openings</h3>
                    <Bars format={(n) => n.toLocaleString("en-CA")} rows={[{ label: "Views by pros", value: chairs.data.funnel.views }, { label: "Applications", value: chairs.data.funnel.applications }, { label: "Hired", value: chairs.data.funnel.hires }]} />
                  </div>
                </div>
              ) : null}
            </Card>
            <Card id="channels" title="Bookings by channel" state={st(channels)} suggestion={sug(channels) as never} headline={channels.data ? cad(channels.data.channels.reduce((t: number, c: { revenue: number }) => t + c.revenue, 0)) : undefined} sub={channels.data ? "Where the team's work came from this period." : null}>
              {channels.data ? <Bars rows={channels.data.channels.map((c: { label: string; revenue: number; count: number }) => ({ label: c.label, value: c.revenue, note: `${c.count} booking${c.count === 1 ? "" : "s"}` }))} /> : null}
            </Card>
            <div className="lg:col-span-2">
              <Card id="clients" title="Clients" state={st(clients)} suggestion={sug(clients) as never} headline={clients.data ? `${clients.data.newClients + clients.data.returning}` : undefined} sub={clients.data ? `${clients.data.newClients} new and ${clients.data.returning} returning. ${clients.data.shared.shared} of ${clients.data.shared.total} clients have seen more than one pro.` : null}>
                {clients.data ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-medium text-neutral-500">Came back within 30, 60 and 90 days, by first-visit month</h3>
                      <Bars max={100} format={(n) => `${n}%`} rows={clients.data.retention.map((m: { label: string; d30: number | null; d60: number | null; d90: number | null; newClients: number }) => ({ label: `${m.label} (${m.newClients} new)`, value: m.d90 ?? m.d60 ?? m.d30 ?? 0, note: `30d ${m.d30 ?? "…"} · 60d ${m.d60 ?? "…"} · 90d ${m.d90 ?? "…"}` }))} />
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-neutral-500">
                        At risk of leaving the shop: {clients.data.leavingCount}, worth about {cad(clients.data.leavingValue)} a visit
                      </h3>
                      <ul className="mt-2 divide-y divide-hairline">
                        {clients.data.leaving.slice(0, 6).map((c: { key: string; name: string; last: string; daysSince: number; usualGap: number | null; avgTicket: number }) => (
                          <li key={c.key} className="py-2 text-sm">
                            <span className="text-ink">{c.name}</span>
                            <span className="block text-xs text-neutral-500">
                              Usually every {c.usualGap} days, last on {shortDate(c.last)} · {cad(c.avgTicket)} a visit
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
            <Card id="memberships" title="Memberships" state={st(memberships)} suggestion={sug(memberships) as never} headline={memberships.data ? `${memberships.data.active}` : undefined} sub={memberships.data ? `active members, ${cad(memberships.data.income)} in membership income this period.` : null}>
              {memberships.data ? (
                <dl className="grid grid-cols-2 gap-2.5 text-sm">
                  {[
                    ["Sign-ups", memberships.data.signups],
                    ["Cancellations", memberships.data.cancelled],
                    ["Cancellation rate", pctOr(memberships.data.cancelRate)],
                    ["No visit in 30 days", memberships.data.idle],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-neutral-50 p-3">
                      <dt className="text-xs text-neutral-500">{k}</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </Card>
            <Card id="rent" title="Booth rent" state={st(rent)} suggestion={sug(rent) as never} headline={rent.data ? cad(rent.data.collected) : undefined} sub={rent.data ? (rent.data.rent.length ? `collected this period. ${cad(rent.data.due)} due next, ${cad(rent.data.lateCents)} late.` : "Nobody on the team pays booth rent.") : null}>
              {rent.data?.rent.length ? (
                <ul className="divide-y divide-hairline">
                  {rent.data.rent.map((r: { proId: string; name: string; paidCents: number; dueCents: number; dueDate: string | null; late: boolean; interval: string }) => (
                    <li key={r.proId} className="flex justify-between gap-3 py-2.5 text-sm">
                      <span className="text-ink">{r.name}</span>
                      <span className="text-right text-neutral-600">
                        {cad(r.paidCents)} paid · {r.late ? <strong className="font-medium text-ink">late</strong> : `${cad(r.dueCents)} due ${r.dueDate ? shortDate(r.dueDate) : ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
            <Card id="forecast" title="Next 30 days" state={st(forecast)} suggestion={sug(forecast) as never} headline={forecast.data ? cad(forecast.data.confirmed + forecast.data.expected) : undefined} sub={forecast.data ? `${cad(forecast.data.confirmed)} confirmed, ${cad(forecast.data.expected)} expected from regulars due back.` : null}>
              {forecast.data ? <Bars rows={forecast.data.weeks.map((w: { label: string; confirmed: number; expected: number }) => ({ label: `Week of ${w.label}`, value: w.confirmed + w.expected, note: `${cad(w.confirmed)} confirmed` }))} /> : null}
            </Card>
            <Card id="local" title="Against local shops" state={st(local)} suggestion={sug(local) as never} sub={local.data ? (local.data.enough ? `The middle of ${local.data.shops} other shops in your city, last 90 days. Never any shop's name or own figures.` : "There isn't enough local data yet. This shows once at least 5 other shops in your city qualify.") : null}>
              {local.data?.enough ? (
                <dl className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <dt className="text-xs text-neutral-500">Average ticket</dt>
                    <dd className="mt-0.5 text-ink">
                      {cad(local.data.mine.avgTicket)} <span className="text-neutral-500">vs {cad(local.data.medianTicket)}</span>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <dt className="text-xs text-neutral-500">Rebook rate</dt>
                    <dd className="mt-0.5 text-ink">
                      {pctOr(local.data.mine.rebook)} <span className="text-neutral-500">vs {pctOr(local.data.medianRebook)}</span>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </Card>
          </div>
        </CsvLinks.Provider>
      )}
      <ProSheet id={pro} q={q} onClose={() => setPro(null)} />
    </div>
  );
}
