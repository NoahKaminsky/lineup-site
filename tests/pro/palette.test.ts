import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// LineUp is monochrome with one signal red. No orange, amber, yellow, gold or
// green families in the UI.
const BANNED = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|shadow)-(?:orange|amber|yellow|emerald|green|lime|teal)-\d{2,3}\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "api" ? [] : files(p);
    return /\.(tsx|ts|css)$/.test(name) ? [p] : [];
  });
}

describe("palette", () => {
  it("uses no orange, amber, yellow or green classes", () => {
    const hits = files("app").flatMap((f) =>
      readFileSync(f, "utf8").split("\n").flatMap((line, i) => (BANNED.test(line) ? [`${f}:${i + 1}`] : []))
    );
    expect(hits).toEqual([]);
  });
});
