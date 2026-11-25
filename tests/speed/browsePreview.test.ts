import { describe, expect, it } from "vitest";
import { browsePreview } from "@/app/lib/browsePreview";

describe("browsePreview", () => {
  it("uses the first photo (not a video), then the banner, then the avatar", () => {
    const p = { full_name: "TEST Pro", avatar_url: "a.jpg", banner_url: "b.jpg", professional_types: ["nail_tech"] };
    expect(browsePreview(p, [{ image_url: "v.mp4", media_type: "video" }, { image_url: "p.jpg", media_type: "image" }], 2))
      .toEqual({ name: "TEST Pro", trade: "Nail Tech", image: "p.jpg", photos: 2 });
    expect(browsePreview(p, [], 0).image).toBe("b.jpg");
    expect(browsePreview({ ...p, banner_url: null }, [], 0).image).toBe("a.jpg");
  });
  it("falls back to plain words when the profile is empty", () => {
    expect(browsePreview({}, [], 0)).toEqual({ name: "You", trade: "Pro", image: null, photos: 0 });
  });
});
