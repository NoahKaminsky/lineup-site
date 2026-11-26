import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Remaining everyday flows, against seeded TEST data (scripts/test-data.mts):
 *  customer edits then cancels their open request, and cancels a booking
 *  (no card payment on TEST bookings, so no refund runs); the shop owner
 *  changes a member's cut and role and puts them back; the owner takes $20
 *  off the seeded TEST shop gift card. Emails go only to example.com
 *  addresses, which the mailer skips. Desktop only; layouts are in the smoke.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ids: Record<string, string> = {};
const consoleErrors: string[] = [];

async function as(browser: Browser, who: string): Promise<Page> {
  const p = await browser.newPage();
  p.on("console", (m) => m.type() === "error" && consoleErrors.push(`${who}: ${m.text().slice(0, 300)}`));
  p.on("pageerror", (e) => consoleErrors.push(`${who} pageerror: ${e.message.slice(0, 300)}`));
  await p.goto("/login");
  await p.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  return p;
}
const height = (p: Page, name: string) => p.getByRole("button", { name, exact: true }).first().evaluate((e) => (e as HTMLElement).offsetHeight);

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  for (const who of ["customer", "basic", "owner", "member1"]) {
    const { data } = await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single();
    if (!data) throw new Error(`No TEST ${who}; run the seed first`);
    ids[who] = data.id;
  }
  ids.request = (await db.from("service_requests").select("id").eq("client_id", ids.customer).eq("status", "open").limit(1).single()).data!.id;
  ids.booking = (await db.from("bookings").select("id").eq("customer_id", ids.customer).eq("professional_id", ids.basic).eq("status", "confirmed").limit(1).single()).data!.id;
  ids.studio = (await db.from("studios").select("id").eq("owner_id", ids.owner).single()).data!.id;
  const card = (await db.from("gift_cards").select("code").eq("studio_id", ids.studio).eq("status", "active").limit(1).single()).data!;
  ids.giftCode = card.code;
  ids.requestTitle = (await db.from("service_requests").select("title").eq("id", ids.request).single()).data!.title;
});

// Put back what these tests change, so other specs find the seed as it was.
test.afterAll(async () => {
  if (!ids.request) return;
  await db.from("service_requests").update({ status: "open", title: ids.requestTitle, cancelled_at: null }).eq("id", ids.request);
  await db.from("bookings").update({ status: "confirmed", cancelled_by: null, cancelled_at: null }).eq("id", ids.booking);
  await db.from("gift_cards").update({ balance_cents: 5000 }).eq("code", ids.giftCode);
});

test("customer edits their open request", async ({ browser }) => {
  const p = await as(browser, "customer");
  await p.goto(`/requests/${ids.request}`);
  await p.getByRole("button", { name: "Edit request", exact: true }).waitFor({ timeout: 30_000 });
  expect(await height(p, "Edit request")).toBeGreaterThanOrEqual(44);
  expect(await height(p, "Cancel request")).toBeGreaterThanOrEqual(44);
  await p.getByRole("button", { name: "Edit request", exact: true }).click();
  await p.locator("#edit-title").fill("TEST request (edited)");
  await p.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await db.from("service_requests").select("title").eq("id", ids.request).single()).data?.title, { timeout: 15_000 })
    .toBe("TEST request (edited)");
  await p.close();
});

test("customer cancels a booking more than a day out (nothing to refund)", async ({ browser }) => {
  const p = await as(browser, "customer");
  await p.goto(`/bookings/${ids.booking}`);
  await p.getByRole("button", { name: "Cancel booking", exact: true }).waitFor({ timeout: 30_000 });
  expect(await height(p, "Cancel booking")).toBeGreaterThanOrEqual(44);
  await p.getByRole("button", { name: "Cancel booking", exact: true }).click();
  expect(await height(p, "Keep it")).toBeGreaterThanOrEqual(44);
  await p.getByRole("button", { name: "Yes, cancel", exact: true }).click();
  await expect.poll(async () => (await db.from("bookings").select("status, cancelled_by").eq("id", ids.booking).single()).data, { timeout: 15_000 })
    .toEqual({ status: "cancelled", cancelled_by: ids.customer });
  await p.close();
});

test("customer cancels their open request", async ({ browser }) => {
  const p = await as(browser, "customer");
  await p.goto(`/requests/${ids.request}`);
  await p.getByRole("button", { name: "Cancel request", exact: true }).click();
  await p.getByRole("button", { name: "Yes, cancel", exact: true }).click();
  await expect.poll(async () => (await db.from("service_requests").select("status").eq("id", ids.request).single()).data?.status, { timeout: 15_000 })
    .toBe("cancelled");
  await p.close();
});

test("owner changes a member's cut and role, then puts them back", async ({ browser }) => {
  const member = async () => (await db.from("studio_members").select("role, commission_percent").eq("studio_id", ids.studio).eq("profile_id", ids.member1).single()).data;
  const before = await member();
  const p = await as(browser, "owner");
  const open = async () => {
    await p.goto("/studio/team");
    await p.getByRole("button", { name: /TEST Shop Member One/ }).first().click();
    await p.getByRole("dialog").waitFor();
  };
  await open();
  await p.locator("#member-cut").fill("45");
  await p.getByRole("dialog").getByRole("radio", { name: "Manager" }).click();
  await p.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(member, { timeout: 15_000 }).toEqual({ role: "manager", commission_percent: 45 });
  await open();
  await p.locator("#member-cut").fill(String(before!.commission_percent));
  await p.getByRole("dialog").getByRole("radio", { name: "Member" }).click();
  await p.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(member, { timeout: 15_000 }).toEqual(before);
  await p.close();
});

test("owner takes $20 off the TEST shop gift card", async ({ browser }) => {
  const p = await as(browser, "owner");
  await p.goto("/gift-cards");
  await p.getByLabel("Gift card code").fill(ids.giftCode);
  await p.getByRole("button", { name: "Look up" }).click();
  await p.getByText("$50.00 left").waitFor({ timeout: 20_000 });
  await p.getByRole("textbox", { name: "Amount to take off" }).fill("20");
  await p.getByRole("button", { name: "Take it off" }).click();
  await expect(p.getByText("$30.00 left")).toBeVisible({ timeout: 15_000 });
  const { data } = await db.from("gift_cards").select("balance_cents").eq("code", ids.giftCode).single();
  expect(data?.balance_cents).toBe(3000);
  await p.close();
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|HTTP|webpack-hmr|Stripe\.js/.test(e))).toEqual([]);
});
