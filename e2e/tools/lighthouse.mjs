// Lighthouse (mobile, performance only) on a list of pages, optionally signed in
// as a TEST user. Run against a production build on the TEST database:
//
//   npm run build:testdb && npm run start:testdb      (port 3200)
//   node --env-file=.env.test.local e2e/tools/lighthouse.mjs http://localhost:3200 out.json [who] /page /page2 ...
//
// `who` is a TEST seed user (customer, basic, master, owner) or "-" for logged out.
// Signs in through the real login form in a Chrome profile, then runs
// Lighthouse in Chrome on that same profile, so pages load with the session.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [base, outFile, who, ...pages] = process.argv.slice(2);
if (!base || !outFile || !pages.length) throw new Error("usage: lighthouse.mjs <base> <out.json> <who|-> /page ...");
if (/lineup\.(app|ca|com)/.test(base)) throw new Error("Refusing to sign TEST users into the live site.");

const dir = mkdtempSync(join(tmpdir(), "lu-lh-"));
const CHROME = chromium.executablePath();
const signedIn = Boolean(who && who !== "-");
if (who && who !== "-") {
  const context = await chromium.launchPersistentContext(dir, { headless: true, executablePath: CHROME });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
  await page.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await context.close(); // flushes the profile, session included
}

const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
for (const path of pages) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const json = join(dir, `lh-${i}.json`);
    execFileSync("npx", ["-y", "lighthouse@12.2.1", base + path, `--chrome-flags=--headless=new --user-data-dir=${dir}`, "--only-categories=performance",
      // Signed in: keep the session (and so a warm cache, like a returning user).
      // Logged out: a cold cache every run, like a first visit.
      ...(signedIn ? ["--disable-storage-reset"] : []), "--quiet", "--output=json", `--output-path=${json}`], { stdio: "ignore", env: { ...process.env, CHROME_PATH: CHROME }, timeout: 180_000 });
    const r = JSON.parse(readFileSync(json, "utf8"));
    // LH_KEEP=<dir>: keep the last raw report per page, to see what the LCP waits on.
    if (process.env.LH_KEEP) writeFileSync(join(process.env.LH_KEEP, `${(who || "-")}${path.replace(/\W+/g, "_")}.json`), JSON.stringify(r));
    const a = r.audits;
    runs.push({
      score: Math.round(r.categories.performance.score * 100),
      lcp: a["largest-contentful-paint"].numericValue,
      cls: a["cumulative-layout-shift"].numericValue,
      tbt: a["total-blocking-time"].numericValue,
      kb: Math.round(a["total-byte-weight"].numericValue / 1024),
      finalUrl: r.finalDisplayedUrl ?? r.finalUrl,
    });
  }
  // Median by score
  runs.sort((x, y) => x.score - y.score);
  const m = runs[1];
  const key = `${who || "-"} ${path}`;
  results[key] = m;
  console.log(`${key}: score ${m.score}, LCP ${(m.lcp / 1000).toFixed(1)} s, CLS ${m.cls.toFixed(3)}, TBT ${Math.round(m.tbt)} ms, ${m.kb} KB${m.finalUrl.endsWith(path) ? "" : ` (ended at ${m.finalUrl})`}`);
}
writeFileSync(outFile, JSON.stringify(results, null, 2));
