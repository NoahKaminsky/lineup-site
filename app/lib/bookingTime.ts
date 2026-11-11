// Booking dates and times are stored as plain local values ("2026-10-20",
// "14:30") in LineUp's market time zone. Parsing them with `new Date(...)`
// treats them as the *runtime's* zone — UTC on the server — which put the
// 24-hour cancellation cutoff 5–6 hours early. Everything that asks "when is
// this appointment, really?" goes through here instead.

// Manitoba stopped changing clocks on Nov 1, 2026 and stays on UTC-5
// ("Manitoba Standard Time") year-round. Plenty of browsers, phones and
// servers still carry the old rules and think Winnipeg fell back to UTC-6,
// so formatting uses a fixed UTC-5 zone instead of "America/Winnipeg".
// (IANA's Etc/ zones have the sign flipped: Etc/GMT+5 is UTC-5.)
export const BOOKING_TIME_ZONE = "Etc/GMT+5";
const MANITOBA_PERMANENT_FROM = Date.UTC(2026, 10, 1, 7, 0, 0); // Nov 1, 2026, 2:00 local
const PERMANENT_OFFSET_MS = -5 * 3600 * 1000;
export const CANCELLATION_CUTOFF_HOURS = 24;

// Offset (ms) between UTC and the booking zone at a given instant.
function zoneOffsetMs(instant: Date) {
  if (instant.getTime() >= MANITOBA_PERMANENT_FROM) return PERMANENT_OFFSET_MS;
  // Older dates: the historical Winnipeg rules are right everywhere.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Winnipeg",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

// The real instant of a local booking date + time (e.g. a start or end time).
export function appointmentInstant(date: string, time: string | null | undefined): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = String(time || "00:00").split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  // Two passes so an appointment right next to a DST change lands correctly.
  let instant = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc));
  instant = wallAsUtc - zoneOffsetMs(new Date(instant));
  return new Date(instant);
}

export function hoursUntilAppointment(date: string, startTime: string | null | undefined) {
  return (appointmentInstant(date, startTime).getTime() - Date.now()) / (1000 * 60 * 60);
}

// Free cancellation (full refund) is allowed until 24h before the start.
export function canCancelForRefund(date: string | null | undefined, startTime: string | null | undefined) {
  if (!date) return false;
  return hoursUntilAppointment(date, startTime) >= CANCELLATION_CUTOFF_HOURS;
}

// "Mon, Oct 19 at 2:30 PM" — the last moment a refund-able cancellation can
// happen, shown in the booking zone so it matches the appointment itself.
export function formatCancellationDeadline(date: string, startTime: string | null | undefined) {
  const cutoff = new Date(appointmentInstant(date, startTime).getTime() - CANCELLATION_CUTOFF_HOURS * 3600 * 1000);
  const day = cutoff.toLocaleDateString("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  // en-US gives "9:30 AM" (matching the booking times shown elsewhere);
  // en-CA's "9:30 a.m." ended sentences with a double period.
  const time = cutoff.toLocaleTimeString("en-US", { timeZone: BOOKING_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

// Whether the appointment's end time has passed — completion can't be
// requested before then.
export function hasAppointmentEnded(date: string | null | undefined, endTime: string | null | undefined) {
  if (!date) return false;
  return appointmentInstant(date, endTime).getTime() <= Date.now();
}

// How far ahead clients can book from a profile's calendar.
export const BOOKING_WINDOW_DAYS = 56; // 8 weeks

// "Now" on the shop's clock: today's date key ("2026-11-08") and minutes past
// midnight. Use this instead of the device's local time, which can be wrong
// (old time zone rules, or a client in another province).
export function shopNow(at: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
