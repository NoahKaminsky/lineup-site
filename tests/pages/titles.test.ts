import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PAGE_TITLES, profileTitle, studioSectionTitle } from "@/app/lib/pageTitles";
import { STUDIO_SECTIONS } from "@/app/studio/StudioContext";

const APP = join(process.cwd(), "app");
const META = /export\s+(const\s+metadata\b|(async\s+)?function\s+generateMetadata\b)/;

function pageDirs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "api") continue;
    const full = join(dir, e.name);
    if (existsSync(join(full, "page.tsx"))) out.push(full);
    out.push(...pageDirs(full));
  }
  return out;
}

const hasMeta = (file: string) => existsSync(file) && META.test(readFileSync(file, "utf8"));

describe("every page has its own tab title", () => {
  it("each page, or a layout above it (not the root), sets a title", () => {
    const missing = pageDirs(APP).filter((dir) => {
      if (hasMeta(join(dir, "page.tsx"))) return false;
      for (let d = dir; d !== APP; d = join(d, "..")) if (hasMeta(join(d, "layout.tsx"))) return false;
      return true;
    });
    expect(missing.map((d) => "/" + relative(APP, d).split(sep).join("/"))).toEqual([]);
  });

  it("every listed title points at a page that exists", () => {
    for (const path of Object.keys(PAGE_TITLES)) {
      expect(existsSync(join(APP, ...path.slice(1).split("/"), "page.tsx")), path).toBe(true);
    }
  });

  it("a client page can't set a title itself, so those use a layout", () => {
    for (const dir of pageDirs(APP)) {
      const page = readFileSync(join(dir, "page.tsx"), "utf8");
      if (/^\s*["']use client["']/.test(page)) expect(META.test(page), dir).toBe(false);
    }
  });
});

describe("Studio section titles", () => {
  it("every Studio tab has its own title", () => {
    for (const s of STUDIO_SECTIONS) {
      const title = studioSectionTitle(s.slug);
      expect(title, s.slug || "today").toBe(s.slug ? `${s.label} · Studio` : "Studio");
    }
  });
  it("an unknown section falls back to Studio", () => {
    expect(studioSectionTitle("nope")).toBe("Studio");
    expect(studioSectionTitle(undefined)).toBe("Studio");
  });
});

describe("profile titles", () => {
  it("prefers the business name, then the person's name", () => {
    expect(profileTitle({ business_name: " Fade Lab ", full_name: "Sam Lee" })).toBe("Fade Lab");
    expect(profileTitle({ business_name: "", full_name: "Sam Lee" })).toBe("Sam Lee");
  });
  it("falls back to Profile", () => {
    expect(profileTitle({ business_name: null, full_name: "  " })).toBe("Profile");
    expect(profileTitle(null)).toBe("Profile");
  });
});
