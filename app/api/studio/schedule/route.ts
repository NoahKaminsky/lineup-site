import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser } from "@/app/lib/studios";

// GET /api/studio/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// The studio calendar: every appointment in the range (online bookings and
// front-desk walk-ins/phone-ins), plus each pro's weekly hours and time off
// so the calendar can shade when they're not working. Owners and managers
// see the whole team; members see their own column.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!DATE.test(from) || !DATE.test(to) || to < from) {
      return NextResponse.json({ error: "Pass from and to (YYYY-MM-DD)." }, { status: 400 });
    }
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > MAX_DAYS) {
      return NextResponse.json({ error: "Date range too long." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    let ids: string[];
    if (ctx.canManage) {
      const { data: members } = await supabase
        .from("studio_members")
        .select("profile_id")
        .eq("studio_id", ctx.studio.id)
        .eq("status", "active");
      ids = (members || []).map((m) => m.profile_id).filter(Boolean) as string[];
    } else {
      ids = [user.id];
    }
    if (!ids.length) return NextResponse.json({ items: [], hours: {}, timeOff: {} });

    const [{ data: bookings }, { data: frontDesk }, { data: availability }, { data: timeOff }] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, service_name, source, payment_status, service_price, no_show_status"
        )
        .in("professional_id", ids)
        .gte("booking_date", from)
        .lte("booking_date", to)
        .in("status", ["confirmed", "completion_requested", "completed", "cancelled"]),
      supabase
        .from("shop_appointments")
        .select("id, professional_id, kind, client_name, client_phone, service_name, appointment_date, start_time, end_time, price_cents, status, note")
        .eq("studio_id", ctx.studio.id)
        .in("professional_id", ids)
        .gte("appointment_date", from)
        .lte("appointment_date", to)
        .neq("status", "cancelled"),
      supabase
        .from("professional_availability")
        .select("professional_id, day_of_week, start_time, end_time, is_active")
        .in("professional_id", ids)
        .eq("is_active", true),
      supabase
        .from("professional_time_off")
        .select("professional_id, start_date, end_date")
        .in("professional_id", ids)
        .lte("start_date", to)
        .gte("end_date", from),
    ]);

    // Cancelled online bookings only matter when they were no-shows.
    const onlineRows = (bookings || []).filter((b) => b.status !== "cancelled" || b.no_show_status);

    const customerIds = [...new Set(onlineRows.map((b) => b.customer_id).filter(Boolean))];
    const { data: customers } = customerIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", customerIds)
      : { data: [] };
    const customerMap = new Map((customers || []).map((c) => [c.id, c.full_name]));

    const items = [
      ...onlineRows.map((b) => ({
        id: b.id,
        kind: "online" as const,
        professionalId: b.professional_id,
        date: String(b.booking_date),
        start: String(b.start_time).slice(0, 5),
        end: String(b.end_time).slice(0, 5),
        status: b.no_show_status ? "no_show" : b.status,
        service: b.service_name,
        source: b.source,
        payAtShop: b.payment_status === "pay_at_shop",
        clientName: customerMap.get(b.customer_id) || null,
        clientPhone: null,
        priceCents: b.service_price ? Math.round(Number(b.service_price) * 100) : null,
        note: null,
      })),
      ...(frontDesk || []).map((a) => ({
        id: a.id,
        kind: a.kind as "walk_in" | "phone",
        professionalId: a.professional_id,
        date: String(a.appointment_date),
        start: String(a.start_time).slice(0, 5),
        end: String(a.end_time).slice(0, 5),
        status: a.status,
        service: a.service_name,
        source: "front_desk",
        payAtShop: true,
        clientName: a.client_name,
        clientPhone: a.client_phone,
        priceCents: a.price_cents,
        note: a.note,
      })),
    ].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));

    // Weekly hours per pro: { proId: { 0..6: [["09:00","17:00"], …] } }
    const hours: Record<string, Record<number, [string, string][]>> = {};
    for (const row of availability || []) {
      const byDay = (hours[row.professional_id] ||= {});
      (byDay[row.day_of_week] ||= []).push([String(row.start_time).slice(0, 5), String(row.end_time).slice(0, 5)]);
    }

    const off: Record<string, { start: string; end: string }[]> = {};
    for (const row of timeOff || []) {
      (off[row.professional_id] ||= []).push({ start: String(row.start_date), end: String(row.end_date) });
    }

    return NextResponse.json({ items, hours, timeOff: off }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/studio/schedule failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load the schedule.") }, { status: 500 });
  }
}
