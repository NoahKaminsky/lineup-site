import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { completeBooking, requestBookingCompletion } from "@/app/lib/bookingCompletion";

export async function POST(req: Request) {
  try {
    const { bookingId, requestId, action } = await req.json();

    if (!bookingId && !requestId) {
      return NextResponse.json({ error: "Missing bookingId or requestId" }, { status: 400 });
    }

    if (action !== "request" && action !== "confirm") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const bookingQuery = supabase.from("bookings").select("*");

    const { data: booking, error: bookingError } = bookingId
      ? await bookingQuery.eq("id", bookingId).single()
      : await bookingQuery.eq("request_id", requestId).single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isCustomer = user.id === booking.customer_id;
    const isProfessional = user.id === booking.professional_id;

    if (action === "request") {
      if (!isProfessional) {
        return NextResponse.json({ error: "Only the professional can request completion" }, { status: 403 });
      }

      if (booking.status !== "confirmed") {
        return NextResponse.json({ error: "This booking isn't ready to be marked complete" }, { status: 409 });
      }

      const result = await requestBookingCompletion(booking.id);

      if (!result.ok) {
        return NextResponse.json({ error: result.error || "Failed to request completion" }, { status: 500 });
      }

      await supabase.from("notifications").insert([
        {
          user_id: booking.customer_id,
          request_id: booking.request_id || null,
          is_read: false,
          type: "completion_requested",
          title: `${booking.service_name || "Your service"} is marked done — confirm to wrap it up`,
        },
      ]);

      return NextResponse.json({ ok: true });
    }

    // action === "confirm"
    if (!isCustomer) {
      return NextResponse.json({ error: "Only the customer can confirm completion" }, { status: 403 });
    }

    if (booking.status !== "completion_requested") {
      return NextResponse.json({ error: "This booking isn't awaiting confirmation" }, { status: 409 });
    }

    const result = await completeBooking(booking.id, "manual");

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Failed to confirm completion" }, { status: 500 });
    }

    await supabase.from("notifications").insert([
      {
        user_id: booking.professional_id,
        request_id: booking.request_id || null,
        is_read: false,
        type: "booking_completed",
        title: `${booking.service_name || "Your service"} was confirmed complete`,
      },
    ]);

    const { data: existingReview } = await supabase
      .from("professional_reviews")
      .select("id")
      .or(
        [booking.id ? `booking_id.eq.${booking.id}` : null, booking.request_id ? `request_id.eq.${booking.request_id}` : null]
          .filter(Boolean)
          .join(",")
      )
      .maybeSingle();

    return NextResponse.json({ ok: true, needsReview: !existingReview });
  } catch (error: any) {
    console.error("booking complete failed:", error);

    return NextResponse.json(
      { error: error?.message || "Completion failed" },
      { status: 500 }
    );
  }
}
