import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The brief: Geist only. Without --font-sans in the theme, Tailwind's default
// system font stack wins everywhere (this happened from March to November 2026).
describe("Geist is the site's font", () => {
  it("the theme maps font-sans to Geist", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
  });
  it("the layout puts the Geist variable on <body>", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/geistSans\.variable/);
  });
});
