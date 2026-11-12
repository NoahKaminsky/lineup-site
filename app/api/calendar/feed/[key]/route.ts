import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { verifyCalendarFeedKey } from "@/app/lib/calendarFeed";
import { appointmentInstant } from "@/app/lib/bookingTime";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { renderIcs, type IcsEvent } from "@/app/lib/ics";

// A pro's bookings as an iCalendar feed, for Apple Calendar, Google Calendar
// and Outlook to subscribe to. Each calendar app re-reads it on its own
// schedule (Apple: as often as every 15 min; Google: every few hours), and
// anything cancelled simply drops out on the next read.
//
// Covers online bookings and the shop's walk-ins and phone bookings, from 60
// days back to a year ahead.

export const dynamic = "force-dynamic";

const PAST_DAYS = 60;
const FUTURE_DAYS = 366;

function dateKey(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const profileId = verifyCalendarFeedKey((await params).key);
  if (!profileId) return new Response("Not found", { status: 404 });

  const supabase = getServiceSupabase();
  const from = dateKey(-PAST_DAYS);
  const to = dateKey(FUTURE_DAYS);

  const [{ data: bookings }, { data: shop }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, customer_id, booking_date, start_time, end_time, status, service_name, service_mode, formatted_address, created_at")
      .eq("professional_id", profileId)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .gte("booking_date", from)
      .lte("booking_date", to),
    supabase
      .from("shop_appointments")
      .select("id, kind, client_name, service_name, appointment_date, start_time, end_time, status, created_at")
      .eq("professional_id", profileId)
      .gte("appointment_date", from)
      .lte("appointment_date", to),
  ]);

  const customerIds = Array.from(new Set((bookings || []).map((b) => b.customer_id).filter(Boolean)));
  const names = new Map<string, string | null>();
  if (customerIds.length) {
    const { data: customers } = await supabase.from("profiles").select("id, full_name").in("id", customerIds);
    for (const c of customers || []) names.set(c.id, firstName(c.full_name));
  }

  const site = getSiteUrl("https://www.lineup-aesthetics.ca");
  const events: IcsEvent[] = [];

  for (const b of bookings || []) {
    if (!b.booking_date || !b.start_time) continue;
    const start = appointmentInstant(b.booking_date, b.start_time);
    const end = b.end_time ? appointmentInstant(b.booking_date, b.end_time) : new Date(start.getTime() + 3600_000);
    const who = names.get(b.customer_id) || "Client";
    const atClient = b.service_mode === "mobile" || b.service_mode === "at_client";
    events.push({
      uid: `booking-${b.id}@lineup-aesthetics.ca`,
      start,
      end: end > start ? end : new Date(start.getTime() + 3600_000),
      summary: `${b.service_name || "Booking"} · ${who}`,
      // The client's address only for visits at their place; otherwise the
      // pro already knows where they work.
      location: atClient ? b.formatted_address : null,
      description: `LineUp booking. Open it for details and to message ${who}: ${site}/bookings/${b.id}`,
      url: `${site}/bookings/${b.id}`,
      created: b.created_at,
    });
  }

  for (const a of shop || []) {
    if (a.status === "cancelled" || a.status === "canceled" || !a.appointment_date || !a.start_time) continue;
    const start = appointmentInstant(a.appointment_date, a.start_time);
    const end = a.end_time ? appointmentInstant(a.appointment_date, a.end_time) : new Date(start.getTime() + 3600_000);
    events.push({
      uid: `shop-${a.id}@lineup-aesthetics.ca`,
      start,
      end: end > start ? end : new Date(start.getTime() + 3600_000),
      summary: `${a.service_name || "Appointment"} · ${firstName(a.client_name) || "Client"}`,
      description: `${a.kind === "walk_in" ? "Walk-in" : "Phone booking"} at the shop, added on LineUp.`,
      created: a.created_at,
    });
  }

  return new Response(renderIcs(events, "LineUp bookings"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lineup-bookings.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
