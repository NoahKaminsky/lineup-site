// Where a page's start-up time goes: records a CPU profile while the page
// loads at phone size with a 4× slower CPU, then lists the functions and
// script files that used the most main-thread time, and the long tasks.
// Use on a local production build (npm run build:testdb && npm run start:testdb).
//
//   node e2e/tools/trace.mjs http://localhost:3200 /profile/<id>
import { chromium } from "@playwright/test";

const [base, path] = process.argv.slice(2);
if (/lineup\.(app|ca|com)/.test(base)) throw new Error("Use a local build, not the live site.");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await page.goto(base + path, { waitUntil: "load" });
await page.waitForTimeout(3000);
const { profile } = await cdp.send("Profiler.stop");

// Self time per node = samples × interval.
const dt = new Map();
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0));
const byFn = new Map();
const byFile = new Map();
for (const n of profile.nodes) {
  const us = dt.get(n.id) || 0;
  if (!us) continue;
  const { functionName, url, lineNumber, columnNumber } = n.callFrame;
  const file = url ? url.replace(base, "").split("?")[0] : `(${functionName || "program"})`;
  const key = `${functionName || "(anonymous)"}  ${file}:${lineNumber + 1}:${columnNumber + 1}`;
  byFn.set(key, (byFn.get(key) || 0) + us);
  byFile.set(file, (byFile.get(file) || 0) + us);
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
console.log(`\n${path} at 4× CPU — busiest files:\n` + top(byFile, 12).join("\n"));
console.log(`\nbusiest functions (self time):\n` + top(byFn, 25).join("\n"));
console.log(`\nlong tasks [start ms, duration ms]: ${JSON.stringify(await page.evaluate(() => window.__long))}`);
await browser.close();
