import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame, fillCheckoutCard } from "./stripeCheckout";

/**
 * Boosts and the referral credit in Stripe test mode, against seeded TEST data:
 *  - the TEST Basic pro boosts their profile (one-time test-card payment)
 *  - the TEST owner features the TEST chair opening (paid to LineUp)
 *  - referral: the TEST Master pro starts a real test subscription, the Basic pro
 *    is marked as referred by Master, then buys Apprentice; Master gets a
 *    Stripe customer-balance credit and the reward is marked applied.
 * Needs `stripe listen` forwarding (STRIPE_FORWARDING=1) and test price ids.
 * Boost rows aren't tied to accounts, so this test deletes its own afterwards.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ids: Record<string, string> = {};

async function signIn(p: Page, who: string) {
  await p.goto("/login");
  await p.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}
async function payOnCheckout(p: Page, name: string) {
  await p.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(p, name);
  await (await checkoutFrame(p)).getByRole("button", { name: /^(Subscribe|Pay|Start)/ }).last().click();
  await p.waitForURL((u) => u.hostname === "localhost", { timeout: 90_000 });
}
const boostsFor = async (target: string) => (await db.from("boosts").select("id").eq("target_id", target)).data?.length ?? 0;

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  test.skip(process.env.STRIPE_FORWARDING !== "1", "needs `stripe listen` forwarding (STRIPE_FORWARDING=1)");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  for (const who of ["basic", "master", "owner"]) ids[who] = (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  const studio = (await db.from("studios").select("id").eq("owner_id", ids.owner).single()).data!;
  ids.chair = (await db.from("chair_openings").select("id").eq("studio_id", studio.id).eq("status", "open").limit(1).single()).data!.id;
});
test.afterAll(async () => {
  if (ids.basic) await db.from("boosts").delete().in("target_id", [ids.basic, ids.chair].filter(Boolean));
});

test("Basic pro boosts their profile with a test card", async ({ page }) => {
  const before = await boostsFor(ids.basic);
  await signIn(page, "basic");
  await page.goto("/subscription");
  await page.getByRole("button", { name: "Boost my profile" }).click();
  await payOnCheckout(page, "TEST Basic Pro");
  await expect.poll(() => boostsFor(ids.basic), { timeout: 60_000 }).toBe(before + 1);
});

test("owner features the TEST chair opening with a test card", async ({ page }) => {
  const before = await boostsFor(ids.chair);
  await signIn(page, "owner");
  await page.goto("/studio/chairs");
  await page.getByRole("button", { name: /^Feature for/ }).first().click();
  await payOnCheckout(page, "TEST Shop Owner");
  await expect.poll(() => boostsFor(ids.chair), { timeout: 60_000 }).toBe(before + 1);
});

test("referral: Master refers Basic; when Basic buys a plan, Master gets a credit", async ({ browser }) => {
  // Master needs a real (test) subscription for the credit to land on.
  await db.from("profiles").update({ subscription_plan: null, subscription_status: null, stripe_subscription_id: null }).eq("id", ids.master);
  const m = await browser.newPage();
  await signIn(m, "master");
  await m.goto("/subscription");
  await m.getByRole("button", { name: "Start 5-day free trial" }).click(); // Master: a trial counts as a live plan
  await payOnCheckout(m, "TEST Master Pro");
  await expect.poll(async () => (await db.from("profiles").select("subscription_status, stripe_customer_id").eq("id", ids.master).single()).data?.subscription_status, { timeout: 60_000 })
    .toMatch(/^(active|trialing)$/);
  await m.close();

  await db.from("profiles").update({ referred_by: ids.master }).eq("id", ids.basic);
  const b = await browser.newPage();
  await signIn(b, "basic");
  await b.goto("/subscription");
  const card = b.locator("xpath=//*[normalize-space(text())='Apprentice']/ancestor::*[count(.//button[normalize-space(.)='Subscribe'])=1][1]").first();
  await card.getByRole("button", { name: "Subscribe", exact: true }).click();
  await payOnCheckout(b, "TEST Basic Pro");
  await b.close();

  await expect.poll(async () => (await db.from("referral_rewards").select("status, amount_cents, stripe_balance_transaction_id").eq("referred_id", ids.basic).maybeSingle()).data?.status ?? null, { timeout: 60_000 })
    .toBe("applied");
  const { data: reward } = await db.from("referral_rewards").select("amount_cents, stripe_balance_transaction_id").eq("referred_id", ids.basic).single();
  expect(reward?.stripe_balance_transaction_id).toMatch(/^cbtxn_/);
  expect(reward?.amount_cents).toBeGreaterThan(0);
});
