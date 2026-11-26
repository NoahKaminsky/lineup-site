// The open times a pro offers on their profile: every 15 minutes inside their
// weekly hours, for as many days ahead as they take bookings, skipping times
// that clash with a booking and (today) times that start within 15 minutes.
//
// Was inline in ProfilePageClient and redid each day's work for every slot —
// formatting the date, reading the shop clock and filtering all bookings —
// about half a second on a phone for a pro with 8 weeks open. Same output;
// the per-day work now happens once per day (tests/speed/openSlots.test.ts).

export type AvailabilityRow = { day_of_week: number | string; start_time: string; end_time: string; is_active?: boolean | null };
export type BookingRow = { booking_date: string; start_time: string; end_time: string; status?: string | null };

export type OpenSlot = {
  key: string;
  date: string;
  dayLabel: string;
  dateLabel: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
};

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

export function buildOpenSlots({
  availability,
  bookings,
  slotBlockMinutes,
  daysAhead,
  today = new Date(),
  nowMinutes,
  dayLabels,
}: {
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  slotBlockMinutes: number;
  daysAhead: number;
  today?: Date;
  // Minutes past midnight right now, in the shop's time zone.
  nowMinutes: number;
  dayLabels: readonly string[];
}): OpenSlot[] {
  const active = availability.filter((row) => row.is_active);
  if (!active.length || slotBlockMinutes <= 0) return [];

  // Bookings that still hold their time, by day, as minute ranges.
  const busyByDay = new Map<string, { start: number; end: number }[]>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const list = busyByDay.get(b.booking_date) || [];
    list.push({ start: timeToMinutes(b.start_time), end: timeToMinutes(b.end_time) });
    busyByDay.set(b.booking_date, list);
  }

  const slots: OpenSlot[] = [];
  for (let offset = 0; offset < daysAhead; offset += 1) {
    const day = new Date(today);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    const dow = day.getDay();
    const windows = active.filter((row) => Number(row.day_of_week) === dow);
    if (!windows.length) continue;

    // Once per day, not once per slot.
    const key = dateKey(day);
    const dayLabel = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : dayLabels[dow];
    const dateLabel = day.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
    const busy = busyByDay.get(key) || [];

    for (const window of windows) {
      const open = timeToMinutes(window.start_time);
      const close = timeToMinutes(window.end_time);
      for (let start = open; start + slotBlockMinutes <= close; start += 15) {
        const end = start + slotBlockMinutes;
        // Today: never offer a time that has already started (15 min buffer).
        if (offset === 0 && start <= nowMinutes + 15) continue;
        if (busy.some((b) => start < b.end && end > b.start)) continue;
        // How long this time stays free: until closing or the next booking.
        let freeUntil = close;
        for (const b of busy) if (b.start >= start && b.start < freeUntil) freeUntil = b.start;
        const startTime = minutesToTime(start);
        const endTime = minutesToTime(end);
        slots.push({
          key: `${key}-${startTime}-${endTime}-${slotBlockMinutes}`,
          date: key,
          dayLabel,
          dateLabel,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: freeUntil - start,
        });
      }
    }
  }
  return slots;
}
