// The tax year: totals, automatic expenses, the category mapping, the
// GST/HST four-quarter sum (across a year boundary) and the corporation layout.
import { describe, expect, it } from "vitest";
import { platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import {
  bookingEarnings,
  boothRentRow,
  expenseRow,
  giftCardSaleRow,
  planRow,
  shopAppointmentEarnings,
  summarize,
  type BookingInput,
  type EarningsRow,
} from "@/app/lib/earningsCore";
import { AUTO_EXPENSES, EXPENSE_CATEGORIES, INCOME_LINES, T2125_LINE, DISCLAIMER } from "@/app/lib/taxCategories";
import { gstTracker, lastFourQuarters, taxYear } from "@/app/lib/taxYear";

const TODAY = "2026-11-22";

function paid(id: string, date: string, priceCents: number, opts: { tip?: number; refunded?: boolean } = {}): BookingInput {
  const fee = platformFeeCentsFor({ amountCents: priceCents, source: "direct_booking", inLiveStudio: false, profile: { subscription_plan: "pro", subscription_status: "active" } });
  const split = splitBookingPayment({ amountCents: priceCents, platformFeeCents: fee, depositPercent: 20, studioCutPercent: 0 });
  return {
    id, professional_id: "pro1", customer_id: null, studio_id: null, booking_date: date, status: opts.refunded ? "cancelled" : "completed",
    service_name: "TEST Cut", service_price: priceCents / 100, payment_status: "paid", refund_status: opts.refunded ? "refunded" : null,
    total_amount_cents: priceCents + (opts.tip || 0), platform_fee_cents: split.platformFeeCents, studio_cut_cents: 0,
    gift_card_cents: 0, membership_id: null, no_show_fee_cents: null, no_show_status: null, source: null, standing_id: null,
  };
}
const b = (x: BookingInput) => bookingEarnings(x, { today: TODAY, cutPercent: 0 }).rows;

// A pro's year: two bookings (one with a tip), a refund, a gift card sold,
// booth rent paid, a plan charge, a boost and two expenses.
const year: EarningsRow[] = [
  ...b(paid("a", "2026-03-10", 10000, { tip: 1500 })),
  ...b(paid("b", "2026-07-02", 8000)),
  ...b(paid("c", "2026-07-20", 6000, { refunded: true })),
  giftCardSaleRow({ id: "g", professional_id: "pro1", amount_cents: 5000, buyer_name: null, recipient_name: null }, "2026-05-01", "pro"),
  boothRentRow({ id: "r", date: "2026-02-01", amount: 40000 }, "pro", "pro1"),
  planRow({ id: "p", date: "2026-01-15", amount: 5000 }, "pro", "pro1"),
  expenseRow({ id: "e1", expense_date: "2026-04-04", amount_cents: 2500, gst_cents: 119 }, "supplies", "Supplies", "pro"),
  expenseRow({ id: "e2", expense_date: "2026-09-09", amount_cents: 6000, gst_cents: 0 }, "phone", "Phone", "pro"),
];
const boosts = [{ date: "2026-06-01", cents: 1999 }];

describe("the tax year", () => {
  const t = taxYear(year, boosts, "me");

  it("adds up gross income, with refunds taken off", () => {
    const byKey = Object.fromEntries(t.income.map((l) => [l.key, l.cents]));
    expect(byKey).toEqual({ services: 24000, tips: 1500, gift_cards: 5000, refunds: -6000 });
    expect(t.grossIncome).toBe(24500);
  });

  it("adds the fees LineUp knows about as expenses automatically", () => {
    const byKey = Object.fromEntries(t.autoExpenses.map((l) => [l.key, l.cents]));
    expect(byKey).toEqual({
      lineup_commission: 1500 + 1200 + 100, // 15% on $100 and $80, plus the gift card's $1 LineUp fee
      card_fees: 160, // 3.2% on the $50 gift card
      lineup_plan: 5000,
      boosts: 1999,
      booth_rent_paid: 40000,
    });
    expect(t.autoExpenses.every((l) => l.auto)).toBe(true);
  });

  it("lists the expenses the pro added, by category", () => {
    expect(t.ownExpenses.map((l) => [l.key, l.cents, l.line])).toEqual([
      ["supplies", 2500, "8811"],
      ["phone", 6000, "9220"],
    ]);
  });

  it("net income is gross minus every expense, and agrees with Earnings once boosts are counted", () => {
    expect(t.net).toBe(t.grossIncome - t.totalExpenses);
    expect(t.net).toBe(summarize(year, "me").net - 1999);
  });

  it("monthly figures add up to the year", () => {
    expect(t.months.reduce((s, m) => s + m.net, 0)).toBe(t.net);
    expect(t.months[2].income).toBe(11500); // March: $100 + $15 tip
  });
});

describe("the category mapping", () => {
  it("every income line, expense category and automatic expense has a T2125 line", () => {
    for (const k of [...Object.keys(INCOME_LINES), ...Object.keys(EXPENSE_CATEGORIES), ...Object.keys(AUTO_EXPENSES)]) {
      expect(T2125_LINE[k as keyof typeof T2125_LINE], k).toMatch(/^\d{4}$/);
    }
  });
  it("the disclaimer reads exactly as agreed", () => {
    expect(DISCLAIMER).toBe("This is a record of your LineUp earnings to help with your taxes. It isn't a tax slip or tax advice.");
  });
});

describe("corporations", () => {
  it("get a neutral summary with no T2125 line numbers, same totals", () => {
    const corp = taxYear(year, boosts, "me", "corporation");
    const sole = taxYear(year, boosts, "me", "sole_proprietor");
    expect(corp.layout).toBe("summary");
    expect([...corp.income, ...corp.autoExpenses, ...corp.ownExpenses].every((l) => l.line === null)).toBe(true);
    expect(corp.net).toBe(sole.net);
  });
});

describe("GST/HST small supplier tracker", () => {
  it("uses the four calendar quarters ending now, across a year boundary", () => {
    expect(lastFourQuarters("2026-02-10").map((q) => q.label)).toEqual(["Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026"]);
    expect(lastFourQuarters("2026-02-10")[0]).toMatchObject({ from: "2025-04-01", to: "2025-06-30" });
    expect(lastFourQuarters("2026-12-31")[3]).toMatchObject({ label: "Q4 2026", from: "2026-10-01", to: "2026-12-31" });
  });

  it("sums taxable sales only (no tips, no gift card sales), and leaves out older quarters", () => {
    const rows = [
      ...b(paid("old", "2025-03-31", 999900)), // Q1 2025: outside the window
      ...b(paid("q2", "2025-06-30", 1000000, { tip: 50000 })), // Q2 2025: $10,000 (tip excluded)
      ...b(paid("q1", "2026-01-01", 1500000)), // Q1 2026: $15,000
      ...shopAppointmentEarnings({ id: "w", studio_id: null, professional_id: "pro1", kind: "walk_in", client_name: null, service_name: "Cut", appointment_date: "2025-11-15", price_cents: 400000, shop_cut_cents: 0, status: "completed", paid_with: "cash", tip_cents: 9000 }, TODAY).rows,
      giftCardSaleRow({ id: "g", professional_id: "pro1", amount_cents: 100000, buyer_name: null, recipient_name: null }, "2026-01-05", "pro"),
    ];
    const g = gstTracker(rows, "2026-02-10", "me");
    expect(g.quarters.map((q) => q.cents)).toEqual([1000000, 0, 400000, 1500000]);
    expect(g.totalCents).toBe(2900000);
    expect(g.over).toBe(false);
    expect(g.leftCents).toBe(100000);
  });

  it("flags going over $30,000", () => {
    const rows = b(paid("big", "2026-10-01", 3000100));
    const g = gstTracker(rows, TODAY, "me");
    expect(g.over).toBe(true);
    expect(g.overInOneQuarter).toBe(true);
  });

  it("a refunded booking isn't a taxable sale", () => {
    const rows = b(paid("r", "2026-10-02", 10000, { tip: 1000, refunded: true }));
    expect(gstTracker(rows, TODAY, "me").totalCents).toBe(0);
  });
});
