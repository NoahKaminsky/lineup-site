import { NextResponse } from "next/server";
import { requireAdmin, getServiceSupabase } from "@/app/lib/serverSupabase";

const TABLES: Record<string, { table: string; select: string }> = {
  reviews: {
    table: "professional_reviews",
    select: "id, professional_id, reviewer_id, rating, comment, created_at",
  },
  portfolio: {
    table: "professional_portfolio",
    select: "id, user_id, image_url, caption, created_at",
  },
  requests: {
    table: "service_requests",
    select: "id, client_id, title, description, category, status, created_at",
  },
  bookings: {
    table: "bookings",
    select: "id, professional_id, customer_id, service_name, booking_date, status, created_at",
  },
  messages: {
    table: "booking_messages",
    select: "id, booking_id, sender_id, message, created_at",
  },
};

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "";
  const q = searchParams.get("q")?.trim() || "";

  const config = TABLES[type];
  if (!config) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const service = getServiceSupabase();

  let query = service
    .from(config.table)
    .select(config.select)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q && type === "requests") {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  } else if (q && type === "reviews") {
    query = query.ilike("comment", `%${q}%`);
  } else if (q && type === "portfolio") {
    query = query.ilike("caption", `%${q}%`);
  } else if (q && type === "bookings") {
    query = query.ilike("service_name", `%${q}%`);
  } else if (q && type === "messages") {
    query = query.ilike("message", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data || [];

  // For messages, pull in the booking each one belongs to so the admin has context
  // (who's talking, about what) — a sender_id + booking_id alone isn't readable.
  let bookingMap = new Map<string, { professional_id: string; customer_id: string; service_name: string | null; booking_date: string }>();

  if (type === "messages") {
    const bookingIds = Array.from(new Set(items.map((item: any) => item.booking_id).filter(Boolean)));

    if (bookingIds.length > 0) {
      const { data: relatedBookings } = await service
        .from("bookings")
        .select("id, professional_id, customer_id, service_name, booking_date")
        .in("id", bookingIds);

      bookingMap = new Map((relatedBookings || []).map((b) => [b.id, b]));
    }
  }

  // Resolve the people involved so the admin can see names, not raw ids.
  const personIds = new Set<string>();
  items.forEach((item: any) => {
    if (item.professional_id) personIds.add(item.professional_id);
    if (item.reviewer_id) personIds.add(item.reviewer_id);
    if (item.user_id) personIds.add(item.user_id);
    if (item.client_id) personIds.add(item.client_id);
    if (item.customer_id) personIds.add(item.customer_id);
    if (item.sender_id) personIds.add(item.sender_id);
  });

  bookingMap.forEach((b) => {
    personIds.add(b.professional_id);
    personIds.add(b.customer_id);
  });

  let peopleMap = new Map<string, { full_name: string | null; email: string | null }>();

  if (personIds.size > 0) {
    const { data: people } = await service
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(personIds));

    peopleMap = new Map((people || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
  }

  const enrichedItems =
    type === "messages"
      ? items.map((item: any) => ({ ...item, booking: bookingMap.get(item.booking_id) || null }))
      : items;

  return NextResponse.json({ items: enrichedItems, people: Object.fromEntries(peopleMap) });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, id } = await req.json();

  const config = TABLES[type];
  if (!config || !id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const service = getServiceSupabase();

  const { error } = await service.from(config.table).delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
