import { describe, expect, it } from "vitest";
import { getSiteUrl } from "@/app/lib/siteUrl";

describe("getSiteUrl", () => {
  const live = { NEXT_PUBLIC_SITE_URL: "https://www.lineup-aesthetics.ca" };
  it("production uses the live site", () => {
    expect(getSiteUrl(undefined, { ...live, NODE_ENV: "production", VERCEL_ENV: "production" })).toBe("https://www.lineup-aesthetics.ca");
  });
  it("a preview uses its own branch address", () => {
    expect(getSiteUrl(undefined, { ...live, NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "lineup-git-x.vercel.app" })).toBe("https://lineup-git-x.vercel.app");
  });
  it("npm run dev stays on this machine, so Stripe returns a local test to the local app", () => {
    expect(getSiteUrl(undefined, { ...live, NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(getSiteUrl(undefined, { ...live, NODE_ENV: "development", LOCAL_SITE_URL: "http://127.0.0.1:3100" })).toBe("http://127.0.0.1:3100");
  });
  it("a local production build (npm start) still uses the configured site", () => {
    expect(getSiteUrl(undefined, { ...live, NODE_ENV: "production" })).toBe("https://www.lineup-aesthetics.ca");
  });
});
