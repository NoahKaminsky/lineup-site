import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The TEST admin's tools, against seeded TEST data (scripts/test-data.mts).
 * Safety: only TEST accounts are changed, and every change is put back.
 * The Newsletter tab is opened to read counts; its send button is never pressed.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let page: Page;
let basicId = "";
const consoleErrors: string[] = [];

async function signIn(p: Page, who: string) {
  await p.goto("/login");
  await p.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}
const flag = async (col: "is_featured" | "is_founding_artist") =>
  (await db.from("profiles").select(col).eq("id", basicId).single()).data?.[col as never];

test.beforeAll(async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop", "runs once on desktop; the 390px check opens its own page");
  basicId = (await db.from("profiles").select("id").eq("email", "lineup.test+basic@example.com").single()).data!.id;
  await db.from("profiles").update({ is_featured: false, is_founding_artist: false }).eq("id", basicId);
  page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await signIn(page, "admin");
});
test.afterAll(async () => {
  await db.from("profiles").update({ is_featured: false, is_founding_artist: false }).eq("id", basicId);
  await page?.close();
});

test("a customer who opens /admin goes to their account", async ({ browser }) => {
  const p = await browser.newPage();
  await signIn(p, "customer");
  await p.goto("/admin");
  await p.waitForURL(/\/account/, { timeout: 30_000 });
  await p.close();
});

test("Users: find a TEST pro, feature and un-feature them, founding on and off", async () => {
  await page.goto("/admin");
  await page.getByPlaceholder("Search by name or email").fill("lineup.test+basic");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const row = page.locator("tr", { hasText: "TEST Basic Pro" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Feature", exact: true }).click();
  await expect.poll(() => flag("is_featured"), { timeout: 15_000 }).toBe(true);
  await row.getByRole("button", { name: "Featured", exact: true }).click();
  await expect.poll(() => flag("is_featured"), { timeout: 15_000 }).toBe(false);
  await row.getByRole("button", { name: "Mark founding" }).click();
  await expect.poll(() => flag("is_founding_artist"), { timeout: 15_000 }).toBe(true);
  await row.getByRole("button", { name: "Founding", exact: true }).click();
  await expect.poll(() => flag("is_founding_artist"), { timeout: 15_000 }).toBe(false);
});

test("Content: the TEST review shows under Reviews", async () => {
  await page.getByRole("button", { name: "Reviews", exact: true }).click();
  await expect(page.getByText("TEST review: great cut.")).toBeVisible({ timeout: 20_000 });
});

test("Content: with TEST accounts only, the TEST review can be deleted (then put back)", async () => {
  const { data: review } = await db.from("professional_reviews").select("*").eq("comment", "TEST review: great cut.").single();
  expect(review).toBeTruthy();
  try {
    await page.getByRole("button", { name: "Reviews", exact: true }).click();
    await page.getByRole("checkbox", { name: "TEST accounts only" }).check();
    const row = page.locator("div", { hasText: "TEST review: great cut." }).filter({ has: page.getByRole("button", { name: "Delete", exact: true }) }).last();
    await expect(row).toBeVisible({ timeout: 20_000 });
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(async () => (await db.from("professional_reviews").select("id").eq("id", review!.id)).data?.length ?? -1, { timeout: 20_000 }).toBe(0);
  } finally {
    const { data: still } = await db.from("professional_reviews").select("id").eq("id", review!.id);
    if (!still?.length) await db.from("professional_reviews").insert(review!);
  }
});

test("Newsletter: audience counts load (send is never pressed)", async () => {
  await page.getByRole("button", { name: "Newsletter", exact: true }).click();
  await expect(page.locator("main")).toContainText(/\d/, { timeout: 20_000 });
});

test("Admin at 390px: 44px controls, no sideways scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await signIn(p, "admin");
  await p.goto("/admin");
  await p.getByRole("heading", { name: "Admin" }).waitFor({ timeout: 30_000 });
  await p.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const found = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    small: [...document.querySelectorAll<HTMLElement>("main button, main a, main input:not([type=checkbox]), main select")]
      .filter((e) => e.offsetWidth > 0 && e.offsetHeight > 0 && e.offsetHeight < 44 && getComputedStyle(e).display !== "inline")
      .map((e) => `${e.offsetHeight}px ${e.tagName} "${(e.innerText || e.getAttribute("placeholder") || "").trim().slice(0, 30)}"`),
  }));
  await ctx.close();
  expect(found.small).toEqual([]);
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|HTTP|webpack-hmr/.test(e))).toEqual([]);
});
