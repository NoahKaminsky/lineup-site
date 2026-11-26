import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame } from "./stripeCheckout";

/**
 * A TEST customer books at the TEST shop and pays at the shop: the card is
 * saved with Stripe's test card (a SetupIntent, nothing charged) and the
 * booking is made as pay-at-shop. Needs seeded TEST data and Stripe test keys.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ids: Record<string, string> = {};
const consoleErrors: string[] = [];
let page: Page;

test.beforeAll(async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  for (const who of ["customer", "owner"]) {
    ids[who] = (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  }
  const shop = (await db.from("studios").select("id, slug").eq("owner_id", ids.owner).single()).data!;
  ids.studio = shop.id;
  ids.slug = shop.slug;
  page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("lineup.test+customer@example.com");
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
});
test.afterAll(async () => page?.close());

const shopBookings = async () =>
  (await db.from("bookings").select("id, payment_status").eq("customer_id", ids.customer).eq("studio_id", ids.studio).order("created_at", { ascending: false })).data ?? [];

// "Hold your spot with a card": Stripe's card form (a SetupIntent), then "Save card and book".
async function saveTestCardAndBook(p: Page) {
  await expect(p.getByText("You won't be charged today.")).toBeVisible({ timeout: 60_000 });
  const frame = await checkoutFrame(p); // the Stripe frame holding the "Card" option
  const card = frame.getByRole("button", { name: "Card", exact: true });
  if (await card.count()) await card.click();
  await frame.locator('[name="number"]').fill("4242424242424242", { timeout: 60_000 });
  await frame.locator('[name="expiry"]').fill("12 / 34");
  await frame.locator('[name="cvc"]').fill("123");
  const country = frame.getByRole("combobox", { name: "Country", exact: true });
  if (await country.count()) await country.selectOption({ label: "Canada" });
  const postal = frame.getByRole("textbox", { name: /Postal code|ZIP/ });
  if (await postal.isVisible({ timeout: 5_000 }).catch(() => false)) await postal.fill("R3T 2N2");
  // The sheet scrolls inside its own overlay; scroll the button into view
  // there first (Playwright's own scroll doesn't reach it), as a person would.
  const btn = p.getByRole("button", { name: "Save card and book" });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  // "Card saved. Booking you in…" can be gone before we look; each test checks the booking in the database.
}

test("member books the soonest opening with their membership (card held, not charged)", async () => {
  const before = (await shopBookings()).length;
  await page.goto(`/shop/${ids.slug}`);
  await page.getByRole("button", { name: /with TEST/ }).first().click();
  await expect(page.getByRole("radio", { name: /^Membership/ })).toBeChecked();
  await page.getByRole("button", { name: "Book with membership" }).click();
  await saveTestCardAndBook(page);
  await expect.poll(async () => (await shopBookings()).length, { timeout: 60_000 }).toBe(before + 1);
  console.log("membership booking payment_status:", (await shopBookings())[0].payment_status);
});

test("without a membership: pay at the shop, card saved with a test card (not charged)", async () => {
  // Pause the TEST membership for this step (restored afterwards).
  const { data: m } = await db.from("client_memberships").select("id, status").eq("customer_id", ids.customer).eq("studio_id", ids.studio).single();
  await db.from("client_memberships").update({ status: "canceled" }).eq("id", m!.id);
  try {
    const before = (await shopBookings()).length;
    await page.goto(`/shop/${ids.slug}`);
    await page.getByRole("button", { name: /with TEST/ }).last().click(); // far from the slot the first test booked
    await page.getByRole("radio", { name: /^Pay at the shop/ }).click();
    await page.getByRole("button", { name: "Hold my spot" }).click();
    await saveTestCardAndBook(page);
    await expect.poll(async () => (await shopBookings()).length, { timeout: 60_000 }).toBe(before + 1);
    expect((await shopBookings())[0].payment_status).toBe("pay_at_shop");
  } finally {
    await db.from("client_memberships").update({ status: m!.status }).eq("id", m!.id);
  }
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|HTTP|webpack-hmr|Stripe\.js|stripe\.com/.test(e))).toEqual([]);
});
