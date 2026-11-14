"use client";

// The earnings report, for a pro (their own sales) or a shop (every pro's
// sales through the shop, plus the shop's own income). Pick a year and a
// month, see the totals, the split by pro, every sale, and download a CSV for
// the accountant.

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { peekStudio, studioFetch } from "@/app/studio/studioApi";
import { Button, EmptyState, Section, Tag, fieldClass, panelClass } from "@/app/studio/ui";
import type { EarningsRow, EarningsType, PaidVia } from "@/app/lib/earnings";

type Scope = "me" | "shop";
type Response = { scope: Scope; year: number; name: string | null; rows: EarningsRow[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIRST_YEAR = 2026;

const TYPE_LABEL: Record<EarningsType, string> = {
  online: "Online booking",
  pay_at_shop: "Booked online, paid at shop",
  walk_in: "Walk-in",
  phone: "Phone booking",
  imported: "Imported appointment",
  no_show_fee: "No-show fee",
  gift_card: "Gift card sale",
  membership: "Membership",
  booth_rent: "Booth rent",
};

const PAID_LABEL: Record<PaidVia, string> = {
  lineup: "LineUp",
  cash: "Cash",
  card: "Card at shop",
  etransfer: "E-transfer",
  other: "Other",
  at_shop: "At the shop",
};

// Rows for work done on a client (as opposed to gift cards, memberships, rent).
const SERVICE_TYPES: EarningsType[] = ["online", "pay_at_shop", "walk_in", "phone", "imported"];

function money(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

type Totals = {
  count: number;
  services: number;
  tips: number;
  gift: number;
  fees: number;
  toShop: number;
  toPro: number;
  outside: number;
  noShow: number;
  giftSales: number;
  memberships: number;
  rent: number;
};

function totalsOf(rows: EarningsRow[]): Totals {
  const t: Totals = { count: 0, services: 0, tips: 0, gift: 0, fees: 0, toShop: 0, toPro: 0, outside: 0, noShow: 0, giftSales: 0, memberships: 0, rent: 0 };
  for (const r of rows) {
    t.fees += r.lineupFeeCents;
    t.toShop += r.toShopCents;
    t.toPro += r.toProCents;
    if (SERVICE_TYPES.includes(r.type)) {
      t.count += 1;
      t.services += r.priceCents;
      t.tips += r.tipCents;
      t.gift += r.giftCents;
      if (r.paidVia !== "lineup") t.outside += r.priceCents + r.tipCents;
    } else if (r.type === "no_show_fee") t.noShow += r.priceCents;
    else if (r.type === "gift_card") t.giftSales += r.priceCents;
    else if (r.type === "membership") t.memberships += r.priceCents;
    else if (r.type === "booth_rent") t.rent += r.priceCents;
  }
  return t;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: EarningsRow[], scope: Scope) {
  const head = [
    "Date",
    "Type",
    ...(scope === "shop" ? ["Pro"] : []),
    "Client",
    "Item",
    "Paid through",
    "Price",
    "Tip",
    "Covered by gift card",
    "LineUp fee",
    "To shop",
    scope === "shop" ? "To pro" : "To you",
    "Note",
  ];
  const d = (c: number) => (c / 100).toFixed(2);
  const lines = rows.map((r) =>
    [
      r.date,
      TYPE_LABEL[r.type],
      ...(scope === "shop" ? [r.proName || ""] : []),
      r.client || "",
      r.item,
      PAID_LABEL[r.paidVia],
      d(r.priceCents),
      d(r.tipCents),
      d(r.giftCents),
      d(r.lineupFeeCents),
      d(r.toShopCents),
      d(r.toProCents),
      [
        r.estimated ? "Shop share estimated from current rate" : "",
        r.type === "booth_rent" && scope === "me" ? "Rent you paid (a business expense)" : "",
        r.giftCents ? "Gift card part counted when the card was sold" : "",
      ]
        .filter(Boolean)
        .join("; "),
    ]
      .map(csvCell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\n");
}

function download(filename: string, text: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export default function EarningsReport({ scope }: { scope: Scope }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | "all">(new Date().getMonth());
  const path = `/api/earnings?scope=${scope}&year=${year}`;
  // Answers by year; a year not loaded yet shows this device's last copy.
  const [loaded, setLoaded] = useState<Record<string, Response>>({});
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(50);
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

  const rows = useMemo(() => {
    const all = data?.year === year ? data.rows : [];
    if (month === "all") return all;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return all.filter((r) => r.date.startsWith(key));
  }, [data, year, month]);

  const totals = useMemo(() => totalsOf(rows), [rows]);

  const byMonth = useMemo(() => {
    if (month !== "all" || !data) return [];
    return MONTHS.map((label, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      return { label, totals: totalsOf(data.rows.filter((r) => r.date.startsWith(key))) };
    }).filter((m) => m.totals.count || m.totals.toShop || m.totals.toPro);
  }, [data, month, year]);

  const byPro = useMemo(() => {
    if (scope !== "shop") return [];
    const map = new Map<string, { name: string; rows: EarningsRow[] }>();
    for (const r of rows) {
      if (!r.proId) continue;
      const entry = map.get(r.proId) || { name: r.proName || "Team member", rows: [] };
      entry.rows.push(r);
      map.set(r.proId, entry);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, name: v.name, totals: totalsOf(v.rows) }))
      .sort((a, b) => b.totals.services + b.totals.tips - (a.totals.services + a.totals.tips));
  }, [rows, scope]);

  const period = month === "all" ? String(year) : `${MONTHS[month]} ${year}`;
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);

  function exportCsv() {
    const slug = (data?.name || (scope === "shop" ? "shop" : "earnings")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const when = month === "all" ? String(year) : `${year}-${String(month + 1).padStart(2, "0")}`;
    download(`lineup-earnings-${slug}-${when}.csv`, toCsv(rows, scope));
  }

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
          <Button onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download CSV
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-[#A30D25]">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : !rows.length ? (
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
          {scope === "shop" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat strong label="Shop earned" value={money(totals.toShop)} sub={period} />
              <Stat label="Through the shop" value={money(totals.services + totals.tips)} sub={`${totals.count} appointment${totals.count === 1 ? "" : "s"}, tips included`} />
              <Stat label="To the team" value={money(totals.toPro)} sub={`Tips ${money(totals.tips)}`} />
              <Stat label="LineUp fees" value={money(totals.fees)} sub="Card processing and fees" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat strong label="Your take" value={money(totals.toPro)} sub={totals.rent ? `After ${money(totals.rent)} booth rent` : period} />
              <Stat label="Services" value={money(totals.services)} sub={`${totals.count} appointment${totals.count === 1 ? "" : "s"}`} />
              <Stat label="Tips" value={money(totals.tips)} />
              <Stat label="LineUp fees" value={money(totals.fees)} sub={totals.toShop ? `Shop's share ${money(totals.toShop)}` : undefined} />
            </div>
          )}

          <Breakdown scope={scope} totals={totals} rows={rows} />

          {byPro.length ? (
            <Section title="By pro" description="Each pro's sales through the shop. Booth renters keep their sales; the shop gets their rent.">
              <div className={`${panelClass} overflow-x-auto`}>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-neutral-500">
                      <th className="px-4 py-3 font-medium">Pro</th>
                      <th className="px-3 py-3 text-right font-medium">Appts</th>
                      <th className="px-3 py-3 text-right font-medium">Services</th>
                      <th className="px-3 py-3 text-right font-medium">Tips</th>
                      <th className="px-3 py-3 text-right font-medium">Paid at shop</th>
                      <th className="px-3 py-3 text-right font-medium">To shop</th>
                      <th className="px-4 py-3 text-right font-medium">To pro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPro.map((p) => (
                      <tr key={p.id} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{p.totals.count}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.totals.services)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.totals.tips)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-500">{money(p.totals.outside)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.totals.toShop)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.totals.toPro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {byMonth.length > 1 ? (
            <Section title="By month">
              <div className={`${panelClass} overflow-x-auto`}>
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs text-neutral-500">
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-3 py-3 text-right font-medium">Services</th>
                      <th className="px-3 py-3 text-right font-medium">Tips</th>
                      <th className="px-3 py-3 text-right font-medium">LineUp fees</th>
                      <th className="px-4 py-3 text-right font-medium">{scope === "shop" ? "Shop earned" : "Your take"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map((m) => (
                      <tr key={m.label} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-3 font-medium text-ink">{m.label}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(m.totals.services)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(m.totals.tips)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(m.totals.fees)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {money(scope === "shop" ? m.totals.toShop : m.totals.toPro)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          <Section title="Every sale" description={`${rows.length} line${rows.length === 1 ? "" : "s"} for ${period}. The CSV has every column.`}>
            <ul className={`${panelClass} divide-y divide-hairline`}>
              {rows
                .slice()
                .reverse()
                .slice(0, shown)
                .map((r) => {
                  const amount = scope === "shop" ? r.toShopCents + r.toProCents : r.toProCents;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-14 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(r.date)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{r.item}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {[TYPE_LABEL[r.type], scope === "shop" ? r.proName : null, r.client].filter(Boolean).join(" · ")}
                          {r.tipCents ? ` · tip ${money(r.tipCents)}` : ""}
                          {r.giftCents ? ` · ${money(r.giftCents)} gift card` : ""}
                        </p>
                      </div>
                      <Tag tone={r.paidVia === "lineup" ? "muted" : "outline"}>{PAID_LABEL[r.paidVia]}</Tag>
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
        </>
      )}

      <p className="max-w-2xl text-xs leading-5 text-neutral-500">
        Amounts are as charged. LineUp doesn&apos;t add GST, so if you&apos;re registered, your prices include it. Money paid at the shop
        (walk-ins, phone bookings, pay at the shop) is what was recorded when the appointment was marked done; cash you took that
        isn&apos;t in LineUp still needs to go in your books. A gift card counts when it&apos;s sold, not when it&apos;s used. This is a
        record to give your accountant, not tax advice.
      </p>
    </div>
  );
}

function Breakdown({ scope, totals, rows }: { scope: Scope; totals: Totals; rows: EarningsRow[] }) {
  const lines =
    scope === "shop"
      ? [
          { label: "Commission from the team", value: rows.filter((r) => SERVICE_TYPES.includes(r.type)).reduce((s, r) => s + r.toShopCents, 0) },
          { label: "Booth rent", value: rows.filter((r) => r.type === "booth_rent").reduce((s, r) => s + r.toShopCents, 0) },
          { label: "Memberships", value: rows.filter((r) => r.type === "membership").reduce((s, r) => s + r.toShopCents, 0) },
          { label: "Gift card sales", value: rows.filter((r) => r.type === "gift_card").reduce((s, r) => s + r.toShopCents, 0) },
        ]
      : [
          { label: "Online bookings", value: rows.filter((r) => r.type === "online").reduce((s, r) => s + r.toProCents, 0) },
          { label: "Paid at the shop", value: rows.filter((r) => r.paidVia !== "lineup").reduce((s, r) => s + r.toProCents, 0) },
          { label: "No-show fees", value: rows.filter((r) => r.type === "no_show_fee").reduce((s, r) => s + r.toProCents, 0) },
          { label: "Gift card sales", value: rows.filter((r) => r.type === "gift_card").reduce((s, r) => s + r.toProCents, 0) },
          { label: "Booth rent paid", value: -totals.rent },
        ];
  const shown = lines.filter((l) => l.value !== 0);
  if (shown.length < 2) return null;
  return (
    <Section title={scope === "shop" ? "Where the shop's money came from" : "Where your money came from"}>
      <dl className={`${panelClass} divide-y divide-hairline`}>
        {shown.map((l) => (
          <div key={l.label} className="flex items-center justify-between px-4 py-3 text-sm">
            <dt className="text-neutral-600">{l.label}</dt>
            <dd className="font-medium tabular-nums text-ink">{money(l.value)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
