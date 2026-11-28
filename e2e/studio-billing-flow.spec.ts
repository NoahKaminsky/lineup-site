import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { checkoutFrame, fillCheckoutCard } from "./stripeCheckout";

/**
 * Studio money flows in Stripe test mode, against seeded TEST data:
 *  - the TEST booth renter sets up weekly rent with a test card (paid to the
 *    TEST shop's test payout account, TEST_SHOP_STRIPE_ACCOUNT)
 *  - the TEST owner picks Studio Plus for the TEST shop with a test card
 * Needs `stripe listen` forwarding (STRIPE_FORWARDING=1) and test-mode Studio
 * price ids in the env. Test keys only. Subscriptions it makes are test-mode.
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

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  test.skip(process.env.STRIPE_FORWARDING !== "1", "needs `stripe listen` forwarding (STRIPE_FORWARDING=1)");
  expect(String(process.env.STRIPE_SECRET_KEY).startsWith("sk_test_"), "test keys only").toBe(true);
  for (const who of ["owner", "member2"]) ids[who] = (await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single()).data!.id;
  const shop = (await db.from("studios").select("id, stripe_account_id").eq("owner_id", ids.owner).single()).data!;
  test.skip(!shop.stripe_account_id, "TEST shop has no test payout account (set TEST_SHOP_STRIPE_ACCOUNT and re-seed)");
  ids.studio = shop.id;
});

test("booth renter sets up weekly rent with a test card", async ({ page }) => {
  await signIn(page, "member2");
  await page.goto("/studio/team");
  await page.getByRole("button", { name: "Set up rent payments" }).click();
  await payOnCheckout(page, "TEST Shop Member Two");
  await expect.poll(async () => (await db.from("studio_members").select("rent_subscription_id").eq("studio_id", ids.studio).eq("profile_id", ids.member2).single()).data?.rent_subscription_id ?? null, { timeout: 60_000 })
    .not.toBeNull();
});

test("owner picks Studio Plus for the shop with a test card", async ({ page }) => {
  // The seeded plan has no Stripe subscription; mark it lapsed so the owner chooses one for real.
  await db.from("studios").update({ subscription_status: "canceled", stripe_subscription_id: null }).eq("id", ids.studio);
  await signIn(page, "owner");
  await page.goto("/studio");
  // Under the shop's name: "No plan yet · Choose a plan" opens Plan and billing.
  await page.getByRole("link", { name: /Choose a plan/ }).first().click();
  await page.waitForURL(/\/studio\/billing/);
  await page.getByRole("button", { name: "Choose Studio Plus" }).click();
  await payOnCheckout(page, "TEST Shop Owner");
  await expect.poll(async () => {
    const { data } = await db.from("studios").select("plan, subscription_status, stripe_subscription_id").eq("id", ids.studio).single();
    return `${data?.plan}/${data?.subscription_status}/${data?.stripe_subscription_id ? "sub" : "none"}`;
  }, { timeout: 60_000 }).toBe("studio_plus/active/sub");
});
