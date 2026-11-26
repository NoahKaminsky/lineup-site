import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Email confirmation never leaves people guessing:
 * - a confirmation link that lands on the home page (Supabase's fallback when
 *   the return address isn't on its allowed list) finishes confirming and
 *   shows "Email confirmed";
 * - an expired or used link, in the query or after the #, says so on the
 *   login page with "Send a new link";
 * - signing in before confirming explains it, with the same button.
 * Uses a throwaway unconfirmed TEST user on the test database; it never
 * presses "Send a new link", so no email goes out.
 */
test.describe.configure({ timeout: 90_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test("an expired link on the home page goes to a clear message on the login page", async ({ page }) => {
  await page.goto("/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await page.waitForURL(/\/login\?link=expired/);
  await expect(page.getByText(/That link has expired or was already used/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send a new link" })).toBeVisible();
});

test("the same error after the # is caught too", async ({ page }) => {
  await page.goto("/#error=access_denied&error_code=otp_expired");
  await page.waitForURL(/\/login\?link=expired/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Send a new link" })).toBeVisible();
});

test("a confirmation code on the home page shows Email confirmed and the sign-in page", async ({ page }) => {
  // A code made in another browser can't be swapped for a session here, which
  // is exactly the "opened the email on my phone" case: confirmed, sign in.
  await page.goto("/?code=0123abcd-4567-89ef-0123-456789abcdef");
  await page.waitForURL(/\/login/);
  await expect(page.getByRole("dialog", { name: /Email confirmed/ })).toBeVisible({ timeout: 10_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sign in to keep going");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("signing in before confirming explains it and offers a new link", async ({ page }) => {
  const email = `lineup.test+unconfirmed${Date.now()}@example.com`;
  const password = `Test-${Date.now()}-pw`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: false });
  expect(error).toBeNull();
  try {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/Confirm your email first/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send a new link" })).toBeVisible();
  } finally {
    if (data?.user) await db.auth.admin.deleteUser(data.user.id);
  }
});
