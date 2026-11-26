// Dev helper: time public pages on a deployed build (read-only, logged out).
// node --env-file=.env.local e2e/tools/speed.mjs <baseUrl> [runs]
// Prints, per page: time to first heading, time until the network is quiet,
// Stripe requests made, and auth-lock console errors.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const [base, runs = "3"] = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pro } = await db.from("profiles").select("id").eq("role", "professional").eq("verification_status", "verified").limit(1).single();
const { data: shop } = await db.from("studios").select("slug").not("slug", "is", null).limit(1).single();
const pages = [`/profile/${pro.id}`, `/shop/${shop.slug}`, "/discover"];
const b = await chromium.launch();
for (const path of pages) {
  const rows = [];
  for (let i = 0; i < Number(runs); i++) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await ctx.newPage();
    let stripe = 0, lock = 0;
    p.on("request", (r) => /stripe\.(com|network)/.test(r.url()) && stripe++);
    p.on("console", (m) => /Lock .*(released|stole)|NavigatorLock/.test(m.text()) && lock++);
    const t0 = Date.now();
    await p.goto(base + path, { waitUntil: "domcontentloaded" });
    await p.locator("h1, h2").first().waitFor({ timeout: 30000 }).catch(() => {});
    const heading = Date.now() - t0;
    await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    rows.push({ heading, quiet: Date.now() - t0, stripe, lock });
    await ctx.close();
  }
  const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  console.log(`${path.replace(/[0-9a-f-]{36}/, "<pro>").replace(shop.slug, "<shop>")}  heading ${med("heading")}ms  quiet ${med("quiet")}ms  stripe reqs ${med("stripe")}  lock errors ${med("lock")}`);
}
await b.close();
