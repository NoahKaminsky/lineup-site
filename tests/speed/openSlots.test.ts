import { describe, expect, it } from "vitest";
import { buildOpenSlots, dateKey, minutesToTime, timeToMinutes, type AvailabilityRow, type BookingRow } from "@/app/lib/openSlots";

const LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The profile page's original slot code, copied as it was, to prove the
// faster version gives exactly the same slots.
function original(availability: AvailabilityRow[], bookings: BookingRow[], slotBlockMinutes: number, daysAhead: number, today: Date, nowMinutes: number) {
  const activeAvailability = availability.filter((row) => row.is_active);
  const out: unknown[] = [];
  for (let offset = 0; offset < daysAhead; offset += 1) {
    const currentDate = new Date(today);
    currentDate.setHours(0, 0, 0, 0);
    currentDate.setDate(currentDate.getDate() + offset);
    const dayOfWeek = currentDate.getDay();
    const matchingWindows = activeAvailability.filter((row) => Number(row.day_of_week) === dayOfWeek);
    if (matchingWindows.length === 0) continue;
    for (const window of matchingWindows) {
      const startMinutes = timeToMinutes(window.start_time);
      const endMinutes = timeToMinutes(window.end_time);
      for (let slotStart = startMinutes; slotStart + slotBlockMinutes <= endMinutes; slotStart += 15) {
        const slotEnd = slotStart + slotBlockMinutes;
        if (offset === 0 && slotStart <= nowMinutes + 15) continue;
        const key = dateKey(currentDate);
        const startTime = minutesToTime(slotStart);
        const endTime = minutesToTime(slotEnd);
        const dayBookings = bookings.filter((b) => b.booking_date === key && b.status !== "cancelled");
        if (dayBookings.some((b) => slotStart < timeToMinutes(b.end_time) && slotEnd > timeToMinutes(b.start_time))) continue;
        const freeUntil = dayBookings.reduce((bound, b) => {
          const s = timeToMinutes(b.start_time);
          return s >= slotStart && s < bound ? s : bound;
        }, endMinutes);
        out.push({
          key: `${key}-${startTime}-${endTime}-${slotBlockMinutes}`,
          date: key,
          dayLabel: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : LABELS[dayOfWeek],
          dateLabel: currentDate.toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
          start_time: startTime,
          end_time: endTime,
          duration_minutes: freeUntil - slotStart,
        });
      }
    }
  }
  return out;
}

// Small seeded random, so failures repeat.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe("open slots on a pro's profile", () => {
  it("match the original code exactly, across 200 random weeks", () => {
    const r = rng(7);
    for (let run = 0; run < 200; run++) {
      const today = new Date(2026, 10, 1 + Math.floor(r() * 60), 0, 0, 0);
      const availability: AvailabilityRow[] = Array.from({ length: 1 + Math.floor(r() * 9) }, () => {
        const start = 6 * 60 + Math.floor(r() * 24) * 15;
        return {
          day_of_week: Math.floor(r() * 7),
          start_time: minutesToTime(start),
          end_time: minutesToTime(Math.min(23 * 60 + 45, start + 60 + Math.floor(r() * 40) * 15)),
          is_active: r() > 0.15,
        };
      });
      const bookings: BookingRow[] = Array.from({ length: Math.floor(r() * 30) }, () => {
        const d = new Date(today);
        d.setDate(d.getDate() + Math.floor(r() * 21));
        const s = 7 * 60 + Math.floor(r() * 48) * 15;
        return { booking_date: dateKey(d), start_time: minutesToTime(s), end_time: minutesToTime(s + 30 + Math.floor(r() * 6) * 15), status: r() > 0.8 ? "cancelled" : "confirmed" };
      });
      const block = [15, 30, 45, 60, 90][Math.floor(r() * 5)];
      const days = 1 + Math.floor(r() * 56);
      const now = Math.floor(r() * 24 * 60);
      expect(buildOpenSlots({ availability, bookings, slotBlockMinutes: block, daysAhead: days, today, nowMinutes: now, dayLabels: LABELS })).toEqual(
        original(availability, bookings, block, days, today, now)
      );
    }
  });

  it("is several times faster than the original for 8 weeks of long days (that took ~0.5 s on a phone)", () => {
    const availability = Array.from({ length: 7 }, (_, d) => ({ day_of_week: d, start_time: "07:00", end_time: "22:00", is_active: true }));
    const bookings = Array.from({ length: 300 }, (_, i) => ({ booking_date: dateKey(new Date(2026, 10, 1 + (i % 56))), start_time: "12:00", end_time: "12:45", status: "confirmed" }));
    const today = new Date(2026, 10, 1);
    // Timed side by side in the same run, so a busy machine slows both alike.
    const time = (f: () => unknown) => {
      const t = performance.now();
      for (let i = 0; i < 3; i++) f();
      return performance.now() - t;
    };
    const fast = time(() => buildOpenSlots({ availability, bookings, slotBlockMinutes: 30, daysAhead: 56, today, nowMinutes: 0, dayLabels: LABELS }));
    const slow = time(() => original(availability, bookings, 30, 56, today, 0));
    expect(buildOpenSlots({ availability, bookings, slotBlockMinutes: 30, daysAhead: 56, today, nowMinutes: 0, dayLabels: LABELS }).length).toBeGreaterThan(2000);
    expect(fast * 3).toBeLessThan(slow);
  });
});
