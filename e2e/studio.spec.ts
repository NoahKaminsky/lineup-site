import { test, expect } from "@playwright/test";

/**
 * Studio checks that need no TEST data (logged out).
 * Run: npx playwright test e2e/studio.spec.ts
 */
const SECTIONS = ["", "/calendar", "/requests", "/team", "/clients", "/import", "/memberships", "/chairs", "/analytics", "/earnings", "/settings"];

test.describe("logged out", () => {
  for (const s of SECTIONS) {
    const path = `/studio${s}`;
    test(`${path} sends you to login and back`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login\?/, { timeout: 30_000 });
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }
});
