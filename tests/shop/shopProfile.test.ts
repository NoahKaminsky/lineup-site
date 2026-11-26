import { describe, expect, it } from "vitest";
import {
  cleanAbout, cleanAmenities, cleanHours, cleanInstagram, cleanPhone, cleanReview, cleanWebsite,
  combinedHours, openStatus, publicName, reviewSummary, time12,
} from "@/app/lib/shopProfile";

describe("shop hours", () => {
  it("keeps valid hours and merges overlapping windows", () => {
    expect(cleanHours({ 1: [["09:00", "12:00"], ["11:00", "17:00"]], 2: [] })).toEqual({ hours: { 1: [["09:00", "17:00"]] } });
  });
  it("refuses closing before opening, bad times and bad days", () => {
    expect(cleanHours({ 1: [["17:00", "09:00"]] }).error).toMatch(/after opening/);
    expect(cleanHours({ 1: [["9am", "5pm"]] }).error).toMatch(/09:00/);
    expect(cleanHours({ 9: [] }).error).toBeTruthy();
    expect(cleanHours({ 1: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]] }).error).toMatch(/up to 3/);
  });
  it("null clears them (the page then shows the team's hours)", () => {
    expect(cleanHours(null)).toEqual({ hours: null });
  });
  it("combines the team's hours", () => {
    expect(combinedHours([{ 1: [["09:00", "13:00"]] }, { 1: [["12:00", "18:00"]], 3: [["10:00", "16:00"]] }])).toEqual({
      1: [["09:00", "18:00"]],
      3: [["10:00", "16:00"]],
    });
  });
});

describe("open now", () => {
  const hours = { 1: [["09:00", "19:00"]], 2: [["10:00", "18:00"]] } as Record<number, [string, string][]>;
  it("open, with closing time", () => expect(openStatus(hours, { dow: 1, minutes: 600 })).toEqual({ open: true, label: "Open now · closes 7 pm" }));
  it("before opening today", () => expect(openStatus(hours, { dow: 1, minutes: 400 })?.label).toBe("Closed · opens 9 am"));
  it("after closing: tomorrow", () => expect(openStatus(hours, { dow: 1, minutes: 1200 })?.label).toBe("Closed · opens tomorrow 10 am"));
  it("days later: the day's name", () => expect(openStatus(hours, { dow: 3, minutes: 600 })?.label).toBe("Closed · opens Mon 9 am"));
  it("no hours: nothing to say", () => expect(openStatus({}, { dow: 1, minutes: 600 })).toBeNull());
  it("12-hour times", () => {
    expect(time12("00:30")).toBe("12:30 am");
    expect(time12("12:00")).toBe("12 pm");
    expect(time12("17:45")).toBe("5:45 pm");
  });
});

describe("contact details", () => {
  it("phone", () => {
    expect(cleanPhone("(204) 555-0123")).toEqual({ value: "(204) 555-0123" });
    expect(cleanPhone("call me").error).toBeTruthy();
    expect(cleanPhone("")).toEqual({ value: null });
  });
  it("website adds https and refuses junk", () => {
    expect(cleanWebsite("yourshop.ca").value).toBe("https://yourshop.ca");
    expect(cleanWebsite("javascript:alert(1)").error).toBeTruthy();
    expect(cleanWebsite("nodot").error).toBeTruthy();
  });
  it("instagram takes a handle, @handle or a profile link", () => {
    expect(cleanInstagram("@the.shop").value).toBe("the.shop");
    expect(cleanInstagram("https://instagram.com/the_shop/").value).toBe("the_shop");
    expect(cleanInstagram("not a handle!").error).toBeTruthy();
  });
  it("amenities only from the fixed list, no repeats", () => {
    expect(cleanAmenities(["Free parking", "Free parking", "Hot tub"])).toEqual(["Free parking"]);
  });
  it("about is trimmed and capped", () => {
    expect(cleanAbout("  Hi\n\n\n\nthere ")).toEqual({ value: "Hi\n\nthere" });
    expect(cleanAbout("x".repeat(1501)).error).toBeTruthy();
  });
});

describe("shop reviews", () => {
  it("summary: average to one decimal and the star counts", () => {
    expect(reviewSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ count: 3, average: 4.3, counts: [0, 0, 0, 2, 1] });
    expect(reviewSummary([])).toEqual({ count: 0, average: null, counts: [0, 0, 0, 0, 0] });
  });
  it("public name is first name and last initial", () => {
    expect(publicName("Alex Morgan")).toBe("Alex M.");
    expect(publicName("Cher")).toBe("Cher");
    expect(publicName(null)).toBe("LineUp client");
  });
  it("a review needs 1-5 whole stars and a short comment", () => {
    expect(cleanReview({ rating: 5, comment: " Great " })).toEqual({ rating: 5, comment: "Great" });
    expect(cleanReview({ rating: 0 })).toEqual({ error: "Choose 1 to 5 stars." });
    expect(cleanReview({ rating: 4.5 })).toEqual({ error: "Choose 1 to 5 stars." });
    expect("error" in cleanReview({ rating: 5, comment: "x".repeat(1001) })).toBe(true);
  });
});
