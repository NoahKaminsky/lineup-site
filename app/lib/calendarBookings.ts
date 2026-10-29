// Shared by the /calendar server loader and its client refresh (safe to
// import from either side).

// What the calendar actually shows: everything still open, plus jobs completed
// in the last day ("Recently completed"). Older completed work lives in
// /archive — loading a pro's entire booking history on every visit was the
// main thing making this page slower over time.
export function calendarStatusFilter() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return `status.in.(confirmed,completion_requested),and(status.eq.completed,completed_at.gte."${cutoff}")`;
}

// Walk-ins and phone-ins a studio booked at the front desk (see
// app/api/studio/front-desk). They're shown on the pro's calendar alongside
// online bookings, but they're managed from /studio and have no booking page.
export const FRONT_DESK_COLUMNS =
  "id, professional_id, kind, client_name, client_phone, service_name, appointment_date, start_time, end_time, price_cents, status, created_at";

export type FrontDeskRow = {
  id: string;
  professional_id: string;
  kind: "walk_in" | "phone";
  client_name: string;
  client_phone: string | null;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  price_cents: number | null;
  status: string;
  created_at: string;
};

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// In the same shape as a calendar booking, so the grid and lists need no
// special handling beyond the card.
export function frontDeskAsCalendarBooking(row: FrontDeskRow) {
  const start = String(row.start_time).slice(0, 5);
  const end = String(row.end_time).slice(0, 5);
  return {
    id: `front-desk-${row.id}`,
    professional_id: row.professional_id,
    customer_id: "",
    booking_date: String(row.appointment_date),
    start_time: start,
    end_time: end,
    status: "confirmed" as const,
    created_at: row.created_at,
    service_id: null,
    service_name: row.service_name,
    duration_minutes: minutesBetween(start, end),
    cancelled_by: null,
    cancelled_at: null,
    completion_requested_at: null,
    completed_at: null,
    formatted_address: null,
    location_lat: null,
    location_lng: null,
    location_place_id: null,
    client_name: row.client_name,
    client_avatar_url: null,
    front_desk: { kind: row.kind, clientPhone: row.client_phone, priceCents: row.price_cents },
  };
}
