// Full-page screenshots of one page at 390 and 1280, logged out or as a TEST
// user, with any console errors. For checking a whole page by eye.
//   node --env-file=.env.test.local e2e/tools/fullshot.mjs http://localhost:3000 /shop/x <outdir> [who]
import { chromium } from "@playwright/test";
const [base, path, out, who] = process.argv.slice(2);
if (/lineup\.(app|ca|com)/.test(base) && who) throw new Error("Refusing to sign TEST users into the live site.");
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [1280, 900]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await c.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  if (who) {
    await p.goto(base + "/login");
    await p.locator('input[type="email"]').fill(`lineup.test+${who}@example.com`);
    await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const name = `${path.replace(/\W+/g, "_")}-${w}.png`;
  await p.screenshot({ path: `${out}/${name}`, fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, overflow > 1 ? `OVERFLOW ${overflow}` : "", errors.length ? `ERRORS ${errors.join(" | ")}` : "");
  await c.close();
}
await b.close();
