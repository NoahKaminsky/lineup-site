import { capMonthRange, getMonthlyBookingCap } from "@/app/lib/bookingCap";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOOKING_DEPOSIT_PERCENT,
  commissionPercentFor,
  platformFeeCentsFor,
  splitBookingPayment,
  STUDIO_MAX_COMMISSION_PERCENT,
} from "@/app/lib/commission";
import { PLAN_FEATURES } from "@/app/lib/plans";

// Pins LineUp's money rules as they are today (24 Nov 2026). These tests don't
// change any rule; they fail if one changes by accident.

describe("commission", () => {
  it("15% standard, 10% for a live Master plan", () => {
    expect(commissionPercentFor(null)).toBe(15);
    expect(commissionPercentFor({ subscription_plan: "pro", subscription_status: "active" })).toBe(15);
    expect(commissionPercentFor({ subscription_plan: "master", subscription_status: "active" })).toBe(10);
    expect(commissionPercentFor({ subscription_plan: "master", subscription_status: "trialing" })).toBe(10);
    expect(commissionPercentFor({ subscription_plan: "master", subscription_status: "canceled" })).toBe(15);
  });

  it("comes out of the price: $100 request booking, Basic pro → $15 fee", () => {
    expect(platformFeeCentsFor({ amountCents: 10000, source: "request", inLiveStudio: false, profile: null })).toBe(1500);
  });

  it("live Studio member, own client: card fee at cost (2.9% + 30¢), not commission", () => {
    expect(platformFeeCentsFor({ amountCents: 10000, source: "direct_booking", inLiveStudio: true, profile: null })).toBe(320);
    // A client's request still pays the normal commission, even in a studio.
    expect(platformFeeCentsFor({ amountCents: 10000, source: "request", inLiveStudio: true, profile: null })).toBe(1500);
    // The fee never exceeds the price.
    expect(platformFeeCentsFor({ amountCents: 20, source: "direct_booking", inLiveStudio: true, profile: null })).toBe(20);
  });
});

describe("splitBookingPayment", () => {
  it("$100, $15 fee, 20% deposit, no shop cut", () => {
    const s = splitBookingPayment({ amountCents: 10000, platformFeeCents: 1500, depositPercent: BOOKING_DEPOSIT_PERCENT, studioCutPercent: 0 });
    expect(s).toEqual({ platformFeeCents: 1500, depositAmountCents: 2000, studioCutCents: 0, professionalPayoutCents: 8500, remainingPayoutCents: 6500 });
  });

  it("shop cut is a share of what's left after the fee, capped at 70%", () => {
    const s = splitBookingPayment({ amountCents: 10000, platformFeeCents: 320, depositPercent: 20, studioCutPercent: 40 });
    expect(s.studioCutCents).toBe(3872);
    expect(s.professionalPayoutCents + s.studioCutCents + s.platformFeeCents).toBe(10000);
    const capped = splitBookingPayment({ amountCents: 10000, platformFeeCents: 0, depositPercent: 20, studioCutPercent: 95 });
    expect(capped.studioCutCents).toBe(10000 * (STUDIO_MAX_COMMISSION_PERCENT / 100));
  });

  it("never pays out more than the price", () => {
    for (const cut of [0, 30, 70, 100]) {
      const s = splitBookingPayment({ amountCents: 4321, platformFeeCents: 648, depositPercent: 20, studioCutPercent: cut });
      expect(s.platformFeeCents + s.studioCutCents + s.professionalPayoutCents).toBe(4321);
      expect(s.remainingPayoutCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("monthly request-booking cap", () => {
  // One definition (app/lib/bookingCap.ts), used by checkout, the webhook's
  // "nearing your limit" notice and the pro's usage meter.
  const USERS = ["app/lib/paymentBookings.ts", "app/api/professional/booking-usage/route.ts", "app/api/stripe/create-payment-intent/route.ts"];

  it("is defined once and every user imports it", () => {
    for (const f of USERS) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/function getMonthlyBookingCap/);
      expect(src, f).toContain('from "@/app/lib/bookingCap"');
    }
  });

  it("matches the plans page: Basic 15, Apprentice 25, Pro and Master unlimited", () => {
    expect(getMonthlyBookingCap({})).toBe(15);
    expect(getMonthlyBookingCap({ subscription_status: "canceled", subscription_plan: "master" })).toBe(15);
    expect(getMonthlyBookingCap({ subscription_status: "active", subscription_plan: "apprentice" })).toBe(25);
    expect(getMonthlyBookingCap({ subscription_status: "trialing", subscription_plan: "pro" })).toBeNull();
    expect(getMonthlyBookingCap({ subscription_status: "active", subscription_plan: "master" })).toBeNull();
    expect(getMonthlyBookingCap({ subscription_status: "active", subscription_plan: "something-new" })).toBe(15);
  });

  it("counts the calendar month", () => {
    expect(capMonthRange(new Date(2026, 10, 25))).toEqual({ monthStart: new Date(2026, 10, 1).toISOString().slice(0, 10), monthEnd: new Date(2026, 11, 0).toISOString().slice(0, 10) });
  });
});
