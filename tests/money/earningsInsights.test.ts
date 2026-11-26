import { describe, expect, it } from "vitest";
import { summarize, type EarningsRow } from "@/app/lib/earningsCore";
import { byPayment, byService, byWeekday, earningsCsv, pctChange, periodStats, previousRange, trend } from "@/app/lib/earningsInsights";

const row = (o: Partial<EarningsRow>): EarningsRow => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-11-02",
  type: "online",
  proId: "p1",
  proName: "Pat",
  client: "Sam",
  item: "Fade",
  paidVia: "lineup",
  source: "lineup",
  priceCents: 4000,
  tipCents: 0,
  giftCents: 0,
  lineupFeeCents: 600,
  cardFeeCents: 146,
  toShopCents: 0,
  toProCents: 3400,
  refundCents: 0,
  chargebackCents: 0,
  ...o,
});

const rows: EarningsRow[] = [
  row({ date: "2026-11-02", tipCents: 800, toProCents: 4200 }),
  row({ date: "2026-11-03", item: "Beard", priceCents: 2000, toProCents: 1700 }),
  row({ date: "2026-11-03", type: "walk_in", paidVia: "cash", source: "by_hand", lineupFeeCents: 0, cardFeeCents: 0, toProCents: 4000 }),
  row({ date: "2026-11-05", item: "Fade (cancelled and refunded)", refundCents: 4000, toProCents: 0 }),
  row({ date: "2026-11-06", type: "expense", item: "Clippers", paidVia: "card", source: "by_hand", priceCents: 12000, lineupFeeCents: 0, cardFeeCents: 0, toProCents: -12000 }),
];

describe("earnings insights", () => {
  it("the period before has the same length and ends the day before", () => {
    expect(previousRange("2026-11-01", "2026-11-30")).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(previousRange("2026-11-02", "2026-11-08")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("the trend adds up to the statement's net, by day for a week", () => {
    const t = trend(rows, "2026-11-02", "2026-11-08", "me");
    expect(t).toHaveLength(7);
    expect(t.reduce((s, b) => s + b.cents, 0)).toBe(summarize(rows, "me").net);
    expect(t[1]).toMatchObject({ from: "2026-11-03", cents: 5700, visits: 2 });
  });

  it("weeks for a quarter, months for a year, never spilling past the range", () => {
    const q = trend(rows, "2026-09-01", "2026-11-30", "me");
    expect(q[0].from).toBe("2026-09-01");
    expect(q[q.length - 1].to).toBe("2026-11-30");
    const y = trend(rows, "2026-01-01", "2026-12-31", "me");
    expect(y.map((b) => b.label)[10]).toBe("Nov");
    expect(y.reduce((s, b) => s + b.cents, 0)).toBe(summarize(rows, "me").net);
  });

  it("visit stats leave out refunded visits; tips as a share of service sales", () => {
    const s = periodStats(rows, "me");
    expect(s.visits).toBe(3);
    expect(s.serviceSales).toBe(10000);
    expect(s.tips).toBe(800);
    expect(s.tipRate).toBe(8);
    expect(s.tippedShare).toBe(33);
    expect(s.perVisit).toBe(Math.round((4200 + 1700 + 4000) / 3));
    expect(s.take).toBe(summarize(rows, "me").net);
  });

  it("percent change, and nothing when there's no earlier figure", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
  });

  it("services: most earned first, with average price and share", () => {
    const s = byService(rows, "me");
    expect(s[0]).toMatchObject({ name: "Fade", visits: 2, sales: 8000, take: 8200, avgPrice: 4000 });
    expect(s[1].name).toBe("Beard");
    expect(s.reduce((a, b) => a + b.share, 0)).toBeGreaterThanOrEqual(99);
  });

  it("how clients paid: money in only (no expenses, refunds, or gift-card part)", () => {
    const p = byPayment([...rows, row({ giftCents: 1000 })]);
    expect(p.find((x) => x.via === "lineup")?.cents).toBe(4800 + 2000 + 3000);
    expect(p.find((x) => x.via === "cash")?.cents).toBe(4000);
    expect(p.some((x) => x.via === "card")).toBe(false);
  });

  it("weekdays start on Monday", () => {
    const w = byWeekday(rows, "me");
    expect(w[0]).toMatchObject({ label: "Mon", cents: 4200, visits: 1 });
    expect(w[1]).toMatchObject({ label: "Tue", visits: 2 });
  });

  it("CSV: one line per row, dollars, commas quoted", () => {
    const csv = earningsCsv([row({ item: "Fade, beard" })], "me").split("\n");
    expect(csv[0]).toMatch(/^Date,Type,Item/);
    expect(csv[1]).toContain('"Fade, beard"');
    expect(csv[1]).toContain("40.00");
    expect(csv[1].endsWith("34.00")).toBe(true);
  });
});
