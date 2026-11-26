import { describe, expect, it } from "vitest";
import { isResizablePhoto } from "@/app/lib/photo";

describe("isResizablePhoto", () => {
  it("resizes photos uploaded to LineUp storage (live and TEST)", () => {
    expect(isResizablePhoto("https://rbsgsymjmptwczecgohb.supabase.co/storage/v1/object/public/avatars/a/1.jpeg")).toBe(true);
    expect(isResizablePhoto("https://zfxeymtuwrjtccxqymrj.supabase.co/storage/v1/object/public/profile-banners/b.jpg?t=1")).toBe(true);
  });
  it("leaves everything else alone", () => {
    for (const src of [null, undefined, "", "blob:http://localhost/123", "/images/landing/a.webp", "https://lh3.googleusercontent.com/a.jpg",
      "https://rbsgsymjmptwczecgohb.supabase.co/storage/v1/object/sign/private/x.jpg", "http://rbsgsymjmptwczecgohb.supabase.co/storage/v1/object/public/a.jpg", "not a url"]) {
      expect(isResizablePhoto(src)).toBe(false);
    }
  });
});
