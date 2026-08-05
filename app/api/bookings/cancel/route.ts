import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    const { bookingId, requestId } = await req.json();

    if (!bookingId && !requestId) {
      return NextResponse.json({ error: "Missing bookingId or requestId" }, { status: 400 });
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

    if (!isCustomer && !isProfessional) {
      return NextResponse.json({ error: "Not authorized to cancel this booking" }, { status: 403 });
    }

    if (booking.status !== "confirmed" && booking.status !== "completion_requested") {
      return NextResponse.json({ error: "This booking can no longer be cancelled" }, { status: 409 });
    }

    const cancelledAt = new Date().toISOString();

    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_by: user.id,
        cancelled_at: cancelledAt,
      })
      .eq("id", booking.id)
      .in("status", ["confirmed", "completion_requested"]);

    if (updateBookingError) {
      return NextResponse.json({ error: updateBookingError.message }, { status: 500 });
    }

    if (booking.request_id) {
      await supabase
        .from("service_requests")
        .update({ status: "cancelled", cancelled_at: cancelledAt })
        .eq("id", booking.request_id);
    }

    const otherPartyId = isCustomer ? booking.professional_id : booking.customer_id;

    if (otherPartyId) {
      await supabase.from("notifications").insert([{
        user_id: otherPartyId,
        request_id: booking.request_id || null,
        is_read: false,
        type: "booking_cancelled",
        title: `${booking.service_name || "Your booking"} was cancelled by ${
          isCustomer ? "the customer" : "the professional"
        }`,
      }]);
    }

    return NextResponse.json({ ok: true, cancelledAt });
  } catch (error: any) {
    console.error("booking cancel failed:", error);

    return NextResponse.json(
      { error: error?.message || "Cancellation failed" },
      { status: 500 }
    );
  }
}
