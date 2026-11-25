import { describe, expect, it } from "vitest";
import { statSync } from "node:fs";
import { join } from "node:path";

// Icons load on every page; a full-size source image here once cost 1.6 MB per visit.
const ICONS = ["favicon.png", "icon-192.png", "icon-512.png", "lineup-apple-touch-icon.png"];

describe("site icons stay small", () => {
  for (const name of ICONS) {
    it(`${name} is under 64 KB`, () => {
      expect(statSync(join(process.cwd(), "public", name)).size).toBeLessThan(64 * 1024);
    });
  }
});
