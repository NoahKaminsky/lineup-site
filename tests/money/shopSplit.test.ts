import { describe, expect, it, vi } from "vitest";

// app/lib/studios.ts loads the Stripe client; nothing here calls Stripe.
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY ||= "sk_test_unit";
});
import { BOOKING_DEPOSIT_PERCENT, platformFeeCentsFor, splitBookingPayment } from "@/app/lib/commission";
import { effectiveCutPercent } from "@/app/lib/studios";

// Where every cent of a shop booking goes, for each arrangement a pro can
// have with a shop. The money always adds back up to what the client paid.

const plus = { plan: "studio_plus", subscription_status: "active", commission_percent: 40 } as const;
const studio = { plan: "studio", subscription_status: "active", commission_percent: 40 } as const;
const lapsed = { plan: "studio_plus", subscription_status: "canceled", commission_percent: 40 } as const;
const proPlan = { subscription_plan: "pro", subscription_status: "active" };

function split(amountCents: number, shop: Parameters<typeof effectiveCutPercent>[0], member: Parameters<typeof effectiveCutPercent>[1], source: "direct_booking" | "request" = "direct_booking") {
  const live = shop.subscription_status === "active";
  const platformFeeCents = platformFeeCentsFor({ amountCents, source, inLiveStudio: live, profile: proPlan });
  return splitBookingPayment({ amountCents, platformFeeCents, depositPercent: BOOKING_DEPOSIT_PERCENT, studioCutPercent: effectiveCutPercent(shop, member) });
}

describe("a $100 shop booking, by arrangement", () => {
  it("commission pro (40%), own client: card fee at cost, shop gets 40% of the rest", () => {
    const s = split(10000, plus, { arrangement: "commission", commission_percent: 40 });
    expect(s.platformFeeCents).toBe(320); // 2.9% + 30¢
    expect(s.studioCutCents).toBe(3872); // 40% of $96.80
    expect(s.professionalPayoutCents).toBe(5808);
    expect(s.depositAmountCents).toBe(2000); // paid to the pro at booking
    expect(s.remainingPayoutCents).toBe(3808); // paid to the pro when done
  });

  it("commission pro with their own rate (30%) overrides the shop's 40%", () => {
    expect(split(10000, plus, { arrangement: "commission", commission_percent: 30 }).studioCutCents).toBe(2904);
  });

  it("booth renter: no shop cut, ever; they pay rent instead", () => {
    const s = split(10000, plus, { arrangement: "booth_rent", commission_percent: 40 });
    expect(s.studioCutCents).toBe(0);
    expect(s.professionalPayoutCents).toBe(9680);
  });

  it("a client from a request: LineUp's 15% applies, then the shop's cut", () => {
    const s = split(10000, plus, { arrangement: "commission", commission_percent: 40 }, "request");
    expect(s.platformFeeCents).toBe(1500);
    expect(s.studioCutCents).toBe(3400);
    expect(s.professionalPayoutCents).toBe(5100);
  });

  it("shop on Studio (not Plus), or a lapsed plan: no cut", () => {
    expect(split(10000, studio, { arrangement: "commission", commission_percent: 40 }).studioCutCents).toBe(0);
    expect(split(10000, lapsed, { arrangement: "commission", commission_percent: 40 }).studioCutCents).toBe(0);
  });

  it("a cut set above the 70% cap is held to 70%", () => {
    expect(split(10000, { ...plus, commission_percent: 95 }, { arrangement: "commission", commission_percent: null }).studioCutCents).toBe(6776);
  });
});

describe("every cent is accounted for", () => {
  it("fee + shop cut + pro payout = what the client paid, and the deposit never exceeds the pro's share", () => {
    const members = [
      { arrangement: "commission", commission_percent: 0 },
      { arrangement: "commission", commission_percent: 25 },
      { arrangement: "commission", commission_percent: 70 },
      { arrangement: "booth_rent", commission_percent: 50 },
      null,
    ] as const;
    for (const amount of [500, 999, 2500, 4000, 10000, 12345, 50000]) {
      for (const shop of [plus, studio, lapsed]) {
        for (const member of members) {
          for (const source of ["direct_booking", "request"] as const) {
            const s = split(amount, shop, member, source);
            const label = `${amount} ${shop.plan}/${shop.subscription_status} ${member?.arrangement}/${member?.commission_percent} ${source}`;
            expect(s.platformFeeCents + s.studioCutCents + s.professionalPayoutCents, label).toBe(amount);
            expect(s.depositAmountCents + s.remainingPayoutCents, label).toBe(s.professionalPayoutCents);
            expect(s.depositAmountCents, label).toBeLessThanOrEqual(s.professionalPayoutCents);
            for (const v of Object.values(s)) expect(v, label).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});
