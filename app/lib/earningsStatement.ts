// Turns earnings lines into an income statement, laid out the way a
// self-employed person reports to the CRA: gross income, then the costs
// LineUp knows about, then net. Shared by the earnings page and the PDF.
//
// Gross income counts each dollar once:
//   - a booking paid online counts what the client paid for the service,
//     minus any part covered by a gift card (that counted when the card sold)
//   - tips are income, listed on their own
//   - LineUp's fees, the shop's commission, booth rent and the LineUp plan
//     are costs, not taken off the top
// So net income = what actually ended up with the pro (or shop).

import type { EarningsRow, EarningsType } from "./earnings";
import { summarize, type Summary } from "./earningsCore";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expenseCategories";

export type Scope = "me" | "shop";

// Imported appointments never become earnings rows (see earningsCore).
export const SERVICE_TYPES: EarningsType[] = ["online", "pay_at_shop", "walk_in", "phone"];
const AT_SHOP_TYPES: EarningsType[] = ["pay_at_shop", "walk_in", "phone"];

export const TYPE_LABEL: Record<EarningsType, string> = {
  online: "Online booking",
  pay_at_shop: "Booked online, paid at shop",
  walk_in: "Walk-in",
  phone: "Phone booking",
  imported: "Imported appointment",
  no_show_fee: "No-show fee",
  gift_card: "Gift card sale",
  membership: "Membership payment",
  membership_visit: "Membership visit",
  booth_rent: "Booth rent",
  lineup_plan: "LineUp plan",
  product: "Product sale",
  expense: "Expense",
};

// Where each kind of expense generally goes on the T2125.
const EXPENSE_LINE: Record<ExpenseCategory, string> = {
  supplies: "line 8811",
  rent: "line 8910",
  tools: "capital cost allowance, or line 8811 if small",
  advertising: "line 8521",
  insurance: "line 8690",
  licences: "line 8760",
  phone: "line 9220",
  vehicle: "line 9281",
  education: "line 9270",
  other: "line 9270",
};

export const PAID_LABEL: Record<EarningsRow["paidVia"], string> = {
  lineup: "LineUp",
  cash: "Cash",
  card: "Card at shop",
  etransfer: "E-transfer",
  other: "Other",
  at_shop: "At the shop (method not recorded)",
};

export type Line = { label: string; cents: number; note?: string };

export type Statement = {
  income: Line[];
  grossIncome: number;
  costs: Line[];
  totalCosts: number;
  net: number;
  memo: Line[];
  // Money in by how it arrived.
  received: Line[];
  // Appointments by how they came in.
  activity: { label: string; count: number; cents: number }[];
  taxableSales: number; // services and no-show fees, tips and gift card sales excluded
  // The same totals as every other screen (earningsCore.summarize).
  summary: Summary;
};

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const of = (rows: EarningsRow[], ...types: EarningsType[]) => rows.filter((r) => types.includes(r.type));

