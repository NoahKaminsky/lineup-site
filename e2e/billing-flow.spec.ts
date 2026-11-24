import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame, fillCheckoutCard } from "./stripeCheckout";

/**
 * A TEST pro subscribes to a plan through Stripe Checkout in test mode.
 * Needs: seeded TEST data, test-mode price ids in the env, and `stripe listen`
 * forwarding (the webhook turns the subscription into the pro's plan).
 * Only test keys: the test refuses to run against live ones.
 */
test.describe.configure({ timeout: 240_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("Basic pro subscribes to Apprentice with a test card; the plan switches on", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on desktop");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  test.skip(process.env.STRIPE_FORWARDING !== "1", "needs `stripe listen` forwarding (set STRIPE_FORWARDING=1)");

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("lineup.test+basic@example.com");
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });

  await page.goto("/subscription");
  const card = page.locator("xpath=//*[normalize-space(text())='Apprentice']/ancestor::*[count(.//button[normalize-space(.)='Subscribe'])=1][1]").first();
  await card.getByRole("button", { name: "Subscribe", exact: true }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCheckoutCard(page, "TEST Basic Pro");
  await (await checkoutFrame(page)).getByRole("button", { name: /^(Subscribe|Pay|Start trial)/ }).last().click();
  await page.waitForURL((u) => u.hostname === "localhost", { timeout: 90_000 });

  await expect.poll(async () => {
    const { data } = await db.from("profiles").select("subscription_plan, subscription_status").eq("email", "lineup.test+basic@example.com").single();
    return `${data?.subscription_plan}/${data?.subscription_status}`;
  }, { timeout: 60_000 }).toBe("apprentice/active");
});
