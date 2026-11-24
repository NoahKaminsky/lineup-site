import { test, expect } from "@playwright/test";

/**
 * Customer and public checks that need no TEST data (logged out).
 * Run: npx playwright test e2e/customer.spec.ts
 */

test.describe("logged out", () => {
  for (const path of ["/requests/new", "/bookings/00000000-0000-0000-0000-000000000000", "/onboarding"]) {
    test(`${path} sends you to login and back`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login\?/, { timeout: 20_000 });
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }

  test("/discover logs no error when location is refused", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/discover");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(errors.filter((e) => /Geolocation|Location/.test(e))).toEqual([]);
  });

  test("/discover clear-search button is a 44px target", async ({ page }) => {
    await page.goto("/discover");
    await page.getByPlaceholder("Search a name, a service, an area").fill("test");
    const box = await page.getByRole("button", { name: "Clear search" }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });
});

test("landing hero downloads only the crop that fits the screen", async ({ page }, info) => {
  const studio: string[] = [];
  page.on("request", (r) => { const m = r.url().match(/studio-(wide|tall)\.webp/); if (m) studio.push(m[1]); });
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});
  const want = info.project.name === "phone-390" ? "tall" : "wide";
  expect([...new Set(studio)]).toEqual([want]);
});

test("gift thanks page without a purchase doesn't claim a payment", async ({ page }) => {
  await page.goto("/gift/thanks");
  await expect(page.getByText("We couldn't find a gift card purchase from this link.")).toBeVisible();
  await expect(page.getByText("Your payment went through.")).toHaveCount(0);
});

test("shops directory loads", async ({ page }) => {
  await page.goto("/shops");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("We couldn't load shops just now.")).toHaveCount(0);
});
