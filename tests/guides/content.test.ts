import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TIPS, STUDIO_SECTION_TIPS } from "@/app/lib/guideContent";
import { HELP_SECTIONS } from "@/app/lib/helpGuides";
import { STUDIO_SECTIONS } from "@/app/studio/StudioContext";

// Every link in a tip or guide must open a real page.
function routeExists(href: string) {
  const path = href.split("#")[0].split("?")[0];
  if (path.startsWith("/studio/")) {
    const slug = path.slice("/studio/".length);
    return slug === "settings" || STUDIO_SECTIONS.some((s) => s.slug === slug);
  }
  const dir = join(process.cwd(), "app", path);
  return existsSync(join(dir, "page.tsx"));
}

const WORDS_WE_DONT_USE = [/\bjob(s)?\b/i, /\bbid(s)?\b/i, /\bprofessional\b/i, /\bsalon owner\b/i, /something went wrong/i];

describe("guide links", () => {
  const links = [
    ...Object.values(TIPS).flatMap((t) => ("points" in t ? t.points : []).map((p) => ("href" in p ? p.href : undefined))),
    ...HELP_SECTIONS.flatMap((s) => s.guides.map((g) => g.link?.href)),
  ].filter((h): h is string => !!h);

  it.each(links)("%s is a real page", (href) => {
    expect(routeExists(href)).toBe(true);
  });
});

describe("guide wording", () => {
  const texts = [
    ...Object.values(TIPS).flatMap((t) => [t.title, t.body, ...("points" in t ? t.points.map((p) => p.text) : [])]),
    ...HELP_SECTIONS.flatMap((s) => [s.title, s.intro, ...s.guides.flatMap((g) => [g.title, ...g.steps])]),
  ];
  it("uses LineUp's words (request, offer, shop, pro)", () => {
    for (const t of texts) for (const re of WORDS_WE_DONT_USE) expect(t, t).not.toMatch(re);
  });
  it("keeps tips short enough to read at a glance", () => {
    for (const t of Object.values(TIPS)) expect(t.body.length, t.title).toBeLessThanOrEqual(160);
  });
  it("has unique keys", () => {
    const ids = Object.values(TIPS).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every Studio section except Today has a tip", () => {
    for (const s of STUDIO_SECTIONS) if (s.slug) expect(STUDIO_SECTION_TIPS[s.slug], s.slug).toBeTruthy();
  });
});
