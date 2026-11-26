import { describe, expect, it } from "vitest";
import { isLikelyImageFile, photoReadFailureMessage } from "@/app/lib/imageFiles";

describe("isLikelyImageFile", () => {
  it("accepts images by type or by name (HEIC with an empty type)", () => {
    expect(isLikelyImageFile({ name: "a.jpg", type: "image/jpeg" })).toBe(true);
    expect(isLikelyImageFile({ name: "IMG_1.HEIC", type: "" })).toBe(true);
    expect(isLikelyImageFile({ name: "x.heif", type: "application/octet-stream" })).toBe(true);
  });
  it("rejects non-images", () => {
    expect(isLikelyImageFile({ name: "cv.pdf", type: "application/pdf" })).toBe(false);
    expect(isLikelyImageFile({ name: "notes", type: "" })).toBe(false);
  });
});

describe("photoReadFailureMessage", () => {
  it("is empty with no failures and plain English otherwise", () => {
    expect(photoReadFailureMessage(0)).toBe("");
    expect(photoReadFailureMessage(1)).toMatch(/^One photo couldn't be read/);
    expect(photoReadFailureMessage(3)).toMatch(/^3 photos couldn't be read/);
  });
});
