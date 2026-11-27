import { describe, expect, it } from "vitest";
import { STUDIO_SECTIONS } from "@/app/studio/StudioContext";
import { SHOP_GEAR_PAGES, SHOP_SECTIONS, modeForPath, shopSectionKey, shopSlugFromPath, visibleShopSections } from "@/app/lib/shopNav";

describe("the shop's five sections", () => {
  it("has at most five sections in the bar", () => {
    expect(SHOP_SECTIONS.map((s) => s.label)).toEqual(["Today", "Calendar", "Clients", "Team", "Money"]);
  });

  it("every Studio page has exactly one home: a section or the gear", () => {
    const placed = [...SHOP_SECTIONS.flatMap((s) => s.pages.map((p) => p.slug)), ...SHOP_GEAR_PAGES.map((p) => p.slug)];
    expect(new Set(placed).size).toBe(placed.length);
    for (const page of STUDIO_SECTIONS) expect(placed, page.slug || "today").toContain(page.slug);
  });

  it("owners and managers see all five, each tab going to its first page", () => {
    const v = visibleShopSections(true);
    expect(v.map((s) => s.href)).toEqual(["/studio", "/studio/calendar", "/studio/clients", "/studio/team", "/studio/earnings"]);
  });

  it("other pros on the team only see what's theirs", () => {
    const v = visibleShopSections(false);
    expect(v.map((s) => s.key)).toEqual(["today", "clients", "team"]);
    expect(v.find((s) => s.key === "clients")!.href).toBe("/studio/memberships");
    expect(v.find((s) => s.key === "team")!.pages.map((p) => p.slug)).toEqual(["team"]);
  });
});

describe("finding where you are", () => {
  it("reads the Studio page from the path", () => {
    expect(shopSlugFromPath("/studio")).toBe("");
    expect(shopSlugFromPath("/studio/team/abc")).toBe("team");
    expect(shopSlugFromPath("/studios")).toBeNull();
    expect(shopSlugFromPath("/requests")).toBeNull();
  });
  it("lights the right section for related pages", () => {
    expect(shopSectionKey("chairs")).toBe("team");
    expect(shopSectionKey("analytics")).toBe("money");
    expect(shopSectionKey("requests")).toBe("today");
    expect(shopSectionKey("import")).toBe("clients");
    expect(shopSectionKey("settings")).toBeNull();
    expect(shopSectionKey(null)).toBeNull();
  });
});

describe("Shop / My work", () => {
  it("Studio pages are Shop; a pro's own pages are My work", () => {
    expect(modeForPath("/studio/calendar", "work")).toBe("shop");
    expect(modeForPath("/calendar", "shop")).toBe("work");
    expect(modeForPath("/requests/123", "shop")).toBe("work");
  });
  it("shared pages keep the last choice", () => {
    expect(modeForPath("/account", "shop")).toBe("shop");
    expect(modeForPath("/account", "work")).toBe("work");
    expect(modeForPath("/gift-cards", "shop")).toBe("shop");
  });
  it("the invite page isn't the shop yet", () => {
    expect(modeForPath("/studio/join", "work")).toBe("work");
  });
});
