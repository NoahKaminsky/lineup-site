import { getServiceSupabase } from "@/app/lib/serverSupabase";

// The times a professional is already booked, for the booking calendars on
// profiles and Browse. Covers every live booking — direct calendar bookings
// and paid request offers alike — and leaves cancelled ones out, so a
// cancellation opens the time back up.
//
// Read with the service role because clients can't (and shouldn't) read other
// people's bookings; only the time ranges leave the server, never who booked
// or where.

export type BusyTime = {
  professional_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
};

export const BLOCKING_BOOKING_STATUSES = ["confirmed", "completion_requested", "completed"];

export async function getBusyTimes(professionalIds: string[], fromDate: string, toDate: string): Promise<BusyTime[]> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await getServiceSupabase()
    .from("bookings")
    .select("professional_id, booking_date, start_time, end_time")
    .in("professional_id", ids)
    .in("status", BLOCKING_BOOKING_STATUSES)
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);

  const booked = (data || [])
    .filter((row) => row.booking_date && row.start_time && row.end_time)
    .map((row) => ({
      professional_id: row.professional_id,
      booking_date: String(row.booking_date),
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
    }));

  // Walk-ins and phone-ins a studio booked at the front desk.
  const frontDesk = await getFrontDeskTimes(ids, fromDate, toDate);

  // Time off blocks the whole day.
  const timeOff = await getTimeOffDays(ids, fromDate, toDate);
  const offDays = timeOff.map((day) => ({
    professional_id: day.professional_id,
    booking_date: day.date,
    start_time: "00:00",
    end_time: "24:00",
  }));

  return [...booked, ...frontDesk, ...offDays];
}

// Every date (YYYY-MM-DD) inside a pro's time off, clipped to the range.
export async function getTimeOffDays(professionalIds: string[], fromDate: string, toDate: string) {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await getServiceSupabase()
    .from("professional_time_off")
    .select("professional_id, start_date, end_date")
    .in("professional_id", ids)
    .lte("start_date", toDate)
    .gte("end_date", fromDate);

  // Before the time-off migration has run the table doesn't exist yet:
  // treat that as "no time off" rather than breaking booking.
  if (error) {
    console.error("Time off lookup failed:", error.message);
    return [];
  }

  const days: { professional_id: string; date: string }[] = [];
  for (const row of data || []) {
    const start = String(row.start_date) > fromDate ? String(row.start_date) : fromDate;
    const end = String(row.end_date) < toDate ? String(row.end_date) : toDate;
    for (let date = start; date <= end; date = addDays(date, 1)) {
      days.push({ professional_id: row.professional_id, date });
    }
  }
  return days;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_BOOKING_WINDOW_DAYS = 56;

// How many days ahead each pro takes bookings (their setting, or 8 weeks).
export async function getBookingWindows(professionalIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  const windows: Record<string, number> = {};
  ids.forEach((id) => (windows[id] = DEFAULT_BOOKING_WINDOW_DAYS));
  if (ids.length === 0) return windows;

  const { data, error } = await getServiceSupabase()
    .from("profiles")
    .select("id, booking_window_days")
    .in("id", ids);

  // Column not added yet (migration pending): everyone keeps the default.
  if (error) return windows;

  for (const row of data || []) {
    const days = Number(row.booking_window_days);
    if (Number.isFinite(days) && days >= 1 && days <= DEFAULT_BOOKING_WINDOW_DAYS) windows[row.id] = days;
  }
  return windows;
}

// Booking-row shape the calendars already work with (no private fields).
export function busyTimesAsBookingRows(busy: BusyTime[]) {
  return busy.map((row, index) => ({
    id: `busy-${row.professional_id}-${row.booking_date}-${row.start_time}-${index}`,
    professional_id: row.professional_id,
    customer_id: "",
    booking_date: row.booking_date,
    start_time: row.start_time,
    end_time: row.end_time,
    status: "confirmed" as const,
  }));
}

export const BLOCKING_FRONT_DESK_STATUSES = ["booked", "completed"];

// Front-desk appointments (see supabase/migrations/20261030_front_desk_and_booth_rent.sql).
// Before that migration runs the table doesn't exist: treat it as empty.
export async function getFrontDeskTimes(professionalIds: string[], fromDate: string, toDate: string): Promise<BusyTime[]> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await getServiceSupabase()
    .from("shop_appointments")
    .select("professional_id, appointment_date, start_time, end_time")
    .in("professional_id", ids)
    .in("status", BLOCKING_FRONT_DESK_STATUSES)
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate);

  if (error) return [];

  return (data || []).map((row) => ({
    professional_id: row.professional_id,
    booking_date: String(row.appointment_date),
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
  }));
}

function toMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

// Does this time clash with a front-desk appointment on the pro's day? The
// online booking paths check their own bookings and call this on top, so a
// client can't pay for a time the shop already gave to a walk-in.
export async function hasFrontDeskClash(
  professionalId: string,
  date: string,
  startTime: string,
  endTime: string,
  options: { ignoreId?: string } = {}
) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const { data, error } = await getServiceSupabase()
    .from("shop_appointments")
    .select("id, start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("appointment_date", date)
    .in("status", BLOCKING_FRONT_DESK_STATUSES);
  if (error) return false; // table not created yet
  return (data || []).some(
    (a) => a.id !== options.ignoreId && start < toMinutes(String(a.end_time)) && end > toMinutes(String(a.start_time))
  );
}

// Does this time clash with an online booking? (For the front desk.)
export async function hasOnlineBookingClash(professionalId: string, date: string, startTime: string, endTime: string) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const { data, error } = await getServiceSupabase()
    .from("bookings")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("booking_date", date)
    .in("status", BLOCKING_BOOKING_STATUSES);
  if (error) throw new Error(error.message);
  return (data || []).some((b) => start < toMinutes(String(b.end_time)) && end > toMinutes(String(b.start_time)));
}
