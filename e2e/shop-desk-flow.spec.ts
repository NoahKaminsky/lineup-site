import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Shop front desk and request passing, against seeded TEST data
 * (scripts/test-data.mts). The test adds two TEST phone bookings for
 * yesterday at the TEST shop (deleted with the shop by `cleanup`), then the
 * owner marks one done and the other a no-show from the shop calendar.
 * A manager passes the seeded TEST open request to a TEST member; the row is
 * found by its exact TEST title, so a real customer's request is never touched.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ids: Record<string, string> = {};
const consoleErrors: string[] = [];
const DONE = "TEST Done Client";
const NOSHOW = "TEST NoShow Client";

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

// Yesterday in the shop's time zone (Winnipeg), as YYYY-MM-DD.
const yesterday = () => new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
const appt = async (name: string) => (await db.from("shop_appointments").select("status, paid_with, price_cents").eq("studio_id", ids.studio).eq("client_name", name).single()).data;

test.beforeAll(async () => {
  test.skip(test.info().project.name !== "desktop", "runs once, on desktop");
  for (const who of ["owner", "member2", "member1", "customer"]) {
    const { data } = await db.from("profiles").select("id").eq("email", `lineup.test+${who}@example.com`).single();
    if (!data) throw new Error(`No TEST ${who}; run the seed first`);
    ids[who] = data.id;
  }
  ids.studio = (await db.from("studios").select("id").eq("owner_id", ids.owner).single()).data!.id;
  const day = yesterday();
  await db.from("shop_appointments").delete().eq("studio_id", ids.studio).in("client_name", [DONE, NOSHOW]); // earlier runs
  const base = { studio_id: ids.studio, professional_id: ids.member2, created_by: ids.owner, kind: "phone", service_name: "TEST Haircut", appointment_date: day, price_cents: 4000, status: "booked" };
  const { error } = await db.from("shop_appointments").insert([
    { ...base, client_name: DONE, start_time: "10:00", end_time: "10:45" },
    { ...base, client_name: NOSHOW, start_time: "13:00", end_time: "13:45" },
  ]);
  expect(error).toBeNull();
  const { data: req } = await db.from("service_requests").select("id, title").eq("client_id", ids.customer).eq("status", "open").limit(1).single();
  ids.request = req!.id;
  ids.requestTitle = req!.title;
  await db.from("studio_request_passes").delete().eq("studio_id", ids.studio).eq("request_id", ids.request); // earlier runs
});

async function openYesterday(p: Page) {
  await p.goto("/studio/calendar");
  await p.getByRole("button", { name: "Previous day" }).click();
}

test("owner marks yesterday's phone booking done, paid by card", async ({ browser }) => {
  const p = await as(browser, "owner");
  await openYesterday(p);
  await p.getByRole("button", { name: new RegExp(`with ${DONE}$`) }).click();
  await p.getByRole("button", { name: "Mark done", exact: true }).click();
  // Tapping "Mark done" only opens the checkout step; it must not save yet
  // (it used to submit straight away as cash).
  await expect(p.getByRole("button", { name: "Save, mark done" })).toBeEnabled();
  expect((await appt(DONE))?.status).toBe("booked");
  await p.getByRole("radio", { name: "Card", exact: true }).click();
  await p.getByRole("button", { name: "Save, mark done" }).click();
  await expect.poll(() => appt(DONE), { timeout: 15_000 }).toMatchObject({ status: "completed", paid_with: "card" });
  await p.close();
});

test("owner marks the other one a no-show", async ({ browser }) => {
  const p = await as(browser, "owner");
  await openYesterday(p);
  await p.getByRole("button", { name: new RegExp(`with ${NOSHOW}$`) }).click();
  await p.getByRole("button", { name: "More actions" }).click();
  await p.getByRole("menuitem", { name: "Mark as no-show" }).click();
  await expect.poll(async () => (await appt(NOSHOW))?.status, { timeout: 15_000 }).toBe("no_show");
  await p.close();
});

test("manager passes the TEST request to a TEST member", async ({ browser }) => {
  const p = await as(browser, "manager");
  await p.goto("/studio/requests");
  // The row for the TEST request only: the closest element around its title holding one "Pass to" control.
  const row = p.locator(`xpath=//*[normalize-space(text())=${JSON.stringify(ids.requestTitle)}]/ancestor::*[count(.//button[starts-with(normalize-space(.), 'Pass to')])=1][1]`).first();
  await row.waitFor({ timeout: 30_000 });
  const pass = row.getByRole("button", { name: /^Pass to/ });
  if ((await pass.innerText()).trim() === "Pass to…") {
    await pass.click();
    await p.getByRole("menuitem", { name: "TEST Shop Member One" }).click();
  } else {
    expect(await pass.innerText()).toContain("TEST");
    await pass.click();
  }
  await expect.poll(async () => (await db.from("studio_request_passes").select("id").eq("studio_id", ids.studio).eq("request_id", ids.request)).data?.length ?? 0, { timeout: 15_000 })
    .toBe(1);
  await p.close();
});

test("the pro it was passed to sees it first, marked, with a note and a notification", async ({ browser }) => {
  const { data: pass } = await db.from("studio_request_passes").select("professional_id").eq("studio_id", ids.studio).eq("request_id", ids.request).single();
  const who = Object.entries(ids).find(([, id]) => id === pass!.professional_id)?.[0] || "member1";
  // The server saves the pass, then the notification: wait for it.
  await expect
    .poll(
      async () =>
        (await db.from("notifications").select("title").eq("user_id", pass!.professional_id).eq("request_id", ids.request).eq("type", "request_passed").limit(1)).data?.[0]?.title ?? "",
      { timeout: 15_000 }
    )
    .toMatch(/passed you a request/);

  const p = await as(browser, who);
  await p.goto("/requests");
  const card = p.getByRole("link", { name: new RegExp(ids.requestTitle) }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(/^Passed by /)).toBeVisible();
  await card.click();
  await expect(p.getByText(/passed this to you$/)).toBeVisible({ timeout: 15_000 });
  await p.close();
});

test("no console errors along the way", async () => {
  expect(consoleErrors.filter((e) => !/Lock .* (was not released|stole it)|Lock broken|React DevTools|HTTP|webpack-hmr/.test(e))).toEqual([]);
});
