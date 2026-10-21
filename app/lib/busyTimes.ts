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

  return (data || [])
    .filter((row) => row.booking_date && row.start_time && row.end_time)
    .map((row) => ({
      professional_id: row.professional_id,
      booking_date: String(row.booking_date),
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
    }));
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
