import { test, expect } from "@playwright/test";

/**
 * Pro checks that need no TEST data (logged out).
 * Run: npx playwright test e2e/pro.spec.ts
 */
const ZERO = "00000000-0000-0000-0000-000000000000";
const PRO_PAGES = [
  "/work", "/calendar", "/services", "/earnings", "/analytics", "/import", "/chairs",
  "/subscription", "/verification", "/refer", "/gift-cards", `/requests/${ZERO}/respond`,
];

test.describe("logged out", () => {
  for (const path of PRO_PAGES) {
    test(`${path} sends you to login and back`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login\?/, { timeout: 30_000 });
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }
});
