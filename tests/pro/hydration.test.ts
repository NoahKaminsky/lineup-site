import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Reading matchMedia while rendering makes the first client render differ from
// the server's HTML (React error #418). Use useMediaQuery instead.
describe("hydration-safe media queries", () => {
  it("LuLoader reads Reduce Motion through useMediaQuery, not during render", () => {
    const src = readFileSync("app/components/LuLoader.tsx", "utf8");
    expect(src).toContain('useMediaQuery("(prefers-reduced-motion: reduce)")');
    expect(src).not.toMatch(/useState\(\s*\(\)\s*=>[^)]*matchMedia/);
  });
});
