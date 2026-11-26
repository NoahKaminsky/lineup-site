// Full-page screenshots at 390 and 1280 as each TEST user, for checking by eye.
//   node --env-file=.env.test.local e2e/tools/shots.mjs http://localhost:3200 <outdir> who:/a,/b who2:/c ...
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [base, out, ...specs] = process.argv.slice(2);
if (/lineup\.(app|ca|com)/.test(base)) throw new Error("Refusing to sign TEST users into the live site.");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const spec of specs) {
  const [who, list] = spec.split(":");
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    if (who !== "-") {
      await page.goto(`${base}/login`);
      await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
      await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    }
    for (const path of list.split(",")) {
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      const name = `${who}${path.replace(/\W+/g, "_")}-${w}.png`;
      await page.screenshot({ path: `${out}/${name}`, fullPage: false });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${name}${overflow > 1 ? ` OVERFLOW ${overflow}px` : ""}${errors.length ? ` ERRORS: ${errors.splice(0).join(" | ")}` : ""}`);
    }
    await ctx.close();
  }
}
await browser.close();
