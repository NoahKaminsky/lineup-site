import { test, expect } from "@playwright/test";

/**
 * Admin checks that need no TEST data (logged out).
 * Run: npx playwright test e2e/admin.spec.ts
 */
test("logged out: /admin sends you to login and back", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL(/\/login\?/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
});
