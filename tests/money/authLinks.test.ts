import { describe, expect, it } from "vitest";
import { hashSaysExpired, strayAuthLanding } from "@/app/lib/authLinks";

const at = (path: string) => strayAuthLanding(new URL(`https://lineup-aesthetics.ca${path}`));

describe("confirmation links that land in the wrong place", () => {
  it("a code on the home page goes through the confirm step to sign-in", () => {
    expect(at("/?code=abc12345-6789")).toBe("/auth/callback?code=abc12345-6789&next=%2Flogin%3Fconfirmed%3D1");
  });
  it("same on the login page", () => {
    expect(at("/login?code=abc12345")).toMatch(/^\/auth\/callback\?code=abc12345/);
  });
  it("an expired or used link says so on the login page", () => {
    expect(at("/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toBe("/login?link=expired");
    expect(at("/login?error_code=otp_expired")).toBe("/login?link=expired");
  });
  it("leaves every other page and odd codes alone", () => {
    expect(at("/gift/balance?code=LU-AAAA")).toBeNull();
    expect(at("/")).toBeNull();
    expect(at("/?code=<script>")).toBeNull();
  });
  it("reads errors after the #", () => {
    expect(hashSaysExpired("#error=access_denied&error_code=otp_expired")).toBe(true);
    expect(hashSaysExpired("#tour")).toBe(false);
  });
});