export function buildStatement(rows: EarningsRow[], scope: Scope): Statement {
  // Every total comes from the one shared summary; this only lays it out.
  const t = summarize(rows, scope);
  const online = of(rows, "online");
  const atShop = of(rows, ...AT_SHOP_TYPES);
  const services = of(rows, ...SERVICE_TYPES);
  const noShow = of(rows, "no_show_fee");
  const memberships = of(rows, "membership");
  const rent = of(rows, "booth_rent");
  const products = of(rows, "product");
  const expenses = of(rows, "expense");
  const expenseLines: Line[] = (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[])
    .map((c) => ({ label: EXPENSE_CATEGORIES[c], cents: sum(expenses.filter((r) => r.category === c), (r) => r.priceCents), note: `You added these. Generally T2125 ${EXPENSE_LINE[c]}` }))
    .filter((l) => l.cents);
  const atShopSales = summarize(atShop, scope).grossServiceSales;

  let income: Line[];
  let costs: Line[];
  const memo: Line[] = [];

  if (scope === "me") {
    income = [
      { label: "Services paid through LineUp", cents: t.grossServiceSales - atShopSales, note: "Through LineUp" },
      { label: "Services paid at the shop", cents: atShopSales, note: "Recorded by hand: walk-ins, phone, pay at the shop" },
      { label: "Tips", cents: t.tips },
      { label: "No-show fees", cents: t.noShowFees, note: "Through LineUp" },
      { label: "Gift card sales", cents: t.giftCardSales, note: "Through LineUp, counted when sold" },
      { label: "Product sales", cents: t.productSales, note: "Recorded by you" },
    ];
    costs = [
      { label: "Refunds to clients", cents: t.refunds, note: "Cancelled bookings paid back" },
      { label: "LineUp commission", cents: t.lineupCommission, note: "Taken out of the price, never added on top" },
      { label: "Card processing fees", cents: t.cardFees, note: "Passed through at cost" },
      { label: "Shop commission", cents: t.shopCommission, note: "The shop's share of your bookings" },
      { label: "Booth rent paid", cents: t.boothRent },
      { label: "LineUp plan", cents: t.lineupPlan },
      ...expenseLines,
    ];
  } else {
    income = [
      { label: "Commission from the team", cents: t.shopCommission },
      { label: "Booth rent", cents: t.boothRent, note: "Through LineUp" },
      { label: "Memberships", cents: t.memberships, note: "Through LineUp" },
      { label: "Gift card sales", cents: t.giftCardSales, note: "Through LineUp, counted when sold" },
      { label: "Product sales", cents: t.productSales, note: "Recorded by the shop" },
    ];
    costs = [
      { label: "LineUp fees", cents: t.lineupCommission, note: "On memberships and gift cards" },
      { label: "Card processing fees", cents: t.cardFees, note: "On rent and gift cards, at cost" },
      { label: "LineUp plan", cents: t.lineupPlan },
      ...expenseLines,
    ];
    memo.push(
      { label: "Team sales through the shop", cents: sum(services, (r) => r.priceCents - r.giftCents), note: "Before the shop's commission" },
      { label: "Team tips", cents: t.tips, note: "All go to the pro" },
      { label: "Paid to the team", cents: sum(services, (r) => r.toProCents) }
    );
  }
  if (t.giftCardRedemptions) memo.push({ label: "Services paid with gift cards", cents: t.giftCardRedemptions, note: "Not counted again; gift cards count when sold" });
  if (t.chargebacks) memo.push({ label: "Chargebacks", cents: t.chargebacks, note: "Disputed by a client's bank. Not taken from these earnings" });
  if (t.recordedByHand) memo.push({ label: "Recorded by hand", cents: t.recordedByHand, note: "Walk-ins, phone, pay at the shop and products, with tips" });

  const gstPaid = sum(expenses, (r) => r.gstCents || 0);
  if (gstPaid) memo.push({ label: "GST/HST paid on expenses", cents: gstPaid, note: "Included in the expense amounts. Claimable if you're registered" });

  const grossIncome = sum(income, (l) => l.cents);
  const totalCosts = sum(costs, (l) => l.cents);

  // How the money arrived (client payments for this seller's income).
  const via = (v: EarningsRow["paidVia"]) => [...atShop, ...products].filter((r) => r.paidVia === v);
  const received: Line[] = [
    {
      label: scope === "me" ? "Paid out to you by LineUp" : "Paid out to the shop by LineUp",
      cents:
        scope === "me"
          ? sum(rows.filter((r) => r.paidVia === "lineup" && r.toProCents > 0), (r) => r.toProCents)
          : sum(rows.filter((r) => r.paidVia === "lineup" && r.toShopCents > 0), (r) => r.toShopCents),
    },
    { label: "Collected at the shop: cash", cents: sum(via("cash"), (r) => r.priceCents + r.tipCents) },
    { label: "Collected at the shop: card", cents: sum(via("card"), (r) => r.priceCents + r.tipCents) },
    { label: "Collected at the shop: e-transfer", cents: sum(via("etransfer"), (r) => r.priceCents + r.tipCents) },
    { label: "Collected at the shop: other", cents: sum(via("other"), (r) => r.priceCents + r.tipCents) },
    { label: "Collected at the shop: method not recorded", cents: sum(via("at_shop"), (r) => r.priceCents + r.tipCents) },
  ].filter((l, i) => i === 0 || l.cents);

  const ch = (c: EarningsRow["channel"]) => online.filter((r) => r.channel === c);
  const activityRows: [string, EarningsRow[], (r: EarningsRow) => number][] = [
    ["Booked online and paid", ch("direct"), (r) => r.priceCents + r.tipCents],
    ["From client requests", ch("request"), (r) => r.priceCents + r.tipCents],
    ["Regular (repeat) appointments", ch("regular"), (r) => r.priceCents + r.tipCents],
    ["Booked online, paid at the shop", of(rows, "pay_at_shop"), (r) => r.priceCents],
    ["Membership visits", of(rows, "membership_visit"), () => 0],
    ["Walk-ins", of(rows, "walk_in"), (r) => r.priceCents + r.tipCents],
    ["Phone bookings", of(rows, "phone"), (r) => r.priceCents + r.tipCents],
    ["No-shows charged", noShow, (r) => r.priceCents],
  ];
  const activity = activityRows
    .map(([label, list, f]) => ({ label, count: list.length, cents: sum(list, f) }))
    .filter((a) => a.count > 0);

  const taxableSales =
    scope === "me"
      ? sum(online, (r) => r.priceCents - r.giftCents) + sum(atShop, (r) => r.priceCents) + sum(noShow, (r) => r.priceCents) + sum(products, (r) => r.priceCents)
      : sum(services, (r) => r.toShopCents) + sum(rent, (r) => r.priceCents) + sum(memberships, (r) => r.priceCents) + sum(products, (r) => r.priceCents);

  // Laid out, the lines must still come to the shared total.
  if (grossIncome - totalCosts !== t.net) console.error(`Earnings statement out of balance: ${grossIncome - totalCosts} vs ${t.net}`);

  return {
    summary: t,
    income: income.filter((l) => l.cents),
    grossIncome,
    costs: costs.filter((l) => l.cents),
    totalCosts,
    net: t.net,
    memo: memo.filter((l) => l.cents),
    received,
    activity,
    taxableSales,
  };
}

