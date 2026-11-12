import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { STANDING_INTERVALS, addDays, everyLabel, type StandingRow } from "@/app/lib/standing";
import { getBusyTimes } from "@/app/lib/busyTimes";
import { getProfileHref } from "@/app/lib/profileLink";

// Regular appointments.
//   GET                 my regulars (as the client, and as the pro)
//   GET ?id=            one regular, for its confirm page (its client only)
//   GET ?bookingId=     the regular a booking could start, or already belongs to
//   POST { action: "start", bookingId, intervalWeeks }   client makes a booking regular
//   POST { action: "end", id }                          client or pro stops it
//
// Only bookable the way a direct booking is (the pro takes online bookings on
// a paid plan, at their shop or studio, for a priced service), because each
// visit is confirmed and paid through that same booking flow.

const PAID_PLANS = ["apprentice", "pro", "master"];

function priceCents(value: unknown) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

async function shape(supabase: ReturnType<typeof getServiceSupabase>, rows: StandingRow[], viewerId: string) {
  const ids = [...new Set(rows.flatMap((r) => [r.professional_id, r.customer_id]))];
  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))] as string[];
  const [{ data: people }, { data: services }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", ids) : Promise.resolve({ data: [] }),
    serviceIds.length
      ? supabase.from("professional_services").select("id, price").in("id", serviceIds)
      : Promise.resolve({ data: [] }),
  ]);
  const person = new Map((people || []).map((p) => [p.id, p]));
  const price = new Map((services || []).map((s) => [s.id, priceCents(s.price)]));
  return rows.map((r) => {
    const pro = person.get(r.professional_id);
    const client = person.get(r.customer_id);
    return {
      id: r.id,
      role: r.customer_id === viewerId ? "client" : "pro",
      service: r.service_name,
      serviceId: r.service_id,
      mode: r.service_mode,
      every: everyLabel(r.interval_weeks),
      intervalWeeks: r.interval_weeks,
      nextDate: r.next_date,
      start: String(r.start_time).slice(0, 5),
      end: String(r.end_time).slice(0, 5),
      priceCents: r.service_id ? price.get(r.service_id) ?? null : null,
      pro: { id: r.professional_id, name: pro?.full_name || "Your pro", avatarUrl: pro?.avatar_url || null, href: pro ? getProfileHref(pro) : null },
      client: { id: r.customer_id, name: client?.full_name || "Client" },
    };
  });
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  const url = new URL(req.url);

  const id = url.searchParams.get("id");
  if (id) {
    const { data } = await supabase.from("standing_appointments").select("*").eq("id", id).maybeSingle<StandingRow>();
    if (!data || (data.customer_id !== user.id && data.professional_id !== user.id)) {
      return NextResponse.json({ error: "Regular appointment not found." }, { status: 404 });
    }
    const [item] = await shape(supabase, [data], user.id);
    const { data: booked } = await supabase
      .from("bookings")
      .select("id")
      .eq("professional_id", data.professional_id)
      .eq("customer_id", data.customer_id)
      .eq("booking_date", data.next_date)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .maybeSingle();
    return NextResponse.json({ regular: { ...item, active: data.status === "active", nextBookingId: booked?.id || null } });
  }

  const bookingId = url.searchParams.get("bookingId");
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, professional_id, customer_id, service_id, service_mode, start_time, standing_id, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking || (booking.customer_id !== user.id && booking.professional_id !== user.id)) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    // Already part of a regular, or there's one for the same pro and service.
    const { data: existing } = await supabase
      .from("standing_appointments")
      .select("*")
      .eq("status", "active")
      .eq("professional_id", booking.professional_id)
      .eq("customer_id", booking.customer_id)
      .limit(5);
    const match = (existing || []).find((s) => s.id === booking.standing_id || s.service_id === booking.service_id);
    if (match) return NextResponse.json({ regular: (await shape(supabase, [match as StandingRow], user.id))[0], canStart: false });

    const { data: pro } = await supabase
      .from("profiles")
      .select("direct_booking_enabled, public_availability_enabled, subscription_plan, subscription_status")
      .eq("id", booking.professional_id)
      .maybeSingle();
    const canStart =
      booking.customer_id === user.id &&
      !!booking.service_id &&
      ["in_shop", "home_studio"].includes(booking.service_mode || "") &&
      ["confirmed", "completion_requested", "completed"].includes(booking.status) &&
      !!pro?.direct_booking_enabled &&
      !!pro?.public_availability_enabled &&
      PAID_PLANS.includes(pro?.subscription_plan || "") &&
      ["active", "trialing"].includes(pro?.subscription_status || "");
    return NextResponse.json({ regular: null, canStart, intervals: STANDING_INTERVALS });
  }

  const { data, error } = await supabase
    .from("standing_appointments")
    .select("*")
    .eq("status", "active")
    .or(`customer_id.eq.${user.id},professional_id.eq.${user.id}`)
    .order("next_date", { ascending: true });
  if (error) return NextResponse.json({ regulars: [] });
  return NextResponse.json({ regulars: await shape(supabase, (data || []) as StandingRow[], user.id) });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  const body = await req.json().catch(() => ({}));

  if (body?.action === "end") {
    const { data: series } = await supabase.from("standing_appointments").select("id, customer_id, professional_id, service_name").eq("id", body.id).maybeSingle();
    if (!series || (series.customer_id !== user.id && series.professional_id !== user.id)) {
      return NextResponse.json({ error: "Regular appointment not found." }, { status: 404 });
    }
    await supabase
      .from("standing_appointments")
      .update({ status: "ended", ended_by: user.id, ended_at: new Date().toISOString() })
      .eq("id", series.id);
    const other = series.customer_id === user.id ? series.professional_id : series.customer_id;
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await supabase.from("notifications").insert([
      {
        user_id: other,
        is_read: false,
        type: "standing_ended",
        title: `${me?.full_name || "They"} stopped your regular ${series.service_name || "appointment"}. Visits already booked still stand.`,
      },
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body?.action !== "start") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const intervalWeeks = Number(body.intervalWeeks);
  if (!STANDING_INTERVALS.includes(intervalWeeks)) return NextResponse.json({ error: "Pick how often." }, { status: 400 });

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, professional_id, customer_id, service_id, service_name, service_mode, booking_date, start_time, end_time, status")
    .eq("id", body.bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== user.id) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!booking.service_id || !["in_shop", "home_studio"].includes(booking.service_mode || "")) {
    return NextResponse.json({ error: "Only bookings at the pro's shop or studio can be made regular." }, { status: 409 });
  }

  const { data: existing } = await supabase
    .from("standing_appointments")
    .select("id")
    .eq("status", "active")
    .eq("professional_id", booking.professional_id)
    .eq("customer_id", user.id)
    .eq("service_id", booking.service_id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "You already have this as a regular appointment." }, { status: 409 });

  // The first held visit: one interval after this booking (and after today).
  const today = new Date().toISOString().slice(0, 10);
  let next = addDays(String(booking.booking_date), intervalWeeks * 7);
  while (next <= today) next = addDays(next, intervalWeeks * 7);

  const start = String(booking.start_time).slice(0, 5);
  const end = String(booking.end_time).slice(0, 5);
  // If that first time is already taken (a booking, walk-in, time off or
  // another regular), start from the next free one.
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const step = intervalWeeks * 7;
  const busy = await getBusyTimes([booking.professional_id], next, addDays(next, step * 3));
  const taken = (date: string) =>
    busy.some((b) => b.booking_date === date && toMin(start) < toMin(b.end_time) && toMin(end) > toMin(b.start_time));
  let tries = 0;
  while (taken(next) && tries < 3) {
    next = addDays(next, step);
    tries++;
  }
  if (taken(next)) {
    return NextResponse.json({ error: "That time is taken on the coming weeks. Try a different gap." }, { status: 409 });
  }

  const { data: created, error } = await supabase
    .from("standing_appointments")
    .insert({
      professional_id: booking.professional_id,
      customer_id: user.id,
      service_id: booking.service_id,
      service_name: booking.service_name,
      service_mode: booking.service_mode,
      start_time: start,
      end_time: end,
      interval_weeks: intervalWeeks,
      next_date: next,
      source_booking_id: booking.id,
    })
    .select("*")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message || "Couldn't set that up." }, { status: 500 });

  await supabase.from("bookings").update({ standing_id: created.id }).eq("id", booking.id);
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  await supabase.from("notifications").insert([
    {
      user_id: booking.professional_id,
      is_read: false,
      type: "standing_started",
      title: `${me?.full_name || "A client"} is now a regular: ${booking.service_name || "appointment"} ${everyLabel(intervalWeeks)} at ${start}. Those times are held for them.`,
    },
  ]);

  return NextResponse.json({ ok: true, regular: (await shape(supabase, [created as StandingRow], user.id))[0] });
}
