import { describe, expect, it } from "vitest";
import { isSeen, mergeSeen, withSeen, withoutReplayable } from "@/app/lib/guides";

describe("guides seen list", () => {
  it("adds a key once", () => {
    expect(withSeen([], "tip:services")).toEqual(["tip:services"]);
    expect(withSeen(["tip:services"], "tip:services")).toEqual(["tip:services"]);
  });
  it("merges this browser and the profile without repeats", () => {
    expect(mergeSeen(["tour:customer", "tip:work"], ["tip:work", "tip:discover"])).toEqual(["tour:customer", "tip:work", "tip:discover"]);
    expect(mergeSeen(null, undefined)).toEqual([]);
    expect(mergeSeen(["", 3 as unknown as string, "tip:a"], [])).toEqual(["tip:a"]);
  });
  it("never grows past 200", () => {
    let seen: string[] = [];
    for (let i = 0; i < 250; i++) seen = withSeen(seen, `tip:${i}`);
    expect(seen).toHaveLength(200);
    expect(isSeen(seen, "tip:249")).toBe(true);
  });
  it("'show tips again' brings back tips and tours but keeps checklists", () => {
    expect(withoutReplayable(["tip:work", "tour:shop", "checklist:customer"])).toEqual(["checklist:customer"]);
  });
  it("replaying keeps the one-time import marker, so old tour columns aren't copied back", () => {
    expect(withoutReplayable(["legacy:imported", "tour:customer"])).toEqual(["legacy:imported"]);
  });
});

import { customerChecklist, shopChecklist } from "@/app/lib/guides";

describe("customer checklist", () => {
  const base = { savedPros: 0, requests: 0, bookings: 0, hasPhoto: false, push: { supported: true, subscribed: false, denied: false } };
  it("starts with nothing done", () => {
    expect(customerChecklist(base).filter((s) => s.done)).toHaveLength(0);
  });
  it("a booking also counts as having found a pro", () => {
    const steps = customerChecklist({ ...base, bookings: 1 });
    expect(steps.find((s) => s.key === "find")?.done).toBe(true);
    expect(steps.find((s) => s.key === "book")?.done).toBe(true);
  });
  it("never nags about notifications a browser can't do, or that were blocked", () => {
    expect(customerChecklist({ ...base, push: { supported: false, subscribed: false, denied: false } }).find((s) => s.key === "notify")?.done).toBe(true);
    expect(customerChecklist({ ...base, push: { supported: true, subscribed: false, denied: true } }).find((s) => s.key === "notify")?.done).toBe(true);
  });
});

describe("shop checklist", () => {
  const base = { isOwner: true, hasAddress: false, hasTagline: false, teamCount: 1, bookableWithoutServices: 0, live: false, payoutsReady: false, shared: false, hasSlug: true };
  it("owners see payouts, managers don't", () => {
    expect(shopChecklist(base).some((s) => s.key === "payouts")).toBe(true);
    expect(shopChecklist({ ...base, isOwner: false }).some((s) => s.key === "payouts")).toBe(false);
  });
  it("a pro with no services keeps that step open", () => {
    expect(shopChecklist({ ...base, bookableWithoutServices: 2 }).find((s) => s.key === "services")?.done).toBe(false);
  });
  it("asks for the shop's page (cover and about) until it's filled in", () => {
    expect(shopChecklist(base).find((s) => s.key === "profile")?.done).toBe(false);
    expect(shopChecklist({ ...base, hasProfile: true }).find((s) => s.key === "profile")?.done).toBe(true);
  });
  it("sharing only shows once the shop has a page", () => {
    expect(shopChecklist({ ...base, hasSlug: false }).some((s) => s.key === "share")).toBe(false);
  });
  it("every step links somewhere real or is an action", () => {
    for (const s of shopChecklist(base)) expect(s.href === undefined || s.href.startsWith("/studio")).toBe(true);
  });
});
