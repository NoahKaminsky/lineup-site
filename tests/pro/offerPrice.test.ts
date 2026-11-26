import { describe, expect, it } from "vitest";
import { offerPriceCents } from "@/app/lib/offerPrice";

describe("offerPriceCents", () => {
  it("reads prices the payment step can charge", () => {
    expect(offerPriceCents("$55")).toBe(5500);
    expect(offerPriceCents("55.50")).toBe(5550);
    expect(offerPriceCents("1,200 CAD")).toBe(120000);
    expect(offerPriceCents(" $ 40 ")).toBe(4000);
  });
  it("refuses what checkout would reject", () => {
    for (const bad of ["", "  ", "55-60", "about 50", "$0", "-5", "free"]) expect(offerPriceCents(bad)).toBeNull();
  });
});
