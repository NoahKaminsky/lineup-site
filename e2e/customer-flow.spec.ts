import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame, fillCheckoutCard } from "./stripeCheckout";

/**
 * The TEST customer's main path, end to end, against seeded TEST data
 * (scripts/test-data.mts). Desktop only; the 390px layout is covered by the smoke test.
 *
 * Safety: the request is a DIRECT request to the TEST Master pro (?rebook=1&pro=),
 * so no real pro is notified. The pro's offer is inserted with the service role
 * instead of through the offer form, so no email goes out.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const ids: Record<string, string> = {};
let page: Page;
const consoleErrors: string[] = [];

async function profileId(who: string) {
  const { data } = await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single();
  if (!data) throw new Error(`No TEST ${who}; run the seed first`);
  return data.id as string;
}

test.beforeAll(async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop", "the flow runs once, on desktop");
  ids.customer = await profileId("customer");
  ids.master = await profileId("master");
  page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && page.url().startsWith("http://localhost") && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("lineup.test+customer@example.com");
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
});
test.afterAll(async () => page?.close());
// Every step must leave the console clean.
test.afterEach(async () => {
  const errors = consoleErrors.splice(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("post a direct request (photos preview, bad file reported, then removed)", async () => {
  await page.goto(`/requests/new?rebook=1&pro=${ids.master}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Request TEST Master Pro");
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await page.getByRole("button", { name: /^Their shop/ }).click();
  await page.getByPlaceholder("Neighbourhood or city, e.g. Osborne Village").fill("Winnipeg");
  await page.getByRole("button", { name: /Winnipeg/ }).first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Anytime", exact: true }).click();
  await page.getByRole("button", { name: /^Add details/ }).click();

  // A real 1x1 PNG plus a file that only claims to be HEIC.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "ok.png", mimeType: "image/png", buffer: png },
    { name: "broken.heic", mimeType: "", buffer: Buffer.from("not an image") },
  ]);
  await expect(page.getByText("One photo couldn't be read.")).toBeVisible({ timeout: 30_000 });
  const remove = page.getByRole("button", { name: "Remove" });
  await expect(remove).toHaveCount(1);
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await remove.click(); // keep TEST uploads out of storage
  await expect(remove).toHaveCount(0);

  await page.getByRole("button", { name: /^(Post request|Send direct request)$/ }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}/, { timeout: 30_000 });
  ids.request = page.url().match(/requests\/([0-9a-f-]{36})/)![1];
  const { data } = await db.from("service_requests").select("client_id, preferred_professional_id, status").eq("id", ids.request).single();
  expect(data).toMatchObject({ client_id: ids.customer, preferred_professional_id: ids.master, status: "open" });
});

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function fillStripeCard(p: Page) {
  const frame = p.frameLocator('iframe[title*="Secure payment input"]').first();
  const card = frame.getByRole("button", { name: "Card" });
  await card.click({ timeout: 60_000 });
  await frame.locator('[name="number"]').fill("4242424242424242", { timeout: 60_000 });
  await frame.locator('[name="expiry"]').fill("12 / 34");
  await frame.locator('[name="cvc"]').fill("123");
  const country = frame.locator("#payment-countryInput");
  if (await country.count()) await country.selectOption({ label: "Canada" });
  const postal = frame.locator('[name="postalCode"]');
  if (await postal.count()) await postal.fill("R3T 2N2");
}

test("compare offers, accept one and pay with a Stripe test card", async () => {
  // The pro's offer goes in directly (no offer email).
  const { error } = await db.from("request_offers").insert({
    request_id: ids.request, professional_id: ids.master, message: "TEST offer from the flow test", proposed_price: "$40",
    status: "pending", proposed_date: day(14), proposed_start_time: "11:00", proposed_end_time: "11:45", proposed_service_mode: "in_shop",
  });
  expect(error).toBeNull();
  await page.goto(`/requests/${ids.request}`);
  await expect(page.getByText("TEST offer from the flow test")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Accept offer" }).first().click();
  // The sheet's heading must be on top (not hidden under the sticky navbar).
  const heading = page.getByRole("dialog").getByRole("heading", { name: "Confirm your booking" });
  await heading.scrollIntoViewIfNeeded();
  const hb = (await heading.boundingBox())!;
  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'), [hb.x + 10, hb.y + hb.height / 2]);
  expect(onTop, "payment sheet heading is covered").toBe(true);
  await page.getByRole("button", { name: "No tip" }).click();
  await fillStripeCard(page);
  const payBtn = page.getByRole("dialog").getByRole("button", { name: /^Pay \$/ });
  await payBtn.scrollIntoViewIfNeeded();
  await payBtn.click();
  if (process.env.STRIPE_FORWARDING === "1") {
    // With `stripe listen` forwarding, the webhook turns the payment into a booking.
    await expect
      .poll(async () => (await db.from("bookings").select("id").eq("request_id", ids.request)).data?.length ?? 0, { timeout: 90_000 })
      .toBeGreaterThan(0);
  } else {
    // No forwarding: check the payment itself went through in Stripe test mode (read-only).
    const key = process.env.STRIPE_SECRET_KEY || "";
    expect(key.startsWith("sk_test_"), "only ever against Stripe test mode").toBe(true);
    const q = encodeURIComponent(`metadata['request_id']:'${ids.request}' AND status:'succeeded'`);
    await expect
      .poll(async () => {
        const r = await fetch(`https://api.stripe.com/v1/payment_intents/search?query=${q}`, { headers: { Authorization: `Bearer ${key}` } });
        return ((await r.json()) as { data?: unknown[] }).data?.length ?? 0;
      }, { timeout: 120_000, intervals: [5_000] })
      .toBeGreaterThan(0);
  }
});

test("chat on a booking", async () => {
  const { data } = await db.from("bookings").select("id").eq("customer_id", ids.customer).eq("status", "confirmed").is("studio_id", null).limit(1).single();
  await page.goto(`/bookings/${data!.id}`);
  const box = page.getByPlaceholder("Write a message");
  await box.fill("TEST hello from the flow test");
  await box.press("Enter");
  await expect(page.getByText("TEST hello from the flow test")).toBeVisible({ timeout: 20_000 });
});

test("leave a review on a completed booking", async () => {
  const shopPro = await profileId("member1");
  const { data } = await db.from("bookings").select("id").eq("customer_id", ids.customer).eq("professional_id", shopPro).eq("status", "completed").single();
  await page.goto(`/bookings/${data!.id}?review=1&rating=5`);
  await page.getByPlaceholder("Share details about your experience (optional)").fill("TEST review from the flow test");
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Thanks for your review.")).toBeVisible({ timeout: 20_000 });
  const { count } = await db.from("professional_reviews").select("id", { count: "exact", head: true }).eq("booking_id", data!.id);
  expect(count).toBe(1);
});

test("save a pro with the heart", async () => {
  await page.goto(`/profile/${ids.master}`);
  const heart = page.getByRole("button", { name: /^Save(d)? TEST Master Pro$/ }).first();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  // The heart fills straight away; the save lands a moment later.
  await expect.poll(async () => (await db.from("saved_pros").select("client_id", { count: "exact", head: true }).eq("client_id", ids.customer).eq("professional_id", ids.master)).count, { timeout: 15_000 }).toBe(1);
});

test("refer page sends a customer to their requests", async () => {
  await page.goto("/refer");
  await page.waitForURL(/\/requests$/, { timeout: 30_000 });
});

test("buy a shop gift card in Stripe test mode", async () => {
  const owner = await profileId("owner");
  const { data: shop } = await db.from("studios").select("slug").eq("owner_id", owner).single();
  await page.goto(`/gift/shop/${shop!.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("TEST Studio Plus Shop");
  // Selling needs a Stripe Connect account that can take transfers. Until the
  // TEST shop has an enabled test-mode account, check the "not yet" state and stop.
  if (await page.getByText("isn't selling gift cards yet").isVisible()) {
    test.skip(true, "TEST shop has no enabled Stripe test payout account (needs the Connect platform profile set up)");
  }
  await page.getByRole("button", { name: "$50", exact: true }).click();
  await page.getByRole("textbox", { name: "Their name" }).fill("TEST Recipient");
  await page.getByRole("textbox", { name: "Their email" }).fill("lineup.test+recipient@example.com");
  const buyer = page.getByRole("textbox", { name: "Your name" });
  if (!(await buyer.inputValue())) await buyer.fill("TEST Customer");
  await page.getByRole("button", { name: "Pay $50" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(page, "TEST Customer");
  await (await checkoutFrame(page)).getByRole("button", { name: /^Pay/ }).last().click();
  await page.waitForURL(/\/gift\/thanks/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Thank you. It's on its way." })).toBeVisible({ timeout: 40_000 });
});

test("buy a pro's gift card in Stripe test mode (needs the TEST Basic pro's test payout account)", async () => {
  const basic = await profileId("basic");
  const { data: pro } = await db.from("profiles").select("stripe_charges_enabled").eq("id", basic).single();
  test.skip(!pro?.stripe_charges_enabled, "TEST Basic pro has no test payout account that can take charges (run payout onboarding first)");
  await page.goto(`/gift/pro/${basic}`);
  await page.getByRole("button", { name: "$50", exact: true }).click();
  await page.getByRole("textbox", { name: "Their name" }).fill("TEST Recipient");
  await page.getByRole("textbox", { name: "Their email" }).fill("lineup.test+recipient@example.com");
  const buyer = page.getByRole("textbox", { name: "Your name" });
  if (!(await buyer.inputValue())) await buyer.fill("TEST Customer");
  await page.getByRole("button", { name: "Pay $50" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(page, "TEST Customer");
  await checkoutFrame(page).then((f) => f.getByRole("button", { name: /^(Pay|Subscribe)/ }).last().click());
  await page.waitForURL(/\/gift\/thanks/, { timeout: 90_000 });
  // Emailed to the recipient, so the page confirms rather than showing the code;
  // it updates itself once the card is switched on.
  await expect(page.getByRole("heading", { name: "Thank you. It's on its way." })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/We've emailed the \$50(\.00)? gift card to TEST Recipient/)).toBeVisible();
});

test("regular: 'Confirm and pay' opens the payment sheet and Stripe's card form loads (not paid)", async () => {
  const { data } = await db.from("standing_appointments").select("id").eq("customer_id", ids.customer).limit(1).single();
  let stripeLoads = 0;
  page.on("request", (r) => /js\.stripe\.com\/v3/.test(r.url()) && stripeLoads++);
  await page.goto(`/regular/${data!.id}`);
  await page.getByRole("button", { name: /^Confirm and pay/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "No tip" }).click();
  const frame = page.frameLocator('iframe[title*="Secure payment input"]').first();
  await expect(frame.getByRole("button", { name: "Card" })).toBeVisible({ timeout: 60_000 });
  expect(stripeLoads).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
});