// Paid through LineUp, by calendar quarter: what LineUp would report to the
// CRA under the platform reporting rules (Part XX of the Income Tax Act).
export function quarters(rows: EarningsRow[], scope: Scope) {
  const platform = rows.filter((r) => {
    if (r.paidVia !== "lineup") return false;
    if (r.type === "online" || r.type === "no_show_fee") return true;
    return scope === "shop" && (r.type === "membership" || r.type === "booth_rent");
  });
  return [1, 2, 3, 4].map((q) => {
    const list = platform.filter((r) => Math.ceil(Number(r.date.slice(5, 7)) / 3) === q);
    const paid = sum(list, (r) => r.priceCents - r.giftCents + r.tipCents);
    const fees = sum(list, (r) => r.lineupFeeCents);
    return { quarter: q, count: list.length, paid, fees, net: paid - fees };
  });
}

export function byMonth(rows: EarningsRow[], scope: Scope) {
  return Array.from({ length: 12 }, (_, i) => {
    const key = String(i + 1).padStart(2, "0");
    const s = buildStatement(rows.filter((r) => r.date.slice(5, 7) === key), scope);
    return { month: i, gross: s.grossIncome, costs: s.totalCosts, net: s.net };
  });
}

export function byPro(rows: EarningsRow[]) {
  const map = new Map<string, { name: string; rows: EarningsRow[] }>();
  for (const r of rows) {
    if (!r.proId || !SERVICE_TYPES.includes(r.type)) continue;
    const entry = map.get(r.proId) || { name: r.proName || "Team member", rows: [] };
    entry.rows.push(r);
    map.set(r.proId, entry);
  }
  return [...map.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      count: v.rows.length,
      sales: sum(v.rows, (r) => r.priceCents - r.giftCents),
      tips: sum(v.rows, (r) => r.tipCents),
      atShop: sum(v.rows.filter((r) => r.paidVia !== "lineup"), (r) => r.priceCents + r.tipCents),
      fees: sum(v.rows, (r) => r.lineupFeeCents),
      toShop: sum(v.rows, (r) => r.toShopCents),
      toPro: sum(v.rows, (r) => r.toProCents),
    }))
    .sort((a, b) => b.sales + b.tips - (a.sales + a.tips));
}

export function money(cents: number) {
  const value = (Math.abs(cents) / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  return cents < 0 ? `-${value}` : value;
}
