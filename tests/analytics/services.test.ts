import { describe, expect, it } from "vitest";
import { serviceStats, type AVisit } from "@/app/lib/analyticsMetrics";

describe("services", () => {
  const v = (o: Partial<AVisit>): AVisit => ({ date: "2026-11-10", startMin: 600, minutes: 60, clientKey: "a", service: "Fade", sales: 4000, state: "done" as const, ...o });
  const p = { from: "2026-11-01", to: "2026-11-30" };
  const cmp = { from: "2026-10-01", to: "2026-10-31" };
  it("revenue, bookings, average, per hour and share by service", () => {
    const out = serviceStats([v({}), v({ clientKey: "b", minutes: 30, sales: 3000 }), v({ service: "Beard", sales: 2000, minutes: 20 })], p, cmp);
    expect(out[0]).toMatchObject({ name: "Fade", bookings: 2, revenue: 7000, avgTicket: 3500, perHour: Math.round(7000 / 1.5), share: 78 });
    expect(out[1]).toMatchObject({ name: "Beard", perHour: 6000 });
  });
  it("change against the comparison period, and who came back afterwards", () => {
    const out = serviceStats(
      [v({ date: "2026-10-05", sales: 2000 }), v({}), v({ clientKey: "b" }), v({ date: "2026-11-20", clientKey: "a", service: "Beard", state: "upcoming" })],
      p,
      cmp
    );
    const fade = out.find((s) => s.name === "Fade")!;
    expect(fade.change).toBe(300);
    expect(fade.cameBack).toBe(50);
  });
  it("leaves out imported, cancelled and no-show visits", () => {
    expect(serviceStats([v({ imported: true }), v({ state: "cancelled" }), v({ state: "no_show" })], p, cmp)).toEqual([]);
  });
});
