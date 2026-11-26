import { describe, expect, it } from "vitest";
import { priceOf, serviceKey, shopMenu } from "@/app/lib/shopMenu";

describe("shop menu", () => {
  it("merges the same service across pros, lowest price and shortest time", () => {
    const menu = shopMenu([
      { services: [{ name: "Fade", priceLabel: "$40", minutes: 45 }, { name: "Beard", priceLabel: "$20", minutes: 20 }] },
      { services: [{ name: " fade ", priceLabel: "$35", minutes: 30 }] },
    ]);
    expect(menu[0]).toEqual({ key: "fade", name: "Fade", from: 35, minutes: 30, pros: 2 });
    expect(menu[1].name).toBe("Beard");
  });
  it("keys ignore case and spacing; prices parse from labels", () => {
    expect(serviceKey("  Skin   Fade ")).toBe("skin fade");
    expect(priceOf("$40.50")).toBe(40.5);
    expect(priceOf(null)).toBeNull();
  });
});
