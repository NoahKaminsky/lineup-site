import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The new report pieces on TEST data: earnings over time with "vs before",
 * the spreadsheet download, and the Services card in pro and shop Analytics.
 * Read-only; runs at 1280 and 390.
 */
test.describe.configure({ timeout: 120_000 });

async function signIn(page: Page, who: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

test("shop earnings: over time, by service, and a CSV download", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/studio/earnings");
  await page.getByRole("tab", { name: "This month" }).click();
  const chart = page.getByRole("region", { name: "The shop's money over time" });
  await expect(chart).toBeVisible();
  await expect(chart.getByText(/vs before|Nothing to compare yet/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "By service" })).toBeVisible();
  await noSideways(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Spreadsheet (CSV)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^lineup-earnings-shop-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv.split("\n")[0]).toBe("Date,Type,Item,Client,Pro,Paid via,Price,Tip,Gift card,LineUp fees,Shop's cut,Refund,To the shop");
  expect(csv.split("\n").length).toBeGreaterThan(1);
});

test("analytics: the Services card for a pro and for the shop", async ({ page }) => {
  await signIn(page, "master");
  await page.goto("/analytics");
  await expect(page.locator("#services")).toBeVisible();
  await expect(page.locator("#services").getByText("TEST Haircut").first()).toBeVisible();
  await noSideways(page);

  await page.context().clearCookies();
  await signIn(page, "owner");
  await page.goto("/studio/analytics");
  await expect(page.locator("#services")).toBeVisible();
  await noSideways(page);
});
