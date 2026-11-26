import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasProLocation, usesProLocation } from "@/app/lib/proLocation";

describe("pro location before charging", () => {
  it("in-shop and home-studio bookings need the pro's address; mobile ones don't", () => {
    expect(usesProLocation("in_shop")).toBe(true);
    expect(usesProLocation("home_studio")).toBe(true);
    expect(usesProLocation("at_home")).toBe(false);
    expect(usesProLocation(null)).toBe(false);
  });
  it("an address needs text and both coordinates", () => {
    expect(hasProLocation({ formatted_address: "1 Main St", location_lat: 49.9, location_lng: -97.1 })).toBe(true);
    expect(hasProLocation({ formatted_address: "1 Main St", location_lat: null, location_lng: -97.1 })).toBe(false);
    expect(hasProLocation({ formatted_address: "", location_lat: 49.9, location_lng: -97.1 })).toBe(false);
    expect(hasProLocation(null)).toBe(false);
  });
  it("checkout for an offer refuses before creating the payment, using the same rule as the webhook", () => {
    const route = readFileSync("app/api/stripe/create-payment-intent/route.ts", "utf8");
    const offerFlow = route.slice(route.indexOf("export async function POST"));
    const check = offerFlow.indexOf("usesProLocation(offerMode) && !hasProLocation(offerPro)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(offerFlow.indexOf("stripe.paymentIntents.create"));
  });
});

describe("after a bank check (3D Secure)", () => {
  it("the customer returns to the request they paid from", () => {
    const page = readFileSync("app/requests/[id]/RequestDetailPageClient.tsx", "utf8");
    expect(page).toContain("return_url: `${window.location.origin}${window.location.pathname}`");
    expect(page).not.toContain("return_url: `${window.location.origin}/work`");
  });
});
