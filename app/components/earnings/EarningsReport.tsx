"use client";

// Earnings, for a pro (their own money) or a shop (the shop's own money and
// the team's). Pick a range, read the sentence at the top, see what's on its
// way, and open any line to see every fee. Every number comes from
// app/lib/earningsCore; this file only lays them out.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, ChevronDown, FileText, Landmark, Plus, RotateCw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { peekStudio, studioFetch } from "@/app/studio/studioApi";
import { Button, EmptyState, Field, Section, Segmented, Sheet, Tag, fieldClass, panelClass } from "@/app/studio/ui";
import type { AttentionItem, EarningsRow, Payouts } from "@/app/lib/earnings";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/app/lib/expenseCategories";
import { PAID_LABEL, TYPE_LABEL, buildStatement, money, type Line } from "@/app/lib/earningsStatement";
import { boothRentStatus, checkRange, headline, lineBreakdown, rangeFor, shopSplit, type RangeKind, type RentMember } from "@/app/lib/earningsCore";

type Scope = "me" | "shop";
type Response = {
  scope: Scope;
  year: number;
  from: string;
  to: string;
  today: string;
  name: string | null;
  rows: EarningsRow[];
  attention?: AttentionItem[];
  payouts?: Payouts;
  // pro
  inShop?: boolean;
  solo?: boolean;
  // shop
  ownerId?: string;
  rent?: RentMember[];
};

