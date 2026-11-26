import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The shop profile, end to end, on the TEST shop (scripts/test-data.mts):
 * the owner edits the profile and adds and removes a photo in Studio >
 * Profile; it shows on the public page; the TEST customer reviews the shop
 * from a completed visit; the owner replies; the reply shows publicly.
 * Runs at 1280 and 390. Everything it writes belongs to the TEST shop and is
 * removed by `npm run testdb:cleanup`.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const shop: { id: string; slug: string; bookingId: string } = { id: "", slug: "", bookingId: "" };

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

const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

test.beforeAll(async () => {
  const { data: owner } = await db.from("profiles").select("id").eq("email", "lineup.test+owner@example.com").single();
  const { data: studio } = await db.from("studios").select("id, slug").eq("owner_id", owner!.id).single();
  const { data: customer } = await db.from("profiles").select("id").eq("email", "lineup.test+customer@example.com").single();
  const { data: booking } = await db.from("bookings").select("id").eq("studio_id", studio!.id).eq("customer_id", customer!.id).eq("status", "completed").limit(1).single();
  Object.assign(shop, { id: studio!.id, slug: studio!.slug, bookingId: booking!.id });
  // Start clean: no profile, photos or reviews from an earlier run.
  await db.from("studio_reviews").delete().eq("studio_id", shop.id);
  await db.from("studio_photos").delete().eq("studio_id", shop.id);
  await db.from("studios").update({ about: null, phone: null, instagram: null, website: null, hours: null, amenities: [], cover_url: null, logo_url: null }).eq("id", shop.id);
});

test("owner fills in the profile and adds a photo; the public page shows it", async ({ page, browser }, info) => {
  const errors = watchErrors(page);
  const tag = info.project.name;
  await signIn(page, "owner");
  await page.goto("/studio/profile");
  await expect(page.getByRole("heading", { name: "Shop profile" })).toBeVisible();
  await page.getByLabel("About the shop").fill(`TEST about the shop (${tag}). Sharp cuts and good chat.`);
  await page.getByLabel("Phone").fill("204-555-0123");
  await page.getByLabel("Instagram").fill("@lineup.test");
  await page.getByRole("button", { name: "Free Wi-Fi" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved. Your shop page is up to date.")).toBeVisible();

  // A photo, uploaded straight to storage with a signed link.
  await page.locator('input[type="file"][multiple]').setInputFiles("public/icon-512.png");
  await expect(page.getByRole("button", { name: "Remove this photo" })).toHaveCount(1, { timeout: 20_000 });
  await noSideways(page);

  // Logged out, the public page shows the profile.
  const visitor = await browser.newPage({ viewport: page.viewportSize()! });
  await visitor.goto(`/shop/${shop.slug}`);
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("TEST");
  await expect(visitor.getByText(`TEST about the shop (${tag})`)).toBeVisible();
  await expect(visitor.getByRole("link", { name: "204-555-0123" })).toBeVisible();
  await expect(visitor.getByText("Free Wi-Fi")).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Hours" })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Photos" })).toBeVisible();
  await visitor.getByRole("button", { name: /Open photo 1 of 1/ }).click();
  await expect(visitor.getByRole("dialog", { name: /photos/ })).toBeVisible();
  await visitor.keyboard.press("Escape");
  await expect(visitor.getByRole("dialog")).toBeHidden();
  await noSideways(visitor);
  await visitor.close();

  // Remove the photo again.
  await page.getByRole("button", { name: "Remove this photo" }).click();
  await expect(page.getByRole("button", { name: "Remove this photo" })).toHaveCount(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a client reviews the shop after a completed visit; the owner replies", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one review per visit: runs once, on desktop");
  const errors = watchErrors(page);
  await signIn(page, "customer");
  await page.goto(`/bookings/${shop.bookingId}`);
  const card = page.getByRole("region", { name: /How was TEST/ });
  await expect(card).toBeVisible();
  await card.getByRole("radio", { name: "5 stars" }).click();
  await card.getByLabel("Your review (optional)").fill("TEST review: lovely shop.");
  await card.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText(/You rated TEST/)).toBeVisible();

  // A second review of the same visit is refused by the server.
  const again = await page.evaluate(async (bookingId) => {
    const res = await fetch("/api/shop-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, rating: 1 }) });
    return res.status;
  }, shop.bookingId);
  expect([401, 403, 409]).toContain(again);
  // That refusal is logged by the browser as a failed request; it's expected.
  errors.splice(0, errors.length, ...errors.filter((e) => !/status of (401|403|409)/.test(e)));

  const owner = await browser.newPage();
  await signIn(owner, "owner");
  await owner.goto("/studio/profile");
  await owner.getByRole("button", { name: "Reply" }).first().click();
  await owner.getByLabel("Your reply").fill("TEST reply: thanks for coming in.");
  const [saved] = await Promise.all([
    owner.waitForResponse((r) => r.url().includes("/api/shop-reviews") && r.request().method() === "PATCH"),
    owner.getByRole("button", { name: "Post reply" }).click(),
  ]);
  expect(saved.status()).toBe(200);
  await expect(owner.getByText("Your reply:")).toBeVisible();
  await owner.close();

  const visitor = await browser.newPage();
  await visitor.goto(`/shop/${shop.slug}`);
  const reviews = visitor.getByRole("region", { name: "Reviews" }).or(visitor.locator("#reviews"));
  await expect(reviews.getByText("TEST review: lovely shop.")).toBeVisible();
  await expect(reviews.getByText("TEST C.")).toBeVisible();
  await expect(reviews.getByText("TEST reply: thanks for coming in.")).toBeVisible();
  await expect(visitor.locator("header").getByText("5.0")).toBeVisible();
  await visitor.close();
  expect(errors, errors.join("\n")).toEqual([]);
});
