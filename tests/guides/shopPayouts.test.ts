import { describe, expect, it } from "vitest";
import { shopPayoutHint } from "@/app/lib/shopPayouts";
import { plainStripeRequirements } from "@/app/lib/stripeRequirements";

describe("shop payout hint", () => {
  it("explains setup when there's no account", () => {
    expect(shopPayoutHint({ connected: false, ready: false })).toMatch(/about 5 minutes/);
    expect(shopPayoutHint(null)).toMatch(/about 5 minutes/);
  });
  it("names exactly what Stripe still needs, in plain words", () => {
    const needs = plainStripeRequirements(["individual.verification.proof_of_liveness", "external_account"]);
    const hint = shopPayoutHint({ connected: true, ready: false, needs });
    expect(hint).toContain("a quick selfie to confirm it's you");
    expect(hint).toContain("your bank account");
    expect(hint).toMatch(/add them/);
  });
  it("says one thing as 'it'", () => {
    expect(shopPayoutHint({ connected: true, ready: false, needs: ["your bank account"] })).toMatch(/add it\.$/);
  });
  it("says Stripe is reviewing when nothing is due", () => {
    expect(shopPayoutHint({ connected: true, ready: false, needs: [] })).toMatch(/checking your details/);
  });
});
