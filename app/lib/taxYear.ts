// The tax year (Jan 1 to Dec 31) laid out like a T2125, or as a neutral
// summary for corporations, plus the GST/HST small-supplier tracker.
// Pure functions on earnings rows (app/lib/earningsCore), so the Tax year
// tab, the PDF and the CSV all show the same numbers. Line numbers come
// from ./taxCategories (accountant to confirm).

import { summarize, type EarningsRow, type Scope } from "./earningsCore";
import { TYPE_LABEL } from "./earningsStatement";
import {
  AUTO_EXPENSES,
  EXPENSE_CATEGORIES,
  INCOME_LINES,
  SMALL_SUPPLIER_LIMIT_CENTS,
  T2125_LINE,
  type AutoExpense,
  type BusinessType,
  type ExpenseCategory,
  type IncomeLine,
} from "./taxCategories";

export type TaxLine = { key: string; label: string; line: string | null; cents: number; auto?: boolean };
export type BoostCharge = { date: string; cents: number };

export type TaxYear = {
  layout: "t2125" | "summary";
  income: TaxLine[];
  grossIncome: number;
  autoExpenses: TaxLine[];
  ownExpenses: TaxLine[];
  totalExpenses: number;
  net: number;
  months: { month: number; income: number; expenses: number; net: number }[];
};

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);

function lines(rows: EarningsRow[], boosts: BoostCharge[], scope: Scope) {
  const s = summarize(rows, scope);
  const income: Record<IncomeLine, number> & { refunds: number } =
    scope === "me"
      ? {
          services: s.grossServiceSales,
          tips: s.tips,
          gift_cards: s.giftCardSales,
          memberships: 0,
          booth_rent_received: 0,
          products: s.productSales,
          no_show_fees: s.noShowFees,
          refunds: s.refunds,
        }
      : {
          // The shop's own income: its cut of the team's work is its sales.
          services: s.shopCommission,
          tips: 0,
          gift_cards: s.giftCardSales,
          memberships: s.memberships,
          booth_rent_received: s.boothRent,
          products: s.productSales,
          no_show_fees: 0,
          refunds: 0,
        };
  const auto: Record<AutoExpense, number> = {
    lineup_commission: s.lineupCommission,
    card_fees: s.cardFees,
    lineup_plan: s.lineupPlan,
    boosts: sum(boosts, (b) => b.cents),
    booth_rent_paid: scope === "me" ? s.boothRent : 0,
    shop_commission: scope === "me" ? s.shopCommission : 0,
  };
  const own = new Map<ExpenseCategory, number>();
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const c = (r.category && r.category in EXPENSE_CATEGORIES ? r.category : "other") as ExpenseCategory;
    own.set(c, (own.get(c) || 0) + r.priceCents);
  }
  return { s, income, auto, own };
}

export function taxYear(rows: EarningsRow[], boosts: BoostCharge[], scope: Scope, businessType: BusinessType = "sole_proprietor"): TaxYear {
  const layout = businessType === "corporation" ? "summary" : "t2125";
  const lineOf = (k: keyof typeof T2125_LINE) => (layout === "t2125" ? T2125_LINE[k] : null);
  const { income, auto, own } = lines(rows, boosts, scope);

  const incomeLines: TaxLine[] = (Object.keys(INCOME_LINES) as IncomeLine[])
    .map((k) => ({ key: k, label: layout === "summary" && k === "services" && scope === "shop" ? "Commission from the team" : INCOME_LINES[k], line: lineOf(k), cents: income[k] }))
    .filter((l) => l.cents);
  if (income.refunds) incomeLines.push({ key: "refunds", label: "Less refunds to clients", line: lineOf("services"), cents: -income.refunds });

  const autoLines: TaxLine[] = (Object.keys(AUTO_EXPENSES) as AutoExpense[])
    .map((k) => ({ key: k, label: AUTO_EXPENSES[k], line: lineOf(k), cents: auto[k], auto: true }))
    .filter((l) => l.cents);
  const ownLines: TaxLine[] = (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[])
    .map((k) => ({ key: k, label: EXPENSE_CATEGORIES[k], line: lineOf(k), cents: own.get(k) || 0 }))
    .filter((l) => l.cents);

  const grossIncome = sum(incomeLines, (l) => l.cents);
  const totalExpenses = sum(autoLines, (l) => l.cents) + sum(ownLines, (l) => l.cents);

  const months = Array.from({ length: 12 }, (_, i) => {
    const key = String(i + 1).padStart(2, "0");
    const m = lines(
      rows.filter((r) => r.date.slice(5, 7) === key),
      boosts.filter((b) => b.date.slice(5, 7) === key),
      scope
    );
    const inc = sum(Object.values(m.income).slice(0, 7), (c) => c) - m.income.refunds;
    const exp = sum(Object.values(m.auto), (c) => c) + sum([...m.own.values()], (c) => c);
    return { month: i, income: inc, expenses: exp, net: inc - exp };
  });

  return { layout, income: incomeLines, grossIncome, autoExpenses: autoLines, ownExpenses: ownLines, totalExpenses, net: grossIncome - totalExpenses, months };
}

