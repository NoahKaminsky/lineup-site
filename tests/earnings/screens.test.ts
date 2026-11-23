// The Earnings screens' numbers: ranges, the headline, what each line paid,
// the shop's money vs the team's, and booth rent.
import { describe, expect, it } from "vitest";
import { platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import {
  bookingEarnings,
  boothRentRow,
  boothRentStatus,
  checkRange,
  headline,
  inRange,
  lineBreakdown,
  rangeFor,
  shopAppointmentEarnings,
  shopSplit,
  summarize,
  type BookingInput,
} from "@/app/lib/earningsCore";

const TODAY = "2026-11-22"; // a Sunday

function paid(id: string, pro: string, date: string, priceCents: number, opts: { studio?: boolean; cut?: number; tip?: number } = {}): BookingInput {
  const fee = platformFeeCentsFor({ amountCents: priceCents, source: "direct_booking", inLiveStudio: !!opts.studio, profile: { subscription_plan: "pro", subscription_status: "active" } });
  const split = splitBookingPayment({ amountCents: priceCents, platformFeeCents: fee, depositPercent: 20, studioCutPercent: opts.cut || 0 });
  return {
    id, professional_id: pro, customer_id: null, studio_id: opts.studio ? "shop1" : null, booking_date: date, status: "completed",
    service_name: "TEST Cut", service_price: priceCents / 100, payment_status: "paid", refund_status: null,
    total_amount_cents: priceCents + (opts.tip || 0), platform_fee_cents: fee, studio_cut_cents: split.studioCutCents,
    gift_card_cents: 0, membership_id: null, no_show_fee_cents: null, no_show_status: null, source: null, standing_id: null,
  };
}
const rows = (b: BookingInput) => bookingEarnings(b, { today: TODAY, cutPercent: 0 }).rows;

describe("ranges", () => {
  it("week runs Monday to Sunday on the shop clock", () => {
    expect(rangeFor("week", TODAY)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(rangeFor("week", "2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(rangeFor("week", "2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" }); // crosses the year
  });
  it("month and year", () => {
    expect(rangeFor("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(rangeFor("year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("custom ranges are checked", () => {
    expect(checkRange("2026-11-01", "2026-11-30")).toBeNull();
    expect(checkRange("2026-11-30", "2026-11-01")).toMatch(/before/);
    expect(checkRange("2024-01-01", "2024-02-01")).toMatch(/2025/);
    expect(checkRange("2025-01-01", "2027-06-01")).toMatch(/two years/);
    expect(checkRange("nope", "2026-11-01")).toMatch(/Pick/);
  });
  it("filters lines to the range, ends included", () => {
    const all = [...rows(paid("a", "p1", "2026-11-15", 5000)), ...rows(paid("b", "p1", "2026-11-16", 5000)), ...rows(paid("c", "p1", "2026-11-22", 5000))];
    expect(inRange(all, "2026-11-16", "2026-11-22").map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("what each line paid", () => {
  it("a studio member's booking shows every fee and adds up to what they received", () => {
    const [r] = bookingEarnings(paid("a", "p1", "2026-11-20", 10000, { studio: true, cut: 20, tip: 1500 }), { today: TODAY, cutPercent: 20 }).rows;
    const { lines, received } = lineBreakdown(r, "me");
    expect(lines).toEqual([
      { label: "Price", cents: 10000 },
      { label: "Tip", cents: 1500 },
      { label: "Card processing fee", cents: -320 },
      { label: "Shop commission", cents: -1936 },
    ]);
    expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(received);
    expect(received).toBe(9244);
  });
  it("a solo pro's booking shows LineUp's commission", () => {
    const [r] = rows(paid("a", "p1", "2026-11-20", 10000));
    const { lines, received } = lineBreakdown(r, "me");
    expect(lines).toContainEqual({ label: "LineUp commission", cents: -1500 });
    expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(received);
  });
  it("from the shop's side, the line ends with the shop's cut", () => {
    const [r] = bookingEarnings(paid("a", "p1", "2026-11-20", 10000, { studio: true, cut: 20 }), { today: TODAY, cutPercent: 20 }).rows;
    const { received } = lineBreakdown(r, "shop");
    expect(received).toBe(1936);
  });
});

describe("the shop's own money vs the team's", () => {
  const owner = "owner";
  const all = [
    ...bookingEarnings(paid("a", "member1", "2026-11-20", 10000, { studio: true, cut: 20 }), { today: TODAY, cutPercent: 20 }).rows,
    ...bookingEarnings(paid("b", owner, "2026-11-20", 5000, { studio: true }), { today: TODAY, cutPercent: 0 }).rows,
    ...shopAppointmentEarnings({ id: "w", studio_id: "shop1", professional_id: "member2", kind: "walk_in", client_name: null, service_name: "Fade", appointment_date: "2026-11-19", price_cents: 4000, shop_cut_cents: 1200, status: "completed", paid_with: "cash", tip_cents: 500 }, TODAY).rows,
    boothRentRow({ id: "r1", date: "2026-11-01", amount: 50000 }, "shop", "renter"),
  ];
  const split = shopSplit(all, owner);

  it("keeps the owner's own services with the shop and members' take apart", () => {
    expect(split.shopOwn.commission).toBe(1936 + 1200);
    expect(split.shopOwn.boothRent).toBe(50000);
    expect(split.shopOwn.ownerServices).toBe(5000 - 175); // owner's own client: card fee only
    expect(split.team.map((p) => p.proId).sort()).toEqual(["member1", "member2"]);
    expect(split.team.find((p) => p.proId === "member2")).toMatchObject({ gross: 4500, shopCut: 1200, take: 3300 });
  });
  it("nothing is counted on both sides", () => {
    const everything = summarize(all, "shop").net + all.reduce((s, r) => s + r.toProCents, 0);
    expect(split.shopOwn.total + split.teamTake).toBe(everything);
  });
});

describe("booth rent", () => {
  it("shows paid, due and late per renter", () => {
    const paidRows = [boothRentRow({ id: "r1", date: "2026-11-01", amount: 50000 }, "shop", "renterA")];
    const status = boothRentStatus(
      [
        { proId: "renterA", name: "TEST Renter A", rentCents: 50000, rentInterval: "month", rentStatus: "active", periodEnd: "2026-12-01T00:00:00Z" },
        { proId: "renterB", name: "TEST Renter B", rentCents: 25000, rentInterval: "week", rentStatus: "past_due", periodEnd: "2026-11-20T00:00:00Z" },
      ],
      paidRows
    );
    expect(status[0]).toMatchObject({ paidCents: 50000, late: false, dueCents: 50000, dueDate: "2026-12-01", interval: "month" });
    expect(status[1]).toMatchObject({ paidCents: 0, late: true, dueCents: 25000, interval: "week" });
  });
});

describe("the sentence at the top", () => {
  it("says what you made, what's in the bank and what's coming", () => {
    const s = summarize(rows(paid("a", "p1", "2026-11-20", 146000)), "me"); // $1,460 at 15% = $1,241 net
    expect(headline(s, { heldUntilDoneCents: 38000, bank: { paidCents: 86000 } }, "this week", "me")).toBe(
      "You made $1,241 this week. $860 is already in your bank and $380 arrives after your next appointments are done."
    );
  });
  it("says why money is waiting", () => {
    const s = summarize(rows(paid("a", "p1", "2026-11-20", 10000)), "me");
    expect(headline(s, { heldUntilDoneCents: 8500, heldAfterDoneCents: 8500, bank: null, stripe: "none" }, "this week", "me")).toBe(
      "You made $85 this week. $85 is waiting until your payouts are set up."
    );
    expect(headline(s, { heldUntilDoneCents: 8500, heldAfterDoneCents: 2000, bank: null, stripe: "ready" }, "this week", "me")).toBe(
      "You made $85 this week. $65 arrives after your next appointments are done and $20 from finished appointments hasn't been sent yet."
    );
  });
  it("stays short when there's nothing else to say", () => {
    const s = summarize([], "me");
    expect(headline(s, null, "this week", "me")).toBe("You made $0 this week.");
  });
});
