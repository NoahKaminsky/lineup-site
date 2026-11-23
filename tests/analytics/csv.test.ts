// Exports match the screen: the CSV is built from the same section data.
import { describe, expect, it } from "vitest";
import { sectionCsv } from "@/app/lib/analyticsCsv";
import { summaryInput } from "@/app/lib/analyticsSummary";

const H = { name: "TEST Shop", from: "2026-11-01", to: "2026-11-23", compareFrom: "2026-10-10", compareTo: "2026-10-31" };

describe("section CSV", () => {
  it("comparisons become two columns, money becomes dollars, counts stay counts", () => {
    const csv = sectionCsv("overview", { revenue: { now: 842000, prev: 751800 }, bookings: { now: 120, prev: 110 }, own: { commission: 12000, boothRent: 80000, memberships: 4500, total: 96500 }, suggestion: { text: "x" } }, H);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe('"TEST Shop: Overview, 2026-11-01 to 2026-11-23 (compared with 2026-10-10 to 2026-10-31). Amounts in Canadian dollars."');
    expect(lines).toContain("Revenue,8420.00,7518.00");
    expect(lines).toContain("Bookings,120,110");
    expect(lines).toContain("Own commission,120.00,");
    expect(lines).toContain("Own total,965.00,");
    expect(csv).not.toContain("Suggestion");
  });
  it("tables come out one row each, with headings", () => {
    const csv = sectionCsv("team", { team: [{ id: "a", name: "Jess, Test", revenue: 12000, bookings: 2, use: 9 }], heat: [[1, 2]] }, H);
    expect(csv).toContain('Id,Name,Revenue,Bookings,Use\na,"Jess, Test",120.00,2,9');
    expect(csv).not.toContain("Heat");
  });
});

describe("PDF summary", () => {
  it("uses the screen's numbers", () => {
    const pair = (now: number, prev: number) => ({ now, prev });
    const s = summaryInput("shop", { name: "TEST Shop", from: "2026-11-01", to: "2026-11-23", compareLabel: "period before" }, {
      overview: { revenue: pair(842000, 751800), bookings: pair(120, 110), avgTicket: pair(7017, 6835), newClients: pair(14, 10), rebook: pair(61, 58), own: { commission: 12000, boothRent: 80000, memberships: 4500, total: 96500 }, ownPrev: { total: 90000 }, suggestion: { text: "Up 12%." } },
      forecast: { confirmed: 410000, expected: 90000 },
      mix: { channels: [{ label: "Walk-ins", count: 40, revenue: 200000 }] },
      extra: { team: [{ name: "Jess", revenue: 300000, bookings: 44 }] },
    });
    expect(s.kpis[0]).toEqual({ label: "Revenue", value: "$8,420", delta: "Up 12%" });
    expect(s.kpis[4]).toEqual({ label: "Rebooked", value: "61%", delta: "Up 3 pts" });
    expect(s.kpis[5]).toEqual({ label: "Shop's own income", value: "$965", delta: "Up 7%" });
    expect(s.tables.find((t) => t.title === "Bookings by channel")?.rows).toEqual([{ label: "Walk-ins (40)", value: "$2,000" }]);
    expect(s.suggestions).toEqual(["Up 12%."]);
  });
});
