import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SMOKE_ROUTES, fillRoute, type Viewer } from "./routes";

/**
 * Smoke test: open every page as the right TEST user and fail if it errors,
 * comes up blank, or logs a console error. Needs the TEST seed
 * (scripts/test-data.mts) and TEST_SEED_PASSWORD. Read-only: it only opens pages.
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const IGNORE = [/Download the React DevTools/, /\[HMR\]/, /\[Fast Refresh\]/, /favicon/];

let ids: Record<string, string> = {};
const sessions = new Map<Viewer, string>(); // viewer -> storage state file

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: profs } = await db.from("profiles").select("id, email").like("email", "lineup.test+%@example.com");
  const who = (w: string) => profs?.find((p) => p.email === `lineup.test+${w}@example.com`)?.id ?? "";
  const customer = who("customer");
  const one = async (q: PromiseLike<{ data: { id: string; slug?: string } | null }>) => (await q).data;
  const shop = await one(db.from("studios").select("id, slug").eq("owner_id", who("owner")).maybeSingle());
  const open = await one(db.from("service_requests").select("id").eq("client_id", customer).eq("status", "open").maybeSingle());
  const conf = await one(db.from("bookings").select("id").eq("customer_id", customer).eq("status", "confirmed").eq("professional_id", who("basic")).maybeSingle());
  const comp = await one(db.from("bookings").select("id").eq("customer_id", customer).eq("status", "completed").eq("professional_id", who("master")).maybeSingle());
  const reg = await one(db.from("standing_appointments").select("id").eq("customer_id", customer).maybeSingle());
  ids = { masterId: who("master"), shopSlug: shop?.slug ?? "", openRequestId: open?.id ?? "", confirmedBookingId: conf?.id ?? "", completedBookingId: comp?.id ?? "", standingId: reg?.id ?? "" };
});

async function signIn(browser: Browser, viewer: Viewer, project: string) {
  if (viewer === "public") return undefined;
  const key = `${project}:${viewer}` as Viewer;
  if (sessions.has(key)) return sessions.get(key);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(`lineup.test+${viewer}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  const file = `test-results/.auth-${project}-${viewer}.json`;
  await ctx.storageState({ path: file });
  await ctx.close();
  sessions.set(key, file);
  return file;
}

async function visit(page: Page, path: string) {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !IGNORE.some((r) => r.test(m.text()))) problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => problems.push("slow: still loading after 15s"));
  const status = res?.status() ?? 0;
  const text = (await page.locator("body").innerText().catch(() => "")).trim();
  if (status >= 400) problems.push(`HTTP ${status}`);
  if (text.length < 40) problems.push(`blank: ${text.length} chars of text`);
  // In dev, <nextjs-portal> is always present (dev-tools badge); it flags a caught error with data-error="true".
  const nextError = await page.evaluate(() => !!document.querySelector("nextjs-portal")?.shadowRoot?.querySelector('[data-next-badge][data-error="true"], [data-nextjs-dialog]'));
  if (nextError) problems.push("Next.js error (dev overlay)");
  if (/Application error|Unhandled Runtime Error|Something went wrong/i.test(text)) problems.push("error text on page");
  return problems;
}

for (const r of SMOKE_ROUTES) {
  test(`${r.as.padEnd(8)} ${r.path}`, async ({ browser }, info) => {
    const path = fillRoute(r.path, ids);
    const state = await signIn(browser, r.as, info.project.name);
    const ctx = await browser.newContext({ ...info.project.use, storageState: state });
    const page = await ctx.newPage();
    const problems = await visit(page, path);
    if (r.expectPath) expect.soft(new URL(page.url()).pathname, "redirect").toMatch(new RegExp(`^${r.expectPath}`));
    await ctx.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
