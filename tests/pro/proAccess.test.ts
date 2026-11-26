import { describe, expect, it } from "vitest";
import { accountKind, isSubscribedToSchedule, proPageRedirect } from "@/app/lib/proAccess";

describe("accountKind", () => {
  it("reads current and old onboarding roles", () => {
    expect(accountKind("professional")).toBe("pro");
    expect(accountKind("I am a professional")).toBe("pro");
    expect(accountKind("customer")).toBe("customer");
    expect(accountKind("I am a customer")).toBe("customer");
    expect(accountKind(" Shop ")).toBe("shop");
    expect(accountKind("")).toBeNull();
    expect(accountKind(null)).toBeNull();
  });
});

describe("proPageRedirect", () => {
  it("lets pros stay and sends everyone else to their side", () => {
    expect(proPageRedirect("professional", "/studio/earnings")).toBeNull();
    expect(proPageRedirect("shop", "/studio/earnings")).toBe("/studio/earnings");
    expect(proPageRedirect("shop")).toBe("/studio");
    expect(proPageRedirect("customer", "/studio/earnings")).toBe("/requests");
    expect(proPageRedirect(null)).toBe("/requests");
  });
});

describe("isSubscribedToSchedule", () => {
  it("needs a live paid plan", () => {
    expect(isSubscribedToSchedule({ subscription_status: "active", subscription_plan: "apprentice" })).toBe(true);
    expect(isSubscribedToSchedule({ subscription_status: "trialing", subscription_plan: "master" })).toBe(true);
    expect(isSubscribedToSchedule({ subscription_status: "active", subscription_plan: "basic" })).toBe(false);
    expect(isSubscribedToSchedule({ subscription_status: "canceled", subscription_plan: "pro" })).toBe(false);
    expect(isSubscribedToSchedule({ subscription_status: "active", subscription_plan: null })).toBe(false);
  });
});
