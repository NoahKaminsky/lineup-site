import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The sample shop (studios.is_demo): reachable by its link only, clearly
 * labelled, and it never takes a booking or payment. Uses the TEST shop on
 * the test database, switched to a demo for these checks and back after.
 * Runs at 1280 and 390.
 */
test.describe.configure({ mode: "serial", timeout: 90_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const shop = { id: "", slug: "", name: "" };

test.beforeAll(async () => {
  const { data: owner } = await db.from("profiles").select("id").eq("email", "lineup.test+owner@example.com").single();
  const { data: studio } = await db.from("studios").select("id, slug, name").eq("owner_id", owner!.id).single();
  Object.assign(shop, studio);
  await db.from("studios").update({ is_demo: true }).eq("id", shop.id);
});

test.afterAll(async () => {
  await db.from("studios").update({ is_demo: false }).eq("id", shop.id);
});

test("it isn't listed in Find a shop", async ({ page }) => {
  await page.goto("/shops");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(shop.name)).toHaveCount(0);
});

test("its page says it's a sample and stays out of search", async ({ page }) => {
  await page.goto(`/shop/${shop.slug}`);
  await expect(page.getByText("Sample shop", { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("link", { name: "Gift card" })).toHaveCount(0);
});

test("booking walks through the steps but never takes payment", async ({ page }) => {
  await page.goto(`/shop/${shop.slug}`);
  await page.getByRole("radiogroup", { name: "Times" }).getByRole("radio").first().click();
  const step = page.locator("#step-book");
  await expect(step.getByText(/This is a sample shop, so nothing is booked/)).toBeVisible();
  await expect(step.getByRole("button", { name: /Book|Hold my spot|pay/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("the sample shop's Studio never shows real clients' requests", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("lineup.test+owner@example.com");
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/studio/requests");
  await page.waitForLoadState("networkidle");
  // The seeded TEST request is near this shop; as a demo it isn't shown.
  await expect(page.getByText("TEST Open request")).toHaveCount(0);
});
