// Which elements move while a page loads (layout shifts), at phone size with a
// slowed CPU, optionally signed in as a TEST user. Use on a local or test build.
//
//   node --env-file=.env.test.local e2e/tools/cls.mjs http://localhost:3200 basic /requests /calendar
import { chromium } from "@playwright/test";

const [base, who, ...pages] = process.argv.slice(2);
if (/lineup\.(app|ca|com)/.test(base)) throw new Error("Refusing to sign TEST users into the live site.");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const nodes = (e.sources || []).map((s) => {
        const n = s.node;
        if (!n || !n.nodeType) return "?";
        const el = n.nodeType === 1 ? n : n.parentElement;
        const text = (el?.innerText || "").replace(/\s+/g, " ").slice(0, 50);
        return `${el?.tagName?.toLowerCase()}.${String(el?.className || "").split(" ").slice(0, 3).join(".")} "${text}"`;
      });
      window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), nodes });
    }
  }).observe({ type: "layout-shift", buffered: true });
  window.__lcp = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const el = e.element;
      window.__lcp.push(`${Math.round(e.startTime)}ms ${el?.tagName?.toLowerCase() || "?"}.${String(el?.className || "").split(" ").slice(0, 3).join(".")} "${(el?.innerText || e.url || "").replace(/\s+/g, " ").slice(0, 60)}"`);
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
});
const page = await context.newPage();
if (who && who !== "-") {
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
// Slow 4G, like Lighthouse mobile: 150 ms round trips, ~1.6 Mbps down.
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 204800, uploadThroughput: 96000 });
for (const path of pages) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const shifts = await page.evaluate(() => window.__shifts);
  const total = shifts.reduce((s, x) => s + x.v, 0);
  console.log(`\n${who} ${path}: CLS ${total.toFixed(3)}`);
  for (const s of shifts) if (s.v >= 0.005) console.log(`  ${s.t}ms +${s.v}  ${s.nodes.join(" | ")}`);
  console.log("  LCP candidates:\n    " + (await page.evaluate(() => window.__lcp)).join("\n    "));
}
await browser.close();
