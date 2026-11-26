import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "api" || name === "landing" || name === "site" ? [] : files(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("consistency", () => {
  it("main signed-in routes show a skeleton while loading", () => {
    for (const route of ["account", "calendar", "discover", "requests", "requests/[id]", "work", "verification", "profile/[id]",
      "bookings/[id]", "shop/[slug]", "earnings", "analytics", "services", "subscription", "admin", "studio"]) {
      expect(existsSync(join("app", route, "loading.tsx")), route).toBe(true);
    }
  });
  it("cards use the radius scale, not one-off pixel radii", () => {
    const hits = files("app").filter((f) => /rounded-\[(22|24|28)px\]/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("no bare 'Loading…' paragraphs in lists", () => {
    const hits = files("app").filter((f) => /<p[^>]*>Loading…<\/p>/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
