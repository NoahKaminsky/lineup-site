import { describe, expect, it } from "vitest";
import { openTimes, resolveAnyone, type Busy, type SlotPro } from "@/app/lib/shopSlots";

// 2026-12-01 is a Tuesday (day 2).
const TODAY = "2026-11-30";
const DAY = "2026-12-01";
const pro = (id: string, hours: [string, string][] = [["09:00", "12:00"]]): SlotPro => ({ id, bookingWindowDays: 14, hours: { 2: hours } });
const busy = (id: string, start: string, end: string): Busy => ({ professional_id: id, booking_date: DAY, start_time: start, end_time: end });

describe("open times for one pro", () => {
  it("half-hour starts inside their hours, room for the whole service", () => {
    expect(openTimes(pro("a"), [], DAY, 60, TODAY, 0)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
  it("skips anything that overlaps a booking, and offers the moment they free up", () => {
    expect(openTimes(pro("a"), [busy("a", "09:00", "09:45")], DAY, 30, TODAY, 0)).toEqual(["09:45", "10:00", "10:30", "11:00", "11:30"]);
  });
  it("never offers a time starting in the next 15 minutes", () => {
    expect(openTimes(pro("a"), [], TODAY === DAY ? DAY : DAY, 30, DAY, 9 * 60 + 20)).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });
  it("nothing past their booking window or on a day off", () => {
    expect(openTimes({ ...pro("a"), bookingWindowDays: 1 }, [], DAY, 30, TODAY, 0)).toEqual([]);
    expect(openTimes(pro("a"), [], "2026-12-02", 30, TODAY, 0)).toEqual([]);
  });
});

describe("Anyone", () => {
  const a = pro("a");
  const b = pro("b");
  it("books whoever is free at that time", () => {
    const taken = [busy("a", "10:00", "11:00")];
    expect(resolveAnyone([a, b], taken, DAY, "10:00", () => 30, TODAY)?.id).toBe("b");
    expect(resolveAnyone([a, b], taken, DAY, "09:00", () => 30, TODAY)?.id).toBe("a");
  });
  it("uses each pro's own length for the service", () => {
    // a's version takes 90 min and runs into their 10:30 booking; b's takes 30.
    const taken = [busy("a", "10:30", "11:00")];
    expect(resolveAnyone([a, b], taken, DAY, "09:30", (p) => (p.id === "a" ? 90 : 30), TODAY)?.id).toBe("b");
  });
  it("nobody free: no one", () => {
    expect(resolveAnyone([a, b], [busy("a", "09:00", "12:00"), busy("b", "09:00", "12:00")], DAY, "10:00", () => 30, TODAY)).toBeNull();
  });
});
