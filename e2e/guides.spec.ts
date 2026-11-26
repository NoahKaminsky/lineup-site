import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ALL_GUIDE_KEYS } from "../app/lib/guideContent";

/**
 * First-run guidance: welcome tours, getting-started checklists, page tips
 * and the Help page, for a customer, a pro and a shop owner. Runs at 1280 and
 * 390. Each test turns guides back on for its TEST user first (the seed starts
 * everyone with all guides seen), and puts them back as seen afterwards so the
 * other specs aren't covered by tips.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function guidesOn(who: string) {
  const { error } = await db.from("profiles").update({ guides_seen: [] }).eq("email", `lineup.test+${who}@example.com`);
  if (error) throw error;
}
async function guidesOff(who: string) {
  await db.from("profiles").update({ guides_seen: ALL_GUIDE_KEYS }).eq("email", `lineup.test+${who}@example.com`);
}
async function seen(who: string) {
  const { data } = await db.from("profiles").select("guides_seen").eq("email", `lineup.test+${who}@example.com`).single();
  return (data?.guides_seen as string[]) || [];
}

async function signIn(page: Page, who: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && page.url().startsWith("http://localhost") && errors.push(m.text().slice(0, 200)));
  return errors;
}

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("customer: tour, getting started, a page tip that stays closed, Help", async ({ page }) => {
  const errors = watchErrors(page);
  await guidesOn("customer");
  try {
    await signIn(page, "customer");
    await page.goto("/requests");

    // The welcome tour walks through all five steps and ends on Explore.
    const tour = page.getByRole("dialog", { name: /Booking, made easy/ });
    await expect(tour).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Everything in one place." })).toBeVisible();
    await page.getByRole("button", { name: "Find a pro", exact: true }).click();
    await page.waitForURL(/\/discover/);

    // Explore's tip: "Got it" closes it, and it stays closed after a reload.
    const tip = page.getByRole("complementary", { name: "Tip: Find a pro near you" });
    await expect(tip).toBeVisible();
    await noSidewaysScroll(page);
    await tip.getByRole("button", { name: "Got it" }).click();
    await expect(tip).toBeHidden();
    await expect.poll(() => seen("customer")).toContain("tip:discover");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("complementary", { name: "Tip: Find a pro near you" })).toBeHidden();

    // Getting started on Home, and the tour doesn't come back.
    await page.goto("/requests");
    await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Booking, made easy/ })).toBeHidden();
    await noSidewaysScroll(page);

    // Help: every section, and "Replay the tour" brings the tour back.
    await page.goto("/help");
    for (const name of ["For clients", "For pros", "For shops"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await noSidewaysScroll(page);
    await page.getByRole("button", { name: "Replay the tour" }).click();
    await page.waitForURL(/\/requests/);
    await expect(page.getByRole("dialog", { name: /Booking, made easy/ })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await guidesOff("customer");
  }
});

test("pro: Services tip and the grouped menu with Help", async ({ page }, info) => {
  const errors = watchErrors(page);
  await guidesOn("basic");
  try {
    await signIn(page, "basic");
    await page.goto("/services");
    await expect(page.getByRole("complementary", { name: "Tip: What clients can book" })).toBeVisible();
    await noSidewaysScroll(page);
    await page.getByRole("complementary").getByRole("button", { name: "Close tip" }).click();
    await expect(page.getByRole("complementary", { name: "Tip: What clients can book" })).toBeHidden();

    if (info.project.name === "desktop") {
      await page.getByRole("button", { name: /account menu|TB/i }).first().click();
      const menu = page.getByRole("navigation", { name: "Account" });
      for (const group of ["Your business", "Grow", "More"]) await expect(menu.getByText(group, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Help and guides" })).toBeVisible();
    }
    expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await guidesOff("basic");
  }
});

test("shop owner: tour, setup checklist with reasons, section tip", async ({ page }) => {
  const errors = watchErrors(page);
  await guidesOn("owner");
  try {
    await signIn(page, "owner");
    await page.goto("/studio");
    await expect(page.getByRole("dialog", { name: /Your shop, run from one place/ })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();

    const setup = page.getByRole("region", { name: "Finish setting up" });
    await expect(setup).toBeVisible();
    await expect(setup.getByText(/^Next: /)).toBeVisible();
    await expect(setup.getByText(/of \d+ done/)).toBeVisible();
    await noSidewaysScroll(page);

    await page.goto("/studio/team");
    await expect(page.getByRole("complementary", { name: "Tip: Your team" })).toBeVisible();

    // "Hide" puts the setup card away for good.
    await page.goto("/studio");
    await page.getByRole("region", { name: "Finish setting up" }).getByRole("button", { name: "Hide" }).click();
    await expect(page.getByRole("region", { name: "Finish setting up" })).toBeHidden();
    await expect.poll(() => seen("owner")).toContain("checklist:shop");
    expect(errors, errors.join("\n")).toEqual([]);
  } finally {
    await guidesOff("owner");
  }
});
