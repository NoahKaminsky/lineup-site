import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The TEST shop owner's main Studio actions, against seeded TEST data
 * (scripts/test-data.mts), plus every Studio section measured at 390px.
 *
 * Safety: only the TEST shop. A walk-in, a membership check-in and a tagline
 * change send nothing to anyone; `cleanup` deletes the TEST shop and its rows.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const SECTIONS = ["", "/calendar", "/requests", "/team", "/clients", "/import", "/memberships", "/chairs", "/analytics", "/earnings", "/settings"];
let page: Page;
let studioId = "";
const consoleErrors: string[] = [];

async function signIn(p: Page, who: string) {
  await p.goto("/login");
  await p.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

test.beforeAll(async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop", "runs once; the 390px check opens its own phone-size page");
  const { data: owner } = await db.from("profiles").select("id").eq("email", "lineup.test+owner@example.com").single();
  if (!owner) throw new Error("No TEST owner; run the seed first");
  const { data: studio } = await db.from("studios").select("id").eq("owner_id", owner.id).single();
  studioId = studio!.id;
  await db.from("shop_appointments").delete().eq("studio_id", studioId).eq("client_name", "TEST Walk-in Flow"); // earlier runs
  page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await signIn(page, "owner");
});
test.afterAll(async () => page?.close());

test("every Studio section at 390px: 44px controls, no sideways scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await signIn(phone, "owner");
  const problems: string[] = [];
  for (const s of SECTIONS) {
    await phone.goto(`/studio${s}`);
    await phone.locator("main h1, main h2").first().waitFor({ timeout: 30_000 });
    await phone.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const found = await phone.evaluate(() => {
      const small = [...document.querySelectorAll<HTMLElement>("main button, main a, main select, main input:not([type=checkbox]):not([type=radio]):not([type=file])")]
        .filter((e) => getComputedStyle(e).display !== "inline" && e.offsetWidth > 0 && e.offsetHeight > 0 && e.offsetHeight < 44)
        // Switches and small icons that carry a bigger invisible tap area (::before).
        .filter((e) => { const b = getComputedStyle(e, "::before"); return !(b.position === "absolute" && e.offsetHeight - 2 * parseFloat(b.top) >= 44); })
        // Calendar appointment blocks are sized by their length; heatmap cells are a chart.
        .filter((e) => !(e.classList.contains("absolute") && e.classList.contains("inset-x-1")) && !/booked|closed|^\d{1,2}(a|p)/.test(e.getAttribute("aria-label") || ""))
        .map((e) => `${e.offsetHeight}px ${e.tagName} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}"`);
      return { small, overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    if (found.overflow) problems.push(`/studio${s}: sideways scroll`);
    for (const x of found.small) problems.push(`/studio${s}: ${x}`);
  }
  await ctx.close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Front desk: a negative price is held back, 40 books a walk-in", async () => {
  await page.goto("/studio/calendar");
  await page.getByRole("button", { name: "New appointment" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.locator("#na-pro").selectOption({ index: 1 }).catch(() => {});
  await sheet.locator("#na-client").fill("TEST Walk-in Flow");
  const svc = sheet.getByPlaceholder("e.g. Skin fade");
  if (await svc.isVisible().catch(() => false)) await svc.fill("TEST Haircut");
  await sheet.locator("#na-price").fill("-5");
  await sheet.getByRole("button", { name: "Book it" }).click();
  // The browser's own check (min 0) holds the form back; nothing is booked.
  expect(await sheet.locator("#na-price").evaluate((e) => (e as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  const none = await db.from("shop_appointments").select("id").eq("studio_id", studioId).eq("client_name", "TEST Walk-in Flow");
  expect(none.data).toEqual([]);
  await sheet.locator("#na-price").fill("40");
  await sheet.getByRole("button", { name: "Book it" }).click();
  await expect.poll(async () => {
    const { data } = await db.from("shop_appointments").select("price_cents").eq("studio_id", studioId).eq("client_name", "TEST Walk-in Flow");
    return data?.[0]?.price_cents ?? null;
  }, { timeout: 15_000 }).toBe(4000);
});

test("Memberships: check a member in", async () => {
  const { data: ms } = await db.from("client_memberships").select("id").eq("studio_id", studioId);
  const mIds = (ms || []).map((m) => m.id);
  const visits = () => db.from("membership_visits").select("id", { count: "exact", head: true }).in("membership_id", mIds);
  const before = await visits();
  await page.goto("/studio/memberships");
  await page.getByRole("button", { name: "Check in" }).first().click();
  await expect.poll(async () => {
    const { count } = await visits();
    return count;
  }, { timeout: 15_000 }).toBe((before.count ?? 0) + 1);
});

test("Settings: owner changes the tagline", async () => {
  await page.goto("/studio/settings");
  await page.locator("#s-tagline").fill("TEST tagline from the flow test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => {
    const { data } = await db.from("studios").select("tagline").eq("id", studioId).single();
    return data?.tagline;
  }, { timeout: 15_000 }).toBe("TEST tagline from the flow test");
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|Stripe\.js|HTTP|webpack-hmr/.test(e))).toEqual([]);
});
