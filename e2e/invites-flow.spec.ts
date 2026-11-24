import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Flows that send email, now safe because the mailer never sends to TEST
 * (example.com) addresses (app/lib/mailer.ts). Against seeded TEST data:
 *  - the TEST owner invites the TEST Basic pro; the email is skipped, so the
 *    Team page shows the link to share; the pro opens it and joins the shop
 *  - an admin rejects a TEST verification submission with a reason, then
 *    approves the pro from "without verification"
 * Only TEST rows are touched; `cleanup` removes them (profiles cascade).
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
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

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  for (const who of ["owner", "basic"]) {
    const { data } = await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single();
    if (!data) throw new Error(`No TEST ${who}; run the seed first`);
    ids[who] = data.id;
  }
  ids.studio = (await db.from("studios").select("id").eq("owner_id", ids.owner).single()).data!.id;
  // Re-runs: the Basic pro starts outside the shop.
  await db.from("studio_members").delete().eq("studio_id", ids.studio).eq("invited_email", "lineup.test+basic@example.com");
  await db.from("studio_members").delete().eq("studio_id", ids.studio).eq("profile_id", ids.basic);
});

test("owner invites a TEST pro; no email goes out, so the share link is shown; the pro joins", async ({ browser }) => {
  const owner = await as(browser, "owner");
  await owner.goto("/studio/team");
  await owner.getByRole("button", { name: "Invite a pro" }).first().click();
  await owner.locator("#invite-email").fill("lineup.test+basic@example.com");
  await owner.getByRole("button", { name: "Send invite" }).click();
  const notice = owner.getByText(/The email didn't send\. Share this link instead: /);
  await expect(notice).toBeVisible({ timeout: 20_000 });
  const link = (await notice.innerText()).match(/https?:\/\/\S+\/studio\/join\?token=\S+/)![0];
  await owner.close();

  const pro = await as(browser, "basic");
  await pro.goto(new URL(link).pathname + new URL(link).search);
  await pro.getByRole("button", { name: /^Join / }).click();
  await expect.poll(async () => {
    const { data } = await db.from("studio_members").select("status").eq("studio_id", ids.studio).eq("profile_id", ids.basic).maybeSingle();
    return data?.status;
  }, { timeout: 20_000 }).toBe("active");
  await pro.close();
});

test("admin rejects a TEST submission with a reason, then approves the pro", async ({ browser }) => {
  await db.from("profiles").update({ verification_status: "pending", verified_until: null }).eq("id", ids.basic);
  const { data: sub, error } = await db.from("professional_verifications")
    .insert({ professional_id: ids.basic, track: "licensed", profession_type: "barber", jurisdiction: "MB", license_number: "TEST-123", status: "pending" })
    .select("id").single();
  expect(error).toBeNull();

  const admin = await as(browser, "admin");
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Verification", exact: true }).click();
  const card = admin.locator("div, li").filter({ hasText: "TEST Basic Pro" }).filter({ has: admin.getByRole("button", { name: "Reject", exact: true }) }).last();
  await card.getByRole("button", { name: "Reject", exact: true }).click();
  // Only one reject form is open at a time (the card swaps its buttons for it).
  await admin.getByPlaceholder(/Reason/).fill("TEST: document is unreadable");
  await admin.getByRole("button", { name: "Confirm reject" }).click();
  await expect.poll(async () => (await db.from("professional_verifications").select("status, rejection_reason").eq("id", sub!.id).single()).data, { timeout: 20_000 })
    .toEqual({ status: "rejected", rejection_reason: "TEST: document is unreadable" });

  await admin.reload();
  await admin.getByRole("button", { name: "Verification", exact: true }).click();
  const row = admin.locator("div, li").filter({ hasText: "TEST Basic Pro" }).filter({ has: admin.getByRole("button", { name: "Approve", exact: true }) }).last();
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => (await db.from("profiles").select("verification_status").eq("id", ids.basic).single()).data?.verification_status, { timeout: 20_000 })
    .toBe("verified");
  await admin.close();
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|HTTP|webpack-hmr/.test(e))).toEqual([]);
});
