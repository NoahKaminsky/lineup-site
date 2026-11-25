import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The TEST pros' main actions, end to end, against seeded TEST data
 * (scripts/test-data.mts). Desktop only; the 390px layout is covered by the smoke test.
 *
 * Safety: only TEST accounts (example.com, notifications off). The two past bookings
 * this adds have no Stripe ids, so marking a no-show can't charge anything and
 * completion can't move money. `cleanup` deletes them with the rest of the TEST data.
 * No offer is sent (that notifies the customer by email); only the price check runs.
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

async function signIn(who: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

const yesterday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

test.beforeAll(async ({ browser }) => {
  test.skip(test.info().project.name !== "desktop", "the flow runs once, on desktop");
  for (const who of ["customer", "basic", "master"]) ids[who] = await profileId(who);
  const { data: svc } = await db.from("professional_services").select("id").eq("professional_id", ids.basic).limit(1).single();
  const now = new Date().toISOString();
  const past = (notes: string, extra: Record<string, unknown>) => ({
    professional_id: ids.basic, customer_id: ids.customer, service_id: svc!.id, service_name: "TEST Haircut",
    duration_minutes: 45, service_price: 40, booking_date: yesterday(), start_time: "10:00", end_time: "10:45",
    service_mode: "in_shop", status: "confirmed", notes, source: "direct_booking", came_from: "discover",
    reminder_24h_sent_at: now, reminder_2h_sent_at: now, reminder_dayof_sent_at: now, completion_nudge_sent_at: now, rebook_nudge_sent_at: now,
    ...extra,
  });
  // Re-runs: drop this spec's own bookings from an earlier run first.
  const { data: prev } = await db.from("bookings").select("id").eq("professional_id", ids.basic).eq("booking_date", yesterday()).in("start_time", ["10:00", "12:00"]);
  const prevIds = (prev || []).map((b) => b.id);
  if (prevIds.length) await db.from("notifications").delete().in("booking_id", prevIds);
  const old = await db.from("bookings").delete().eq("professional_id", ids.basic).eq("booking_date", yesterday()).in("start_time", ["10:00", "12:00"]);
  if (old.error) throw new Error(`clear earlier run: ${old.error.message}`);
  const { data, error } = await db.from("bookings").insert([
    past("TEST to complete", {}),
    past("TEST no-show", { payment_status: "pay_at_shop", payout_status: "not_ready", start_time: "12:00", end_time: "12:45" }),
  ]).select("id, notes");
  if (error) throw new Error(error.message);
  ids.toComplete = data!.find((b) => b.notes === "TEST to complete")!.id;
  ids.noShow = data!.find((b) => b.notes === "TEST no-show")!.id;
  const { data: open } = await db.from("service_requests").select("id").eq("client_id", ids.customer).eq("status", "open").single();
  ids.openRequest = open!.id;
  await db.from("request_offers").update({ status: "pending" }).eq("professional_id", ids.basic).eq("request_id", ids.openRequest);

  page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
});
test.afterAll(async () => page?.close());

test("Basic pro withdraws a pending offer (two taps)", async () => {
  await signIn("basic");
  await page.goto("/work");
  await page.getByRole("tab", { name: /^Activity/ }).click();
  const withdraw = page.getByRole("button", { name: "Withdraw offer" }).first();
  await expect(withdraw).toBeVisible({ timeout: 20_000 });
  expect(await withdraw.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  await withdraw.click();
  await page.getByRole("button", { name: "Tap again to withdraw" }).click();
  await expect.poll(async () => {
    const { data } = await db.from("request_offers").select("status").eq("professional_id", ids.basic).eq("request_id", ids.openRequest).single();
    return data?.status;
  }, { timeout: 15_000 }).toBe("withdrawn");
});

test("Offer form refuses a price checkout can't charge", async () => {
  await page.goto(`/requests/${ids.openRequest}/respond`);
  const price = page.getByPlaceholder("$55");
  await expect(price).toBeVisible({ timeout: 20_000 });
  await price.fill("55-60");
  await page.locator("textarea").first().fill("TEST offer message");
  const before = await db.from("request_offers").select("id", { count: "exact", head: true }).eq("request_id", ids.openRequest);
  await page.getByRole("button", { name: /send offer/i }).click();
  await expect(page.getByText("Enter one price in dollars, like $55 or 55.50.")).toBeVisible();
  const after = await db.from("request_offers").select("id", { count: "exact", head: true }).eq("request_id", ids.openRequest);
  expect(after.count).toBe(before.count);
});

test("Basic pro marks a finished booking complete", async () => {
  await page.goto("/work");
  const card = page.getByRole("button", { name: "Mark complete" }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  expect(await card.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  const before = await page.getByRole("button", { name: "Mark complete" }).count();
  await card.click();
  await expect.poll(async () => {
    const { data } = await db.from("bookings").select("status").eq("id", ids.toComplete).single();
    return data?.status;
  }, { timeout: 15_000 }).toBe("completion_requested");
  await expect(page.getByRole("button", { name: "Working…" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(before - 1);
});

test("Pay-at-shop no-show closes the booking without charging", async () => {
  await page.goto(`/bookings/${ids.noShow}`);
  const btn = page.getByRole("button", { name: "They didn't show up" });
  await expect(btn).toBeVisible({ timeout: 20_000 });
  expect(await btn.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  page.once("dialog", (d) => d.accept());
  await btn.click();
  await expect.poll(async () => {
    const { data } = await db.from("bookings").select("no_show_status").eq("id", ids.noShow).single();
    return data?.no_show_status;
  }, { timeout: 15_000 }).toBeTruthy();
  // The page closes the booking once the request returns (so the next test doesn't abort it).
  await expect(page.getByRole("button", { name: /They didn't show up|Marking no-show/ })).toHaveCount(0, { timeout: 30_000 });
});

test("Master pro edits a review reply", async () => {
  await signIn("master");
  await page.goto(`/profile/${ids.master}`);
  // Wait until the reply editor is really open (a click before the page is
  // interactive does nothing), then fill that box, not any other on the page.
  const box = page.getByRole("textbox", { name: "Your reply" });
  await expect(async () => {
    await page.getByRole("button", { name: "Edit your reply" }).click();
    await expect(box).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await box.fill("TEST reply: thank you, see you next time.");
  await page.getByRole("button", { name: "Post reply" }).click();
  // Saved once the editor closes and the reply shows as text.
  await expect(page.getByRole("button", { name: "Edit your reply" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("TEST reply: thank you, see you next time.")).toBeVisible();
  const { data } = await db.from("professional_reviews").select("pro_reply").eq("professional_id", ids.master).single();
  expect(data?.pro_reply).toBe("TEST reply: thank you, see you next time.");
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|Stripe\.js|HTTP/.test(e))).toEqual([]);
});
