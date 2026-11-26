import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { cleanReview } from "@/app/lib/shopProfile";

// Shop reviews. Only a client with a completed booking at the shop can
// review it, once per visit; the shop's owner and managers can reply.
// GET   ?bookingId=  -> { shopName, canReview, review } for the booking page
// POST  { bookingId, rating, comment? }
// PATCH { id, reply }  (empty reply removes it)

async function bookingFor(bookingId: string, userId: string) {
  const supabase = getServiceSupabase();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, status, studio_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== userId || !booking.studio_id) return { supabase, booking: null, studio: null };
  const { data: studio } = await supabase.from("studios").select("id, name").eq("id", booking.studio_id).maybeSingle();
  return { supabase, booking, studio };
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const bookingId = new URL(req.url).searchParams.get("bookingId") || "";
  const { supabase, booking, studio } = await bookingFor(bookingId, user.id);
  if (!booking || !studio) return NextResponse.json({ shopName: null, canReview: false, review: null });
  const { data: review } = await supabase.from("studio_reviews").select("id, rating, comment, reply").eq("booking_id", booking.id).maybeSingle();
  return NextResponse.json({ shopName: studio.name, canReview: booking.status === "completed" && !review, review: review || null });
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { supabase, booking, studio } = await bookingFor(String(body.bookingId || ""), user.id);
    if (!booking || !studio) return NextResponse.json({ error: "You can only review a shop you've booked with." }, { status: 403 });
    if (booking.status !== "completed") return NextResponse.json({ error: "You can review the shop once your visit is complete." }, { status: 400 });
    const clean = cleanReview(body);
    if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 });
    const { error } = await supabase
      .from("studio_reviews")
      .insert({ studio_id: studio.id, reviewer_id: user.id, booking_id: booking.id, rating: clean.rating, comment: clean.comment });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "You've already reviewed this visit." }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/shop-reviews failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save your review.") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only the shop's owner and managers can reply." }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reply = String(body.reply ?? "").trim();
    if (reply.length > 1000) return NextResponse.json({ error: "Keep your reply under 1,000 characters." }, { status: 400 });
    const { data, error } = await supabase
      .from("studio_reviews")
      .update({ reply: reply || null, replied_at: reply ? new Date().toISOString() : null })
      .eq("id", String(body.id || ""))
      .eq("studio_id", ctx.studio.id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "That review isn't on your shop." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/shop-reviews failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save your reply.") }, { status: 500 });
  }
}