const DETAILS_KEY = "lu-statement-details";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RANGES: { value: RangeKind; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Etc/GMT+5" });
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

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-neutral-100 ${className}`} />;
}

export default function EarningsReport({ scope }: { scope: Scope }) {
  const [range, setRange] = useState<RangeKind>("week");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => rangeFor("month", todayKey()));
  const [draft, setDraft] = useState(custom);
  const [loaded, setLoaded] = useState<Record<string, Response>>({});
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(40);
  const [askDetails, setAskDetails] = useState(false);
  const [adding, setAdding] = useState<EntryKind | null>(null);
  const [tick, setTick] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const { from, to } = range === "custom" ? custom : rangeFor(range, todayKey());
  const path = `/api/earnings?scope=${scope}&from=${from}&to=${to}`;
  const data = loaded[path] || peekStudio<Response>(path);

  useEffect(() => {
    let cancelled = false;
    studioFetch<Response>(path).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.data.error || "We couldn't load your earnings.");
        return;
      }
      setError(null);
      setLoaded((prev) => ({ ...prev, [path]: res.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  async function remove(r: EarningsRow) {
    if (!r.entry || !window.confirm(`Remove "${r.item}" from your records?`)) return;
    setRemoving(r.id);
    const res = await studioFetch<{ error?: string }>(`/api/earnings/entries?scope=${scope}&kind=${r.entry}&id=${r.id}`, { method: "DELETE" });
    setRemoving(null);
    if (!res.ok) return setError(res.data.error || "Could not remove that.");
    setTick((n) => n + 1);
  }

  async function openStripe() {
    setOpening(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/stripe/connect/dashboard-link", {
      method: "POST",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setOpening(false);
    if (json.url) window.location.href = json.url;
    else setError(json.error || "We couldn't open Stripe. Try again from your account.");
  }

  const rows = useMemo(() => data?.rows || [], [data]);
  const attention = data?.attention || [];
  const st = useMemo(() => buildStatement(rows, scope), [rows, scope]);
  const split = useMemo(() => (scope === "shop" ? shopSplit(rows, data?.ownerId || null) : null), [rows, scope, data?.ownerId]);
  const rentMembers = data?.rent;
  const rent = useMemo(() => (scope === "shop" && rentMembers?.length ? boothRentStatus(rentMembers, rows) : []), [scope, rentMembers, rows]);

  const period =
    range === "week" ? "this week" : range === "month" ? "this month" : range === "year" ? `in ${from.slice(0, 4)}` : `from ${shortDate(from)} to ${shortDate(to)}`;
  const sentence = data ? headline(st.summary, data.payouts || null, period, scope) : "";
  const pdfMonth: number | "all" = from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(5, 7)) - 1 : "all";
  const p = data?.payouts;

  const rangeTabs = (
    <div role="tablist" aria-label="Range" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          role="tab"
          aria-selected={range === r.value}
          onClick={() => {
            setRange(r.value);
            setShown(40);
          }}
          className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
            range === r.value ? "bg-ink text-white" : "bg-ink/[0.05] text-neutral-600 hover:text-ink"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const customError = range === "custom" ? checkRange(draft.from, draft.to) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {rangeTabs}
        <div className="flex flex-wrap gap-2">
          {scope === "me" ? (
            <Button onClick={() => setAdding("sale")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a walk-in payment
            </Button>
          ) : null}
          <Button onClick={() => setAdding("expense")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add an expense
          </Button>
          <Button variant="ghost" onClick={() => setAskDetails(true)} disabled={!data}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Statement (PDF)
          </Button>
        </div>
      </div>

      {range === "custom" ? (
        <div className={`${panelClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-end`}>
          <Field label="From" htmlFor="earn-from" className="sm:w-44">
            <input id="earn-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="To" htmlFor="earn-to" className="sm:w-44">
            <input id="earn-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className={fieldClass} />
          </Field>
          <Button variant="primary" disabled={!!customError} onClick={() => setCustom(draft)}>
            Show
          </Button>
          {customError ? <p className="text-sm text-neutral-500">{customError}</p> : null}
        </div>
      ) : null}

      {error && !data ? (
        <div className={`${panelClass} flex flex-col items-start gap-3 p-5`} role="alert">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </p>
          <Button onClick={() => setTick((n) => n + 1)}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading earnings">
          <div className="space-y-4">
            <SkeletonBlock className="h-36" />
            <SkeletonBlock className="h-40" />
            <SkeletonBlock className="h-64" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonBlock key={i} className="h-14" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          {/* Left: the figures. On phones this all comes first. */}
          <div className="space-y-8">
            <div className={`${panelClass} p-5 sm:p-6`}>
              <p className="text-sm text-neutral-500">{scope === "shop" ? "The shop's net" : "Your net earnings"} {period}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-[-0.03em] text-ink">{money(st.net)}</p>
              <p className="mt-3 text-[15px] leading-7 text-neutral-700">{sentence}</p>
              {error ? <p className="mt-2 text-sm text-[#A30D25]">{error}</p> : null}
            </div>

            <OnTheWay payouts={p} scope={scope} onOpenStripe={openStripe} opening={opening} />

            {attention.length ? (
              <Section title={`Needs a look (${attention.length})`} description="These can keep your totals from being complete.">
                <ul className={`${panelClass} divide-y divide-hairline`}>
                  {attention.slice(0, 10).map((a, i) => (
                    <li key={`${a.date}-${i}`} className="flex gap-3 px-4 py-3 text-sm">
                      <span className="w-14 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(a.date)}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {a.item}
                          {scope === "shop" && a.proName ? <span className="font-normal text-neutral-500"> · {a.proName}</span> : null}
                        </p>
                        <p className="text-xs text-neutral-600">{a.issue}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {scope === "shop" && split ? (
              <>
                <Section title="The shop's own money" description="What the shop keeps: its cut, rent, memberships, gift cards, products and the owner's own appointments.">
                  <Lines
                    lines={[
                      { label: "Commission from the team", cents: split.shopOwn.commission },
                      { label: "Booth rent", cents: split.shopOwn.boothRent },
                      { label: "Memberships", cents: split.shopOwn.memberships },
                      { label: "Gift card sales", cents: split.shopOwn.giftCards },
                      { label: "Product sales", cents: split.shopOwn.products },
                      { label: "Owner's own appointments", cents: split.shopOwn.ownerServices, note: "What the owner took home from their own clients" },
                      ...(st.summary.lineupCommission + st.summary.cardFees ? [{ label: "LineUp and card fees", cents: -(st.summary.lineupCommission + st.summary.cardFees) }] : []),
                      ...(st.summary.lineupPlan ? [{ label: "LineUp plan", cents: -st.summary.lineupPlan }] : []),
                      ...(st.summary.expenses ? [{ label: "Expenses", cents: -st.summary.expenses }] : []),
                    ].filter((l) => l.cents)}
                    total={split.shopOwn.total}
                    totalLabel="The shop's own money"
                  />
                </Section>

                <Section title="Money that belongs to your team" description="Each pro's sales through the shop, the shop's cut, and what they keep.">
                  {split.team.length ? (
                    <ul className={`${panelClass} divide-y divide-hairline`}>
                      {split.team.map((t) => (
                        <li key={t.proId} className="grid grid-cols-2 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-x-6">
                          <span className="col-span-2 font-medium text-ink sm:col-span-1">
                            {t.name} <span className="font-normal text-neutral-500">· {t.count}</span>
                          </span>
                          <span className="text-neutral-500 sm:text-right">
                            Gross <span className="tabular-nums text-ink">{money(t.gross)}</span>
                          </span>
                          <span className="text-right text-neutral-500">
                            Shop <span className="tabular-nums text-ink">{money(t.shopCut)}</span>
                          </span>
                          <span className="col-span-2 text-right font-medium tabular-nums text-ink sm:col-span-1">Their take {money(t.take)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">No team sales {period}.</p>
                  )}
                </Section>

                {rent.length ? (
                  <Section title="Booth rent" description={`Paid ${period}, and what's due next.`}>
                    <ul className={`${panelClass} divide-y divide-hairline`}>
                      {rent.map((r) => (
                        <li key={r.proId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                          <span className="min-w-0 flex-1 font-medium text-ink">{r.name}</span>
                          <span className="text-neutral-500">
                            Paid <span className="tabular-nums text-ink">{money(r.paidCents)}</span>
                          </span>
                          <span className="text-neutral-500">
                            {money(r.dueCents)} a {r.interval}
                            {r.dueDate ? `, next ${shortDate(r.dueDate)}` : ""}
                          </span>
                          {r.late ? <Tag tone="ink">Late: last payment failed</Tag> : <Tag tone="outline">Up to date</Tag>}
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            ) : (
              <Section title="From sales to what you keep">
                <Lines
                  lines={[
                    ...st.income,
                    ...st.costs.map((c) => ({ ...c, cents: -c.cents })),
                  ]}
                  total={st.net}
                  totalLabel="What you keep"
                />
              </Section>
            )}
          </div>

          {/* Right: every line, newest first. */}
          <Section
            title="Every booking and sale"
            description={rows.length ? `${rows.length} ${rows.length === 1 ? "line" : "lines"} ${period}. Open one to see every fee.` : undefined}
          >
            {rows.length ? (
              <>
                <ul className={`${panelClass} divide-y divide-hairline`}>
                  {rows
                    .slice()
                    .reverse()
                    .slice(0, shown)
                    .map((r) => (
                      <TransactionRow key={r.id} row={r} scope={scope} onRemove={r.entry ? () => void remove(r) : undefined} removing={removing === r.id} />
                    ))}
                </ul>
                {rows.length > shown ? (
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => setShown((n) => n + 100)}>Show more</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title={`Nothing ${period} yet`}
                body={
                  scope === "shop"
                    ? "Your team's first booking will show up here. Walk-ins and phone bookings count once they're marked done on the Calendar."
                    : "Your first booking will show up here. Share your booking link to get one, or add a walk-in payment you took in person."
                }
                action={
                  scope === "shop" ? (
                    <Link href="/studio/calendar" className="text-sm font-medium text-ink underline underline-offset-2">
                      Open the Calendar
                    </Link>
                  ) : (
                    <Link href="/account" className="text-sm font-medium text-ink underline underline-offset-2">
                      Get your booking link
                    </Link>
                  )
                }
              />
            )}
          </Section>
        </div>
      )}

      <p className="max-w-2xl text-xs leading-5 text-neutral-500">
        Commission is taken out of the price, never added on top. A gift card counts when it&apos;s sold, not when it&apos;s used. Walk-ins and phone
        bookings count once they&apos;re marked done. LineUp doesn&apos;t add GST, so if you&apos;re registered, your prices include it. This is a record for
        you and your accountant, not tax advice.
      </p>

      {adding ? <EntrySheet key={adding} kind={adding} scope={scope} onClose={() => setAdding(null)} onSaved={() => setTick((n) => n + 1)} /> : null}
      <StatementSheet open={askDetails} onClose={() => setAskDetails(false)} scope={scope} year={Number(from.slice(0, 4))} month={pdfMonth} />
    </div>
  );
}

function OnTheWay({ payouts, scope, onOpenStripe, opening }: { payouts?: Payouts; scope: Scope; onOpenStripe: () => void; opening: boolean }) {
  if (!payouts) return null;
  if (payouts.stripe !== "ready") {
    return (
      <div className={`${panelClass} flex flex-col items-start gap-3 p-5`}>
        <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <Landmark className="h-4 w-4" aria-hidden="true" />
          {payouts.stripe === "none" ? "Set up payouts to get paid" : "Finish setting up payouts"}
        </p>
        <p className="text-sm leading-6 text-neutral-600">
          {payouts.stripe === "none"
            ? "Connect a bank account through Stripe so money from bookings can reach you."
            : "Stripe needs a few more details before it can send money to your bank."}
          {payouts.heldUntilDoneCents ? ` ${money(payouts.heldUntilDoneCents)} is waiting for you.` : ""}
        </p>
        {scope === "me" ? (
          <Link href="/account" className="inline-flex items-center gap-1 text-sm font-medium text-ink underline underline-offset-2">
            {payouts.stripe === "none" ? "Set up payouts" : "Finish setup"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/studio/settings" className="inline-flex items-center gap-1 text-sm font-medium text-ink underline underline-offset-2">
            Open shop settings
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className={`${panelClass} p-5`}>
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        On the way
      </p>
      <dl className="mt-3 divide-y divide-hairline text-sm">
        <div className="flex justify-between gap-4 py-2.5">
          <dt className="text-neutral-600">
            Held until appointments are done
            <span className="block text-xs text-neutral-500">{scope === "shop" ? "The shop's cut" : "The rest after the 20% sent at booking"}</span>
          </dt>
          <dd className="font-medium tabular-nums text-ink">{money(payouts.heldUntilDoneCents)}</dd>
        </div>
        {payouts.heldAfterDoneCents ? (
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-neutral-600">
              Of that, already done but not sent yet
              <span className="block text-xs text-neutral-500">If this stays, contact LineUp support</span>
            </dt>
            <dd className="font-medium tabular-nums text-ink">{money(payouts.heldAfterDoneCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 py-2.5">
          <dt className="text-neutral-600">Next payout to your bank</dt>
          <dd className="text-right font-medium tabular-nums text-ink">
            {payouts.nextPayout ? `${money(payouts.nextPayout.cents)}, ${shortDate(payouts.nextPayout.date)}` : "None scheduled"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-2.5">
          <dt className="text-neutral-600">Last payout</dt>
          <dd className="text-right font-medium tabular-nums text-ink">
            {payouts.lastPayout ? `${money(payouts.lastPayout.cents)}, ${shortDate(payouts.lastPayout.date)}` : "None yet"}
          </dd>
        </div>
      </dl>
      {scope === "me" ? (
        <button type="button" onClick={onOpenStripe} disabled={opening} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ink underline underline-offset-2 disabled:opacity-50">
          {opening ? "Opening Stripe…" : "Bank details and payout history"}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function TransactionRow({ row: r, scope, onRemove, removing }: { row: EarningsRow; scope: Scope; onRemove?: () => void; removing: boolean }) {
  const [open, setOpen] = useState(false);
  const { lines, received } = lineBreakdown(r, scope);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/30"
      >
        <span className="w-12 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(r.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{r.item}</span>
          <span className="block truncate text-xs text-neutral-500">
            {[TYPE_LABEL[r.type], scope === "shop" ? r.proName : null, r.client].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={`shrink-0 text-right text-sm font-medium tabular-nums ${received < 0 ? "text-neutral-500" : "text-ink"}`}>{money(received)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="px-4 pb-4 pl-[4.75rem]">
          <dl className="space-y-1.5 text-sm">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-4">
                <dt className="text-neutral-600">{l.label}</dt>
                <dd className="tabular-nums text-ink">{money(l.cents)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-hairline pt-1.5 font-medium">
              <dt className="text-ink">{scope === "shop" ? "The shop received" : "You received"}</dt>
              <dd className="tabular-nums text-ink">{money(received)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-neutral-500">
            {r.source === "lineup" ? "Paid through LineUp" : `Recorded by hand: ${r.paidVia === "at_shop" ? "paid at the shop" : PAID_LABEL[r.paidVia]}`}
            {r.estimated ? ". The shop's share is worked out from today's rate" : ""}
          </p>
          {onRemove ? (
            <button type="button" onClick={onRemove} disabled={removing} className="mt-2 text-xs text-neutral-500 underline underline-offset-2 hover:text-ink disabled:opacity-50">
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
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

type EntryKind = "sale" | "product" | "expense";
type PaidWith = "cash" | "card" | "etransfer" | "other";

const ENTRY_TITLE: Record<EntryKind, [string, string]> = {
  sale: ["Log a sale", "A client who paid you directly and didn't book on LineUp. Nothing is charged."],
  product: ["Log a product sale", "Something sold over the counter, like pomade or beard oil."],
  expense: ["Add an expense", "A cost of doing business. It comes off your net income on the statement."],
};

function toCents(value: string) {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return value.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// One form for the three things logged by hand.
function EntrySheet({ kind, scope, onClose, onSaved }: { kind: EntryKind; scope: Scope; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [what, setWhat] = useState("");
  const [client, setClient] = useState("");
  const [amount, setAmount] = useState("");
  const [extra, setExtra] = useState(""); // tip (sale) or GST (expense)
  const [paidWith, setPaidWith] = useState<PaidWith>("cash");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  async function save() {
    const amountCents = toCents(amount);
    if (!amountCents) return setError("Enter the amount.");
    const extraCents = extra.trim() ? toCents(extra) : 0;
    if (extraCents === null) return setError(kind === "sale" ? "That tip doesn't look right." : "That GST amount doesn't look right.");
    if (kind !== "expense" && !what.trim()) return setError(kind === "sale" ? "What was the service?" : "What was sold?");
    setBusy(true);
    setError(null);
    const body =
      kind === "sale"
        ? { scope, kind, date, service: what, clientName: client, priceCents: amountCents, tipCents: extraCents, paidWith }
        : kind === "product"
        ? { scope, kind, date, item: what, amountCents, paidWith }
        : { scope, kind, date, category, amountCents, gstCents: extraCents, note: what };
    const res = await studioFetch<{ error?: string }>("/api/earnings/entries", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setError(res.data.error || "Could not save that.");
    onSaved();
    // Stay open for the next one: people log a week's worth at a time.
    setSaved((n) => n + 1);
    setWhat("");
    setClient("");
    setAmount("");
    setExtra("");
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={ENTRY_TITLE[kind][0]}
      description={ENTRY_TITLE[kind][1]}
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {saved ? <p className="rounded-xl bg-ink/[0.04] px-3 py-2 text-[13px] text-neutral-700">Saved {saved}. Add another, or tap Done.</p> : null}
        <Field label="Date" htmlFor="en-date">
          <input id="en-date" type="date" className={fieldClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {kind === "expense" ? (
          <Field label="Category" htmlFor="en-cat">
            <select id="en-cat" className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORIES[c]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={kind === "sale" ? "Service" : kind === "product" ? "Product" : "Note"} htmlFor="en-what" optional={kind === "expense"}>
          <input
            id="en-what"
            className={fieldClass}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={120}
            placeholder={kind === "sale" ? "Haircut" : kind === "product" ? "Pomade" : "Clipper blades from Sally's"}
          />
        </Field>
        {kind === "sale" ? (
          <Field label="Client" htmlFor="en-client" optional hint="A name lets them count as a returning client in Analytics.">
            <input id="en-client" className={fieldClass} value={client} onChange={(e) => setClient(e.target.value)} maxLength={80} />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "expense" ? "Amount, tax included" : kind === "sale" ? "Price" : "Sold for"} htmlFor="en-amount">
            <input id="en-amount" inputMode="decimal" className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          {kind !== "product" ? (
            <Field label={kind === "sale" ? "Tip" : "GST/HST in that"} htmlFor="en-extra" optional>
              <input id="en-extra" inputMode="decimal" className={fieldClass} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.00" />
            </Field>
          ) : null}
        </div>
        {kind !== "expense" ? (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-neutral-800">How did they pay?</p>
            <Segmented
              label="How they paid"
              size="sm"
              value={paidWith}
              onChange={setPaidWith}
              options={[
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card" },
                { value: "etransfer", label: "E-transfer" },
                { value: "other", label: "Other" },
              ]}
            />
          </div>
        ) : null}
        {error ? <p className="text-[13px] text-[#A30D25]">{error}</p> : null}
      </div>
    </Sheet>
  );
}
