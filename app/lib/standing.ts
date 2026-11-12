// Regular appointments ("every 3 weeks with the same pro"): shared rules.
// Server only where it touches the database (getStandingHolds).
//
// Each series holds its upcoming visits on the pro's calendar. A week before a
// visit the client is sent a link to confirm and pay; two days before, an
// unconfirmed visit is released and the series moves on to the next one.

import { getServiceSupabase } from "@/app/lib/serverSupabase";
import type { BusyTime } from "@/app/lib/busyTimes";

export const STANDING_INTERVALS = [1, 2, 3, 4, 5, 6, 8];
export const STANDING_REMIND_DAYS = 7;
export const STANDING_RELEASE_DAYS = 2;
// How far ahead visits are held on the calendar.
export const STANDING_HOLD_DAYS = 120;

export type StandingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  service_id: string | null;
  service_name: string | null;
  service_mode: string;
  start_time: string;
  end_time: string;
  interval_weeks: number;
  next_date: string;
  reminded_for: string | null;
  status: string;
};

export function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

// Every visit of a series from its next one, within [from, to].
export function occurrences(series: Pick<StandingRow, "next_date" | "interval_weeks">, from: string, to: string) {
  const dates: string[] = [];
  let date = series.next_date;
  const step = series.interval_weeks * 7;
  while (date < from) date = addDays(date, step);
  while (date <= to && dates.length < 60) {
    dates.push(date);
    date = addDays(date, step);
  }
  return dates;
}

export function everyLabel(weeks: number) {
  return weeks === 1 ? "every week" : `every ${weeks} weeks`;
}

// Held visits as busy times (for the booking calendars and clash checks).
// A visit that's already been booked shows up as that booking instead.
export async function getStandingHolds(
  professionalIds: string[],
  fromDate: string,
  toDate: string,
  options: { exceptSeriesId?: string | null } = {}
): Promise<BusyTime[]> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (!ids.length) return [];
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("standing_appointments")
    .select("id, professional_id, start_time, end_time, interval_weeks, next_date")
    .in("professional_id", ids)
    .eq("status", "active")
    .lte("next_date", toDate);
  if (error) {
    // Before the migration has run the table doesn't exist: no holds.
    console.error("Standing holds lookup failed:", error.message);
    return [];
  }
  const series = (data || []).filter((s) => s.id !== options.exceptSeriesId);
  if (!series.length) return [];

  // A visit already booked (through the confirm link, pay at the shop, or
  // any other way) shows up as that booking instead.
  const { data: booked } = await supabase
    .from("bookings")
    .select("professional_id, booking_date, start_time")
    .in("professional_id", [...new Set(series.map((s) => s.professional_id))])
    .in("status", ["confirmed", "completion_requested", "completed"])
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate);
  const bookedKeys = new Set((booked || []).map((b) => `${b.professional_id}:${b.booking_date}:${String(b.start_time).slice(0, 5)}`));

  const holds: BusyTime[] = [];
  for (const s of series) {
    for (const date of occurrences(s, fromDate, toDate)) {
      if (bookedKeys.has(`${s.professional_id}:${date}:${String(s.start_time).slice(0, 5)}`)) continue;
      holds.push({
        professional_id: s.professional_id,
        booking_date: date,
        start_time: String(s.start_time).slice(0, 5),
        end_time: String(s.end_time).slice(0, 5),
      });
    }
  }
  return holds;
}

export async function hasStandingHoldClash(
  professionalId: string,
  date: string,
  startTime: string,
  endTime: string,
  exceptSeriesId?: string | null
) {
  const holds = await getStandingHolds([professionalId], date, date, { exceptSeriesId });
  const toMin = (t: string) => {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  return holds.some((h) => toMin(startTime) < toMin(h.end_time) && toMin(endTime) > toMin(h.start_time));
}
