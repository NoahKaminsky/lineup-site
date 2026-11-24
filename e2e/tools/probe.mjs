// Dev helper: sign in as a TEST viewer and print a page's accessibility tree.
// node --env-file=.env.local --env-file=.env.test.local e2e/tools/probe.mjs <viewer|public> <path> [maxLines] [width]
import { chromium } from "@playwright/test";
const [viewer, path, max = "120", width = "1280"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(width), height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
if (viewer !== "public") {
  await p.goto("http://localhost:3000/login");
  await p.locator('input[type="email"]').fill(`lineup.test+${viewer}@example.com`);
  await p.locator('input[type="password"]').fill(process.env.TEST_SEED_PASSWORD);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
}
await p.goto(`http://localhost:3000${path}`);
await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
const snap = await p.locator("main").first().ariaSnapshot().catch(() => p.locator("body").ariaSnapshot());
console.log(p.url(), "\n" + snap.split("\n").slice(0, Number(max)).join("\n"));
if (errs.length) console.log("CONSOLE ERRORS:", errs);
await b.close();
