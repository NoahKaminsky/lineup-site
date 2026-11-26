import { describe, expect, it } from "vitest";
import { wantsShopVisit } from "@/app/lib/shopRequests";

describe("shop requests", () => {
  it("only requests where the client chose to go to the shop", () => {
    expect(wantsShopVisit({ service_modes: ["in_shop"] })).toBe(true);
    expect(wantsShopVisit({ service_modes: ["mobile", "in_shop"] })).toBe(true);
    expect(wantsShopVisit({ service_mode: "in_shop" })).toBe(true);
  });
  it("never mobile ('at my place') or home-studio requests", () => {
    expect(wantsShopVisit({ service_modes: ["mobile"] })).toBe(false);
    expect(wantsShopVisit({ service_modes: ["home_studio"] })).toBe(false);
    expect(wantsShopVisit({ service_modes: ["mobile", "home_studio"] })).toBe(false);
    expect(wantsShopVisit({ service_modes: [], service_mode: null })).toBe(false);
  });
});
