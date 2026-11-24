import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame, fillCheckoutCard } from "./stripeCheckout";

/**
 * Memberships and billing portals in Stripe test mode, against seeded TEST data.
 * Needs: TEST_SHOP_STRIPE_ACCOUNT (a test payout account for the TEST shop, so
 * memberships can be sold), test price ids, and `stripe listen` forwarding
 * (STRIPE_FORWARDING=1). Test keys only. Subscriptions it makes are test-mode.
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

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  test.skip(process.env.STRIPE_FORWARDING !== "1", "needs `stripe listen` forwarding (STRIPE_FORWARDING=1)");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  for (const who of ["customer", "owner"]) ids[who] = (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  const shop = (await db.from("studios").select("id, slug, stripe_account_id").eq("owner_id", ids.owner).single()).data!;
  test.skip(!shop.stripe_account_id, "TEST shop has no test payout account (set TEST_SHOP_STRIPE_ACCOUNT and re-seed)");
  ids.studio = shop.id;
  ids.slug = shop.slug;
});

test("customer joins a shop membership with a test card; it turns on", async ({ page }) => {
  // The seed's membership has no Stripe subscription; pause it so the customer can join for real.
  await db.from("client_memberships").update({ status: "canceled" }).eq("customer_id", ids.customer).eq("studio_id", ids.studio);
  await signIn(page, "customer");
  await page.goto(`/shop/${ids.slug}`);
  await page.getByRole("button", { name: "Join", exact: true }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(page, "TEST Customer");
  await (await checkoutFrame(page)).getByRole("button", { name: /^(Subscribe|Pay|Start)/ }).last().click();
  await page.waitForURL(/localhost.*joined=1/, { timeout: 90_000 });
  await expect.poll(async () => {
    const { data } = await db.from("client_memberships").select("status, stripe_subscription_id").eq("customer_id", ids.customer).eq("studio_id", ids.studio).eq("status", "active");
    return (data || []).filter((m) => m.stripe_subscription_id).length;
  }, { timeout: 60_000 }).toBe(1);
});

test("member opens 'Manage card or cancel' and reaches Stripe's billing portal", async ({ page }) => {
  await signIn(page, "customer");
  await page.goto(`/shop/${ids.slug}`);
  await page.getByRole("button", { name: "Manage card or cancel" }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
  await expect(page.getByText(/TEST|LineUp/).first()).toBeVisible({ timeout: 30_000 });
});

test("Basic pro subscribes, then 'Manage billing' opens Stripe's billing portal", async ({ page }) => {
  await signIn(page, "basic");
  await page.goto("/subscription");
  const card = page.locator("xpath=//*[normalize-space(text())='Apprentice']/ancestor::*[count(.//button[normalize-space(.)='Subscribe'])=1][1]").first();
  await card.getByRole("button", { name: "Subscribe", exact: true }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(page, "TEST Basic Pro");
  await (await checkoutFrame(page)).getByRole("button", { name: /^(Subscribe|Pay|Start)/ }).last().click();
  await page.waitForURL((u) => u.hostname === "localhost", { timeout: 90_000 });
  await expect.poll(async () => (await db.from("profiles").select("subscription_status").eq("email", "lineup.test+basic@example.com").single()).data?.subscription_status, { timeout: 60_000 }).toBe("active");
  await page.goto("/subscription");
  await page.getByRole("button", { name: /Manage (billing|subscription)|Billing/ }).first().click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
});
