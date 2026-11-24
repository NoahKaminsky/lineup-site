"use client";

// Tax year: the calendar year laid out like a T2125 (or a neutral summary
// for corporations), the expense log with receipt photos, the GST/HST
// tracker, and the year-end PDF and CSV. Every number comes from
// app/lib/taxYear (via /api/earnings/tax); this file only lays them out.

import { useEffect, useRef, useState } from "react";
import { Camera, Download, FileText, Paperclip, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { studioFetch } from "@/app/studio/studioApi";
import { Button, Field, Section, Sheet, Tag, fieldClass, panelClass } from "@/app/studio/ui";
import { money } from "@/app/lib/earningsStatement";
import type { EarningsRow } from "@/app/lib/earningsCore";
import { BUSINESS_TYPES, CRA_GST_URL, DISCLAIMER, EXPENSE_CATEGORIES, type BusinessType, type ExpenseCategory } from "@/app/lib/taxCategories";
import type { TaxLine, TaxYear as TaxYearData } from "@/app/lib/taxYear";

type Scope = "me" | "shop";
type GST = {
  quarters: { label: string; cents: number }[];
  totalCents: number;
  limitCents: number;
  over: boolean;
  overInOneQuarter: boolean;
  leftCents: number;
  from: string;
  to: string;
};
type TaxResponse = {
  year: number;
  today: string;
  name: string;
  settings: { legalName: string | null; gstNumber: string | null; businessType: BusinessType };
  tax: TaxYearData;
  gst: GST;
};

const FIRST_YEAR = 2025;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function shortDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Lines({ lines, showLine }: { lines: TaxLine[]; showLine: boolean }) {
  return (
    <>
      {lines.map((l) => (
        <div key={l.key} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-neutral-700">
            {l.label}
            <span className="block text-xs text-neutral-500">
              {[showLine && l.line ? `T2125 line ${l.line}` : null, l.auto ? "Added by LineUp" : null].filter(Boolean).join(" · ")}
            </span>
          </dt>
          <dd className="font-medium tabular-nums text-ink">{money(l.cents)}</dd>
        </div>
      ))}
    </>
  );
}

export default function TaxYear({ scope }: { scope: Scope }) {
  const thisYear = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Etc/GMT+5" }).slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<TaxResponse | null>(null);
  const [expenses, setExpenses] = useState<EarningsRow[] | null>(null);
  const [expensesYear, setExpensesYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<EarningsRow | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      studioFetch<TaxResponse>(`/api/earnings/tax?scope=${scope}&year=${year}`),
      studioFetch<{ rows: EarningsRow[] }>(`/api/earnings?scope=${scope}&from=${year}-01-01&to=${year}-12-31`),
    ]).then(([tax, earnings]) => {
      if (cancelled) return;
      if (!tax.ok) return setError(tax.data.error || "We couldn't load your tax year.");
      setError(null);
      setData(tax.data);
      setExpenses(earnings.ok ? earnings.data.rows.filter((r) => r.type === "expense").reverse() : []);
      setExpensesYear(year);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, year, tick]);

  async function download(format: "pdf" | "csv") {
    setDownloading(format);
    try {
      const res = await fetch(`/api/earnings/tax?scope=${scope}&year=${year}&format=${format}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Could not make the file.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `lineup-${year}-${format === "pdf" ? "tax-year.pdf" : "transactions.csv"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the file.");
    } finally {
      setDownloading(null);
    }
  }

  async function openReceipt(r: EarningsRow) {
    const res = await studioFetch<{ url?: string }>(`/api/earnings/entries?scope=${scope}&receipt=${r.id}`);
    if (res.ok && res.data.url) window.open(res.data.url, "_blank", "noopener");
    else setError(res.data.error || "Could not open that receipt.");
  }

  async function remove(r: EarningsRow) {
    if (!window.confirm(`Delete this ${money(r.priceCents)} expense${r.hasReceipt ? " and its receipt" : ""}?`)) return;
    const res = await studioFetch<{ error?: string }>(`/api/earnings/entries?scope=${scope}&kind=expense&id=${r.id}`, { method: "DELETE" });
    if (!res.ok) return setError(res.data.error || "Could not delete that.");
    setTick((n) => n + 1);
  }

  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  // Never show one year's figures under another year's heading while loading.
  const current = data && data.year === year ? data : null;
  const tax = current?.tax;
  const t2125 = tax?.layout === "t2125";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tax year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${fieldClass} h-10 w-auto pr-8`}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y} tax year
            </option>
          ))}
        </select>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add an expense
        </Button>
        <Button onClick={() => void download("pdf")} loading={downloading === "pdf"} disabled={!data}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Year-end PDF
        </Button>
        <Button variant="ghost" onClick={() => void download("csv")} loading={downloading === "csv"} disabled={!data}>
          <Download className="h-4 w-4" aria-hidden="true" />
          CSV for your accountant
        </Button>
      </div>

      {error && !data ? (
        <div className={`${panelClass} flex flex-col items-start gap-3 p-5`} role="alert">
          <p className="text-sm font-medium text-ink">{error}</p>
          <Button onClick={() => setTick((n) => n + 1)}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : !current || !tax ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2" aria-busy="true" aria-label="Loading tax year">
          <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2 lg:items-start">
          <div className="space-y-8">
            <div className={`${panelClass} p-5 sm:p-6`}>
              <p className="text-sm text-neutral-500">Net income, January 1 to December 31, {year}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-[-0.03em] text-ink">{money(tax.net)}</p>
              <p className="mt-3 text-[15px] leading-7 text-neutral-700">
                {money(tax.grossIncome)} came in and {money(tax.totalExpenses)} went to business costs
                {tax.autoExpenses.length ? ", including the fees LineUp already knows about" : ""}.
              </p>
              <p className="mt-3 text-xs leading-5 text-neutral-500">{DISCLAIMER}</p>
            </div>

            <Section
              title={t2125 ? "Laid out like the T2125" : "Income and expense summary"}
              description={
                t2125
                  ? "The CRA's Statement of Business or Professional Activities. Line numbers are a guide; have your accountant confirm them."
                  : "A plain summary for a corporation. Your accountant will move these onto the corporate return."
              }
            >
              <dl className={`${panelClass} divide-y divide-hairline`}>
                <p className="px-4 pt-3 text-xs font-medium text-neutral-500">{t2125 ? "Gross income" : "Revenue"}</p>
                <Lines lines={tax.income} showLine={t2125} />
                <div className="flex justify-between px-4 py-3 text-sm font-semibold text-ink">
                  <dt>{t2125 ? "Gross income" : "Total revenue"}</dt>
                  <dd className="tabular-nums">{money(tax.grossIncome)}</dd>
                </div>
                <p className="px-4 pt-3 text-xs font-medium text-neutral-500">Expenses</p>
                <Lines lines={[...tax.autoExpenses, ...tax.ownExpenses]} showLine={t2125} />
                <div className="flex justify-between px-4 py-3 text-sm font-semibold text-ink">
                  <dt>Total expenses</dt>
                  <dd className="tabular-nums">{money(tax.totalExpenses)}</dd>
                </div>
                <div className="flex justify-between px-4 py-3 text-sm font-semibold text-ink">
                  <dt>Net income</dt>
                  <dd className="tabular-nums">{money(tax.net)}</dd>
                </div>
              </dl>
            </Section>

            <GstCard gst={current.gst} gstNumber={current.settings.gstNumber} />

            <Section title="Your business details" description="Shown on your statements. Nothing here changes what clients pay.">
              <div className={`${panelClass} flex flex-col gap-1 p-4 text-sm`}>
                <p className="text-ink">{current.settings.legalName || current.name}</p>
                <p className="text-neutral-500">
                  {current.settings.gstNumber ? `GST/HST ${current.settings.gstNumber}` : "No GST/HST number saved"}
                  {scope === "shop" ? ` · ${BUSINESS_TYPES[current.settings.businessType]}` : " · Sole proprietor"}
                </p>
                <button type="button" onClick={() => setSettingsOpen(true)} className="mt-1 self-start text-sm font-medium text-ink underline underline-offset-2">
                  Edit details
                </button>
              </div>
            </Section>
          </div>

          <Section title="Expenses" description={`What you've added for ${year}. Fees LineUp takes are added for you, so don't add those here.`}>
            {expenses && expensesYear === year && expenses.length ? (
              <ul className={`${panelClass} divide-y divide-hairline`}>
                {expenses.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 text-xs tabular-nums text-neutral-500">{shortDate(r.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{EXPENSE_CATEGORIES[(r.category || "other") as ExpenseCategory]}</span>
                      <span className="block truncate text-xs text-neutral-500">{r.note || "No note"}</span>
                    </span>
                    {r.hasReceipt ? (
                      <button type="button" onClick={() => void openReceipt(r)} aria-label="Open receipt" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-ink">
                        <Paperclip className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-ink">{money(r.priceCents)}</span>
                    <button type="button" onClick={() => setEditing(r)} aria-label="Edit expense" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-ink">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => void remove(r)} aria-label="Delete expense" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-ink">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={`${panelClass} flex flex-col items-start gap-3 p-5`}>
                <p className="text-sm leading-6 text-neutral-600">
                  No expenses yet for {year}. Add supplies, rent, your phone bill and anything else you pay to run your business. A receipt photo is optional.
                </p>
                <Button onClick={() => setEditing("new")}>
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Add your first expense
                </Button>
              </div>
            )}
          </Section>
        </div>
      )}

      {editing ? (
        <ExpenseSheet
          key={editing === "new" ? "new" : editing.id}
          scope={scope}
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setTick((n) => n + 1);
          }}
        />
      ) : null}
      {settingsOpen && data ? (
        <SettingsSheet scope={scope} settings={data.settings} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); setTick((n) => n + 1); }} />
      ) : null}
    </div>
  );
}

function GstCard({ gst, gstNumber }: { gst: GST; gstNumber: string | null }) {
  const pct = Math.min(Math.round((gst.totalCents / gst.limitCents) * 100), 100);
  return (
    <Section title="GST/HST" description={`Taxable sales over your last four calendar quarters (${gst.quarters[0].label} to ${gst.quarters[3].label}), against the $30,000 small supplier limit.`}>
      <div className={`${panelClass} p-5`}>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-2xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{money(gst.totalCents)}</p>
          <p className="text-sm text-neutral-500">of $30,000</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the $30,000 limit">
          <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-4 grid grid-cols-4 gap-2 text-center text-xs text-neutral-500">
          {gst.quarters.map((q) => (
            <li key={q.label}>
              <span className="block">{q.label}</span>
              <span className="block font-medium tabular-nums text-ink">{money(q.cents)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6 text-neutral-700">
          {gstNumber
            ? "You're registered, so you collect GST/HST on your services and file returns. Your number shows on your statements."
            : gst.over
            ? "You're over $30,000, so you're no longer a small supplier. You need to register for GST/HST and start charging it. Talk to your accountant soon."
            : `You're a small supplier while your taxable sales stay under $30,000 in four quarters in a row. ${money(gst.leftCents)} to go. Once you pass it, you have to register and start charging GST/HST.`}{" "}
          <a href={CRA_GST_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">
            Read the CRA&apos;s rules
          </a>
        </p>
        <p className="mt-2 text-xs leading-5 text-neutral-500">Taxable sales here are services, no-show fees and products, less refunds. Tips and gift card sales aren&apos;t counted.</p>
      </div>
    </Section>
  );
}

function ExpenseSheet({ scope, expense, onClose, onSaved }: { scope: Scope; expense: EarningsRow | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Etc/GMT+5" });
  const [amount, setAmount] = useState(expense ? (expense.priceCents / 100).toFixed(2) : "");
  const [category, setCategory] = useState<ExpenseCategory>(((expense?.category as ExpenseCategory) || "supplies") as ExpenseCategory);
  const [date, setDate] = useState(expense?.date || today);
  const [note, setNote] = useState(expense?.note || "");
  const [gst, setGst] = useState(expense?.gstCents ? (expense.gstCents / 100).toFixed(2) : "");
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toCents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let receiptPath: string | null | undefined = removeReceipt ? null : undefined;
      if (file) {
        const up = await studioFetch<{ path: string; token: string }>("/api/earnings/entries", { method: "POST", body: { scope, action: "receipt-upload", fileType: file.type || "image/jpeg" } });
        if (!up.ok) throw new Error(up.data.error || "Could not add the receipt.");
        const { error: upErr } = await supabase.storage.from("expense-receipts").uploadToSignedUrl(up.data.path, up.data.token, file, { contentType: file.type || "image/jpeg" });
        if (upErr) throw new Error("The receipt didn't upload. Try again, or save without it.");
        receiptPath = up.data.path;
      }
      const body = {
        scope,
        kind: "expense",
        date,
        category,
        amountCents: toCents(amount),
        gstCents: gst ? toCents(gst) : 0,
        note,
        ...(receiptPath !== undefined ? { receiptPath } : {}),
        ...(expense ? { id: expense.id } : {}),
      };
      const res = await studioFetch<{ error?: string }>("/api/earnings/entries", { method: expense ? "PATCH" : "POST", body });
      if (!res.ok) throw new Error(res.data.error || "Could not save that.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={expense ? "Edit expense" : "Add an expense"}
      description="The amount and a category are all you need. Add a photo of the receipt if you have one."
      footer={
        <Button variant="primary" loading={busy} disabled={!toCents(amount)} onClick={() => void save()}>
          Save expense
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Amount" htmlFor="ex-amount">
          <input id="ex-amount" inputMode="decimal" autoFocus placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldClass} text-lg`} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-neutral-800">Category</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={`h-11 rounded-full px-3.5 text-sm font-medium transition-colors ${category === c ? "bg-ink text-white" : "bg-ink/[0.05] text-neutral-700 hover:text-ink"}`}
              >
                {EXPENSE_CATEGORIES[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="ex-date">
            <input id="ex-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="GST/HST paid" htmlFor="ex-gst" optional>
            <input id="ex-gst" inputMode="decimal" placeholder="0.00" value={gst} onChange={(e) => setGst(e.target.value)} className={fieldClass} />
          </Field>
        </div>
        <Field label="Note" htmlFor="ex-note" optional>
          <input id="ex-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Clippers oil, phone bill…" className={fieldClass} />
        </Field>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setRemoveReceipt(false);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              {file ? "Change photo" : expense?.hasReceipt && !removeReceipt ? "Replace receipt" : "Add a receipt photo"}
            </Button>
            {file ? <Tag>{file.name.slice(0, 28)}</Tag> : null}
            {expense?.hasReceipt && !file && !removeReceipt ? (
              <button type="button" onClick={() => setRemoveReceipt(true)} className="text-sm text-neutral-500 underline underline-offset-2">
                Remove receipt
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">Only you can see your receipts.</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[#A30D25]">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function SettingsSheet({
  scope,
  settings,
  onClose,
  onSaved,
}: {
  scope: Scope;
  settings: TaxResponse["settings"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [legalName, setLegalName] = useState(settings.legalName || "");
  const [gstNumber, setGstNumber] = useState(settings.gstNumber || "");
  const [businessType, setBusinessType] = useState<BusinessType>(settings.businessType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await studioFetch<{ error?: string }>("/api/earnings/tax", { method: "PUT", body: { scope, legalName, gstNumber, businessType } });
    setBusy(false);
    if (!res.ok) return setError(res.data.error || "Could not save that.");
    onSaved();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Your business details"
      description="For your statements only. LineUp never adds GST/HST to bookings, and we don't ask for your SIN."
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Legal or business name" htmlFor="tx-name" optional>
          <input id="tx-name" value={legalName} maxLength={120} onChange={(e) => setLegalName(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="GST/HST number" htmlFor="tx-gst" optional hint="If you're registered: 9 digits, often followed by RT0001.">
          <input id="tx-gst" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="123456789 RT0001" className={fieldClass} />
        </Field>
        {scope === "shop" ? (
          <Field label="Business type" htmlFor="tx-type" hint="A corporation gets a plain income and expense summary instead of the T2125 layout. Team members are always independent.">
            <select id="tx-type" value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)} className={fieldClass}>
              {(Object.keys(BUSINESS_TYPES) as BusinessType[]).map((t) => (
                <option key={t} value={t}>
                  {BUSINESS_TYPES[t]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[#A30D25]">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
