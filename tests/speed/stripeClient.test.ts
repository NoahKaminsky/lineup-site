import { beforeEach, describe, expect, it, vi } from "vitest";

const loadStripe = vi.fn(async () => null);
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe }));

describe("getStripe", () => {
  beforeEach(() => {
    vi.resetModules();
    loadStripe.mockClear();
  });

  it("doesn't load Stripe.js just because a page imports it", async () => {
    await import("@/app/lib/stripeClient");
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("loads once, on the first payment form, and reuses it", async () => {
    const { getStripe } = await import("@/app/lib/stripeClient");
    const a = getStripe();
    const b = getStripe();
    expect(a).toBe(b);
    expect(loadStripe).toHaveBeenCalledTimes(1);
  });
});
