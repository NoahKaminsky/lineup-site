import { defineConfig, devices } from "@playwright/test";

// Browser checks. Only ever points at a local dev server (never production).
// Run: npm run test:smoke   (starts `npm run dev` itself if it isn't running)
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1, // dev server compiles pages on first hit; parallel runs just time out
  reporter: [["list"], ["json", { outputFile: "test-results/smoke.json" }]],
  use: { baseURL: "http://localhost:3000", trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
