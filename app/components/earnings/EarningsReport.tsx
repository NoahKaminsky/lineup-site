"use client";

// The earnings report, for a pro (their own sales) or a shop (the shop's own
// income, plus every pro's sales through it). Pick a year and a month, see
// the statement, anything that needs fixing, and every sale, then download
// the LineUp earnings statement (PDF) for the accountant.

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { peekStudio, studioFetch } from "@/app/studio/studioApi";
import { Button, EmptyState, Field, Section, Sheet, Tag, fieldClass, panelClass } from "@/app/studio/ui";
import type { AttentionItem, EarningsRow } from "@/app/lib/earnings";
import { PAID_LABEL, TYPE_LABEL, buildStatement, byMonth, byPro, money, type Line } from "@/app/lib/earningsStatement";

type Scope = "me" | "shop";
type Response = { scope: Scope; year: number; name: string | null; rows: EarningsRow[]; attention?: AttentionItem[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIRST_YEAR = 2026;
const DETAILS_KEY = "lu-statement-details";

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function Stat({ label, value, sub, strong = false }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`${panelClass} p-4 ${strong ? "bg-ink text-white ring-0" : ""}`}>
      <p className={`text-xs font-medium ${strong ? "text-white/70" : "text-neutral-500"}`}>{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      {sub ? <p className={`mt-1 text-xs ${strong ? "text-white/60" : "text-neutral-500"}`}>{sub}</p> : null}
    </div>
  );
}

function Lines({ lines, total, totalLabel }: { lines: Line[]; total?: number; totalLabel?: string }) {
  return (
    <dl className={`${panelClass} divide-y divide-hairline`}>
      {lines.map((l) => (
        <div key={l.label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-neutral-700">
            {l.label}
            {l.note ? <span className="block text-xs text-neutral-500">{l.note}</span> : null}
          </dt>
          <dd className="font-medium tabular-nums text-ink">{money(l.cents)}</dd>
        </div>
      ))}
      {totalLabel !== undefined && total !== undefined ? (
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <dt className="font-semibold text-ink">{totalLabel}</dt>
          <dd className="font-semibold tabular-nums text-ink">{money(total)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export default function EarningsReport({ scope }: { scope: Scope }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | "all">(new Date().getMonth());
  const path = `/api/earnings?scope=${scope}&year=${year}`;
  // Answers by year; a year not loaded yet shows this device's last copy.
  const [loaded, setLoaded] = useState<Record<string, Response>>({});
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(50);
  const [askDetails, setAskDetails] = useState(false);
  const data = loaded[path] || peekStudio<Response>(path);

  useEffect(() => {
    let cancelled = false;
    studioFetch<Response>(path).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.data.error || "Could not load earnings.");
        return;
      }
      setError(null);
      setLoaded((prev) => ({ ...prev, [path]: res.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const monthKey = month === "all" ? null : `${year}-${String(month + 1).padStart(2, "0")}`;
  const rows = useMemo(() => {
    const all = data?.year === year ? data.rows : [];
    return monthKey ? all.filter((r) => r.date.startsWith(monthKey)) : all;
  }, [data, year, monthKey]);
  const attention = useMemo(() => {
    const all = data?.year === year ? data.attention || [] : [];
    return monthKey ? all.filter((a) => a.date.startsWith(monthKey)) : all;
  }, [data, year, monthKey]);

  const st = useMemo(() => buildStatement(rows, scope), [rows, scope]);
  const months = useMemo(() => (month === "all" ? byMonth(rows, scope).filter((m) => m.gross || m.costs) : []), [rows, scope, month]);
  const pros = useMemo(() => (scope === "shop" ? byPro(rows) : []), [rows, scope]);

  const period = month === "all" ? String(year) : `${MONTHS[month]} ${year}`;
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  const loading = !data && !error;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${fieldClass} h-10 w-auto pr-8`}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label="Month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value === "all" ? "all" : Number(e.target.value));
            setShown(50);
          }}
          className={`${fieldClass} h-10 w-auto pr-8`}
        >
          <option value="all">Whole year</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Button variant="primary" onClick={() => setAskDetails(true)} disabled={loading}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Download statement (PDF)
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-[#A30D25]">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !rows.length && !attention.length ? (
        <EmptyState
          title={`Nothing for ${period}`}
          body={
            scope === "shop"
              ? "Sales show up here once an appointment's date has passed. Mark walk-ins and phone bookings done in the Calendar so they count."
              : "Sales show up here once an appointment's date has passed."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat strong label="Net income" value={money(st.net)} sub={period} />
            <Stat label="Gross income" value={money(st.grossIncome)} sub={scope === "shop" ? "The shop's own income" : "Before fees and commission"} />
            <Stat label="Costs recorded in LineUp" value={money(st.totalCosts)} />
          </div>

          {attention.length ? (
            <Section
              title={`Needs attention (${attention.length})`}
              description="These may keep your totals from being complete. Fix them and the statement updates."
            >
              <ul className={`${panelClass} divide-y divide-hairline`}>
                {attention.slice(0, 20).map((a, i) => (
                  <li key={`${a.date}-${i}`} className="flex gap-3 px-4 py-3 text-sm">
                    <span className="w-14 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(a.date)}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {a.item}
                        {scope === "shop" && a.proName ? <span className="font-normal text-neutral-500"> · {a.proName}</span> : null}
                      </p>
                      <p className="text-xs text-[#A30D25]">{a.issue}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {attention.length > 20 ? <p className="mt-2 text-xs text-neutral-500">The PDF lists all {attention.length}.</p> : null}
            </Section>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Income">
              <Lines lines={st.income} total={st.grossIncome} totalLabel="Gross income" />
            </Section>
            <Section title="Costs">
              {st.costs.length ? <Lines lines={st.costs} total={st.totalCosts} totalLabel="Total costs" /> : <p className="text-sm text-neutral-500">None recorded.</p>}
            </Section>
          </div>

          {st.activity.length ? (
            <Section title="Appointments" description="Every kind of booking, counted once. Amounts include tips.">
              <dl className={`${panelClass} divide-y divide-hairline`}>
                {st.activity.map((a) => (
                  <div key={a.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-neutral-700">{a.label}</dt>
                    <dd className="flex gap-6 tabular-nums">
                      <span className="text-neutral-500">{a.count}</span>
                      <span className="w-24 text-right font-medium text-ink">{money(a.cents)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          {pros.length ? (
            <Section title="Team sales, by pro" description="Each pro's sales through the shop. Booth renters keep their sales; the shop gets their rent.">
              <div className={`${panelClass} overflow-x-auto`}>
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-neutral-500">
                      <th className="px-4 py-3 font-medium">Pro</th>
                      <th className="px-3 py-3 text-right font-medium">Appts</th>
                      <th className="px-3 py-3 text-right font-medium">Sales</th>
                      <th className="px-3 py-3 text-right font-medium">Tips</th>
                      <th className="px-3 py-3 text-right font-medium">At shop</th>
                      <th className="px-3 py-3 text-right font-medium">To shop</th>
                      <th className="px-4 py-3 text-right font-medium">To pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pros.map((p) => (
                      <tr key={p.id} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{p.count}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.sales)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.tips)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{money(p.atShop)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.toShop)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.toPro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {months.length > 1 ? (
            <Section title="By month">
              <div className={`${panelClass} overflow-x-auto`}>
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-neutral-500">
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-3 py-3 text-right font-medium">Gross</th>
                      <th className="px-3 py-3 text-right font-medium">Costs</th>
                      <th className="px-4 py-3 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-3 font-medium text-ink">{MONTHS[m.month]}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(m.gross)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(m.costs)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(m.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {rows.length ? (
            <Section title="Every sale" description={`${rows.length} line${rows.length === 1 ? "" : "s"} for ${period}. The PDF has every column.`}>
              <ul className={`${panelClass} divide-y divide-hairline`}>
                {rows
                  .slice()
                  .reverse()
                  .slice(0, shown)
                  .map((r) => {
                    const amount = scope === "shop" ? r.toShopCents : r.toProCents;
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-14 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(r.date)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{r.item}</p>
                          <p className="truncate text-xs text-neutral-500">
                            {[TYPE_LABEL[r.type], r.channel === "request" ? "from a request" : r.channel === "regular" ? "regular" : null, scope === "shop" ? r.proName : null, r.client]
                              .filter(Boolean)
                              .join(" · ")}
                            {r.tipCents ? ` · tip ${money(r.tipCents)}` : ""}
                            {r.giftCents ? ` · ${money(r.giftCents)} gift card` : ""}
                          </p>
                        </div>
                        <Tag tone={r.paidVia === "lineup" ? "muted" : "outline"}>{r.paidVia === "at_shop" ? "At the shop" : PAID_LABEL[r.paidVia]}</Tag>
                        <span className={`w-20 shrink-0 text-right text-sm font-medium tabular-nums ${amount < 0 ? "text-neutral-500" : "text-ink"}`}>
                          {money(amount)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              {rows.length > shown ? (
                <div className="mt-4 flex justify-center">
                  <Button onClick={() => setShown((n) => n + 100)}>Show more</Button>
                </div>
              ) : null}
            </Section>
          ) : null}
        </>
      )}

      <p className="max-w-2xl text-xs leading-5 text-neutral-500">
        Gross income counts each dollar once: fees, the shop&apos;s commission, booth rent and your LineUp plan are listed as costs. A gift card counts
        when it&apos;s sold, not when it&apos;s used. Walk-ins and phone bookings count once they&apos;re marked done. LineUp doesn&apos;t add GST, so if
        you&apos;re registered, your prices include it. This is a record for you and your accountant, not tax advice.
      </p>

      <StatementSheet open={askDetails} onClose={() => setAskDetails(false)} scope={scope} year={year} month={month} />
    </div>
  );
}

// Optional details for the statement header, remembered on this device.
function StatementSheet({ open, onClose, scope, year, month }: { open: boolean; onClose: () => void; scope: Scope; year: number; month: number | "all" }) {
  const [name, setName] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem(DETAILS_KEY) || "{}") as { name?: string }).name || "";
    } catch {
      return "";
    }
  });
  const [gst, setGst] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem(DETAILS_KEY) || "{}") as { gst?: string }).gst || "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(DETAILS_KEY, JSON.stringify({ name: name.trim(), gst: gst.trim() }));
      } catch {
        /* storage unavailable */
      }
      const params = new URLSearchParams({ scope, year: String(year), month: month === "all" ? "all" : String(month) });
      if (name.trim()) params.set("name", name.trim());
      if (gst.trim()) params.set("gst", gst.trim());
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/earnings/statement?${params}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not make the statement.");
      }
      const blob = await res.blob();
      const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "lineup-earnings.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the statement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Earnings statement"
      description={`${month === "all" ? `All of ${year}` : `${MONTHS[month]} ${year}`}, as a PDF for your records and your accountant.`}
      footer={
        <Button variant="primary" loading={busy} onClick={download}>
          Download PDF
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label={scope === "shop" ? "Legal business name" : "Legal name"} htmlFor="st-name" optional hint="As it appears on your tax return.">
          <input id="st-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
        </Field>
        <Field label="GST/HST number" htmlFor="st-gst" optional hint="If you're registered. Only printed on the statement, not saved by LineUp.">
          <input id="st-gst" className={fieldClass} value={gst} onChange={(e) => setGst(e.target.value)} maxLength={30} placeholder="123456789 RT0001" />
        </Field>
        {error ? <p className="text-[13px] text-[#A30D25]">{error}</p> : null}
      </div>
    </Sheet>
  );
}
