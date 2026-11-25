import { describe, expect, it } from "vitest";
import { weeklySubject } from "@/app/lib/weeklySummary";
import type { AnalyticsSummary } from "@/app/lib/analytics";

const make = (visits: number, sales: number, ahead: number, shop = false) =>
  ({ scope: shop ? "shop" : "pro", name: "TEST Shop", kpis: { visits: { now: visits }, sales: { now: sales } }, onTheBooks: { next7Visits: ahead } }) as unknown as AnalyticsSummary;

describe("weekly summary subject", () => {
  it("leads with last week's takings when there were appointments", () => {
    expect(weeklySubject(make(3, 12000, 2))).toMatch(/^Your week: .*120.* from 3 appointments$/);
    expect(weeklySubject(make(1, 4000, 0, true))).toMatch(/^TEST Shop: .* from 1 appointment$/);
  });
  it("after a quiet week, leads with what's booked instead of $0", () => {
    expect(weeklySubject(make(0, 0, 4))).toBe("Your week: 4 appointments booked for the next 7 days");
    expect(weeklySubject(make(0, 0, 1))).toBe("Your week: 1 appointment booked for the next 7 days");
    expect(weeklySubject(make(0, 0, 0))).not.toMatch(/\$0/);
  });
});
