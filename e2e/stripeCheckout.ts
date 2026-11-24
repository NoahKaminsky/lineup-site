import type { Page } from "@playwright/test";

// Stripe Checkout (hosted) now renders its form inside a frame, with Card
// collapsed behind a button. Find that frame, open Card and use Stripe's test card.
export async function checkoutFrame(p: Page) {
  for (let i = 0; i < 60; i++) {
    for (const f of [p.mainFrame(), ...p.frames()]) {
      if (await f.getByRole("button", { name: "Card", exact: true }).count().catch(() => 0)) return f;
      if (await f.locator("#cardNumber").count().catch(() => 0)) return f;
    }
    await p.waitForTimeout(1000);
  }
  throw new Error("Stripe Checkout form not found");
}
export async function fillCheckoutCard(p: Page, name: string) {
  const f = await checkoutFrame(p);
  const card = f.getByRole("button", { name: "Card", exact: true });
  if (await card.count()) await card.click();
  const field = (re: RegExp) => f.getByRole("textbox", { name: re }).first();
  await field(/^Card number/).fill("4242424242424242", { timeout: 30_000 });
  await field(/^Expiration/).fill("12 / 34");
  await field(/^(CVC|Security code)/).fill("123");
  for (const [re, value] of [[/^(Cardholder name|Name on card|Full name)/, name], [/^(Postal|ZIP)/, "R3T 2N2"]] as const) {
    const box = field(re);
    if (await box.isVisible().catch(() => false)) await box.fill(value);
  }
}
