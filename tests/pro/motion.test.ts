import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const globals = readFileSync("app/globals.css", "utf8");
const theme = readFileSync("app/theme.css", "utf8");
const ms = (block: string, name: string) => Number(new RegExp(`--${name}:\\s*(\\d+)ms`).exec(block)?.[1]);
const block = (sel: string) => theme.slice(theme.indexOf(sel), theme.indexOf("}", theme.indexOf(sel)));

describe("motion tokens", () => {
  it("ease-arrive is a Tailwind theme token (so the ease-arrive class exists)", () => {
    const themeBlock = globals.slice(globals.indexOf("@theme"), globals.indexOf("}", globals.indexOf("@theme")));
    expect(themeBlock).toMatch(/--ease-arrive:/);
  });
  it("Pro is snappier than Customer for feedback and surfaces", () => {
    const pro = block('[data-role="pro"]');
    const customer = block('[data-role="customer"]');
    for (const name of ["motion-fast", "motion-base", "motion-enter"]) {
      expect(ms(pro, name)).toBeLessThan(ms(customer, name));
    }
  });
});
