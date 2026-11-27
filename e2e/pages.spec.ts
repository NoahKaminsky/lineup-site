import { test, expect } from "@playwright/test";

/**
 * A missing page shows LineUp's own "page not found" screen, and pages have
 * their own tab titles. Read-only: it only opens pages.
 */
test.describe.configure({ timeout: 90_000 });

test("an address that doesn't exist shows a plain page-not-found screen", async ({ page }) => {
  const res = await page.goto("/nope-this-page-is-not-here");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page doesn’t exist." })).toBeVisible();
  await expect(page).toHaveTitle("Page not found — LineUp");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Browse pros" })).toHaveAttribute("href", "/discover");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

for (const [path, title] of [
  ["/login", "Sign in — LineUp"],
  ["/discover", "Browse pros — LineUp"],
  ["/privacy", "Privacy — LineUp"],
  ["/help", null],
] as const) {
  test(`${path} has its own tab title`, async ({ page }) => {
    await page.goto(path);
    if (title) await expect(page).toHaveTitle(title);
    else await expect(page).not.toHaveTitle("LineUp");
  });
}

test("a Studio section's tab says which section it is", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("lineup.test+owner@example.com");
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.goto("/studio/calendar");
  await expect(page).toHaveTitle("Calendar · Studio — LineUp");
  await page.goto("/studio");
  await expect(page).toHaveTitle("Studio — LineUp");
});
