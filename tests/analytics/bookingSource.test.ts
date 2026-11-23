// Where a profile visitor found the pro (logged with the visit, then
// stamped on their booking by the database).
import { describe, expect, it } from "vitest";
import { visitSource } from "@/app/lib/bookingSource";

const ORIGIN = "https://www.lineup-aesthetics.ca";
const base = {
  path: "/profile/testpro",
  search: "",
  origin: ORIGIN,
  referrer: "",
  firstLoadUrl: `${ORIGIN}/discover`,
  href: `${ORIGIN}/profile/testpro`,
  pending: null,
  now: 1_000_000,
};

describe("visit source", () => {
  it("a tap in Discover says which part: Spotlight, a boost or Discover", () => {
    for (const via of ["spotlight", "boost", "discover"] as const) {
      expect(visitSource({ ...base, pending: { path: "/profile/testpro", via, at: 999_000 } })).toBe(via);
    }
  });
  it("an old or different tap doesn't count", () => {
    expect(visitSource({ ...base, pending: { path: "/profile/other", via: "spotlight", at: 999_000 } })).toBeNull();
    expect(visitSource({ ...base, pending: { path: "/profile/testpro", via: "spotlight", at: 1_000_000 - 31 * 60_000 } })).toBeNull();
  });
  it("opened straight from outside LineUp is their booking link", () => {
    const landed = { ...base, firstLoadUrl: `${ORIGIN}/profile/testpro` };
    expect(visitSource({ ...landed, referrer: "https://l.instagram.com/" })).toBe("booking_link");
    expect(visitSource({ ...landed, referrer: "" })).toBe("booking_link");
    expect(visitSource({ ...landed, referrer: `${ORIGIN}/saved` })).toBeNull();
  });
  it("a ?ref= link is a referral", () => {
    expect(visitSource({ ...base, search: "?ref=abc" })).toBe("referral");
  });
  it("moving around inside LineUp otherwise isn't guessed", () => {
    expect(visitSource(base)).toBeNull();
  });
});
