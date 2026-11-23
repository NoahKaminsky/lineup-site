import { describe, expect, it } from "vitest";
import { isTestEmail, testEmail, TEST_ACCOUNTS, unsafeTargetReason } from "../../scripts/test-data.mjs";

const LIVE = "https://rbsgsymjmptwczecgohb.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const ok = { SUPABASE_SERVICE_ROLE_KEY: "x", STRIPE_SECRET_KEY: "sk_test_abc" };

describe("TEST data guard", () => {
  it("refuses to write to the live project without Noah's OK", () => {
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LIVE }, true)).toMatch(/LIVE Supabase project/);
  });
  it("allows writing to the live project only with the exact OK value", () => {
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LIVE, LINEUP_ALLOW_LIVE_TEST_DATA: "yes" }, true)).not.toBeNull();
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LIVE, LINEUP_ALLOW_LIVE_TEST_DATA: "yes-noah-approved" }, true)).toBeNull();
  });
  it("allows read-only checks and a local database", () => {
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LIVE }, false)).toBeNull();
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LOCAL }, true)).toBeNull();
  });
  it("refuses live Stripe keys and production", () => {
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LOCAL, STRIPE_SECRET_KEY: "sk_live_x" }, true)).toMatch(/not a test key/);
    expect(unsafeTargetReason({ ...ok, NEXT_PUBLIC_SUPABASE_URL: LOCAL, VERCEL_ENV: "production" }, true)).toMatch(/production/);
    expect(unsafeTargetReason({ NEXT_PUBLIC_SUPABASE_URL: LOCAL }, true)).toMatch(/needed/);
  });
});

describe("TEST accounts", () => {
  it("every account is TEST-named and uses the reserved example.com domain", () => {
    for (const [who, a] of Object.entries(TEST_ACCOUNTS)) {
      expect(a.name.startsWith("TEST ")).toBe(true);
      expect(isTestEmail(testEmail(who))).toBe(true);
    }
  });
  it("never treats a real address as TEST", () => {
    for (const e of ["noah@gmail.com", "lineup.test+x@gmail.com", "test@example.com", null]) expect(isTestEmail(e)).toBe(false);
  });
});