// ── GST/HST small supplier tracker ──────────────────────────────────────
// Taxable sales: what clients paid for services (gift-card-paid visits
// included, since GST applies when a gift card is used), no-show fees and
// products, less refunds. Tips and gift card sales aren't taxable sales.
// For a shop: its commission, booth rent, memberships and products.

export function quarterOf(date: string) {
  const y = Number(date.slice(0, 4));
  const q = Math.ceil(Number(date.slice(5, 7)) / 3);
  return { year: y, q };
}

// The four calendar quarters ending with the one `today` is in.
export function lastFourQuarters(today: string) {
  let { year, q } = quarterOf(today);
  const out: { label: string; from: string; to: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const last = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    out.unshift({
      label: `Q${q} ${year}`,
      from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      to: `${year}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    });
    q -= 1;
    if (q === 0) {
      q = 4;
      year -= 1;
    }
  }
  return out;
}

export function taxableSales(rows: EarningsRow[], scope: Scope) {
  if (scope === "shop") {
    const s = summarize(rows, "shop");
    return s.shopCommission + s.boothRent + s.memberships + s.productSales;
  }
  return sum(
    rows.filter((r) => ["online", "pay_at_shop", "walk_in", "phone", "no_show_fee", "product"].includes(r.type)),
    (r) => r.priceCents - r.refundCents + (r.refundCents ? r.tipCents : 0)
  );
}

export function gstTracker(rows: EarningsRow[], today: string, scope: Scope) {
  const quarters = lastFourQuarters(today).map((q) => ({
    ...q,
    cents: taxableSales(rows.filter((r) => r.date >= q.from && r.date <= q.to), scope),
  }));
  const total = sum(quarters, (q) => q.cents);
  return {
    quarters,
    totalCents: total,
    limitCents: SMALL_SUPPLIER_LIMIT_CENTS,
    over: total > SMALL_SUPPLIER_LIMIT_CENTS,
    // Over $30,000 in a single quarter means registering right away.
    overInOneQuarter: quarters.some((q) => q.cents > SMALL_SUPPLIER_LIMIT_CENTS),
    leftCents: Math.max(SMALL_SUPPLIER_LIMIT_CENTS - total, 0),
    from: quarters[0].from,
    to: quarters[3].to,
  };
}

// ── Every transaction, the same for the CSV and the PDF ─────────────────


export type TaxTransaction = {
  date: string;
  kind: string;
  item: string;
  who: string;
  source: "Through LineUp" | "Recorded by hand";
  priceCents: number;
  tipCents: number;
  feesCents: number; // LineUp commission and card fees
  shopCents: number; // shop commission (pro) or the shop's share (shop)
  refundCents: number;
  amountCents: number; // what this owner received (negative for costs)
};

export function taxTransactions(rows: EarningsRow[], boosts: BoostCharge[], scope: Scope): TaxTransaction[] {
  const list: TaxTransaction[] = rows
    .filter((r) => !r.chargebackCents || r.priceCents)
    .map((r) => ({
      date: r.date,
      kind: r.type === "expense" ? `Expense: ${EXPENSE_CATEGORIES[(r.category || "other") as ExpenseCategory] || "Other"}` : TYPE_LABEL[r.type],
      item: r.type === "expense" ? r.note || r.item : r.item,
      who: [scope === "shop" ? r.proName : null, r.client].filter(Boolean).join(", "),
      source: r.source === "lineup" ? "Through LineUp" : "Recorded by hand",
      priceCents: r.priceCents,
      tipCents: r.tipCents,
      feesCents: r.lineupFeeCents,
      shopCents: r.toShopCents,
      refundCents: r.refundCents,
      amountCents: scope === "shop" ? r.toShopCents : r.toProCents,
    }));
  for (const b of boosts) {
    list.push({ date: b.date, kind: "Boost", item: "Boost on LineUp", who: "", source: "Through LineUp", priceCents: b.cents, tipCents: 0, feesCents: 0, shopCents: 0, refundCents: 0, amountCents: -b.cents });
  }
  return list.sort((a, b) => (a.date === b.date ? a.item.localeCompare(b.item) : a.date < b.date ? -1 : 1));
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollarsPlain = (c: number) => (c / 100).toFixed(2);

export function transactionsCsv(list: TaxTransaction[], header: { name: string; year: number; disclaimer: string }) {
  const lines = [
    csvCell(header.disclaimer),
    csvCell(`${header.name}, January 1 to December 31, ${header.year}. Amounts in Canadian dollars.`),
    "",
    ["Date", "Type", "Item", "Pro or client", "How it was paid", "Price", "Tip", "LineUp fees", "Shop", "Refund", "Amount received"].join(","),
    ...list.map((t) =>
      [t.date, t.kind, t.item, t.who, t.source, dollarsPlain(t.priceCents), dollarsPlain(t.tipCents), dollarsPlain(t.feesCents), dollarsPlain(t.shopCents), dollarsPlain(t.refundCents), dollarsPlain(t.amountCents)]
        .map(csvCell)
        .join(",")
    ),
  ];
  return lines.join("\n") + "\n";
}
