// The landing hero on a slow phone and on desktop: does the title ever jump
// while the page loads (it must only slide up into place), when does the
// largest paint land, and does the scroll reveal still play? Saves
// screenshots before, during and after the reveal, and with reduced motion.
//
//   node e2e/tools/hero.mjs http://localhost:3200 <outdir>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let failed = false;

for (const [w, h, motion] of [[390, 844, "no-preference"], [1280, 900, "no-preference"], [390, 844, "reduce"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, reducedMotion: motion });
  await ctx.addInitScript(() => {
    window.__ys = [];
    window.__lcp = [];
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(".js-title-wrap");
      if (el) window.__ys.push([Math.round(performance.now() - t0), Math.round(el.getBoundingClientRect().top)]);
      if (performance.now() - t0 < 7000) setTimeout(tick, 100);
    };
    tick();
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push(`${Math.round(e.startTime)}ms ${e.element?.className?.split(" ")[0]}`))).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (w < 768) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 204800, uploadThroughput: 96000 });
  }
  const tag = `${w}-${motion}`;
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/hero-${tag}-a-early.png` });
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${out}/hero-${tag}-b-loaded.png` });

  // The wrap's top should only ever settle: after its first value it must not move (no scroll yet).
  const ys = await page.evaluate(() => window.__ys);
  const moves = ys.filter((p, i) => i && Math.abs(p[1] - ys[i - 1][1]) > 2);
  console.log(`${tag}: title top ${ys[0]?.[1]}px at ${ys[0]?.[0]}ms; moves while loading: ${moves.length ? JSON.stringify(moves.slice(0, 5)) : "none"}`);
  console.log(`${tag}: LCP ${(await page.evaluate(() => window.__lcp)).join(", ")}`);
  if (moves.length) failed = true;

  // Scroll through the reveal.
  for (const [i, frac] of [[1, 0.5], [2, 1.2], [3, 2.6]]) {
    await page.mouse.wheel(0, h * frac - (i > 1 ? h * [0, 0.5, 1.2][i - 1] : 0));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/hero-${tag}-c${i}-scroll.png` });
  }
  const shown = await page.evaluate(() => [...document.querySelectorAll(".js-veiled, .js-hero-follow")].map((e) => getComputedStyle(e).opacity));
  console.log(`${tag}: after scrolling, scene/follow opacity ${shown.join(",")}${errors.length ? ` ERRORS ${errors.join(" | ")}` : ""}`);
  if (errors.length) failed = true;
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
