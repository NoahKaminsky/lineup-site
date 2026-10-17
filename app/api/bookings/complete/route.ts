import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { completeBooking, requestBookingCompletion } from "@/app/lib/bookingCompletion";
import { hasAppointmentEnded } from "@/app/lib/bookingTime";
import { sendPushToUser } from "@/app/lib/push";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";

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

    // Completion releases the professional's payout, so it can't happen
    // before the appointment is actually over (checked in the booking's own
    // time zone; the server runs in UTC).
    if (!hasAppointmentEnded(booking.booking_date, booking.end_time)) {
      return NextResponse.json(
        { error: "This appointment hasn't finished yet. You can mark it complete once it's over." },
        { status: 409 }
      );
    }

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

      // The moment the customer needs to act: confirming is what pays the pro.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.lineup-aesthetics.ca";
      await sendPushToUser(booking.customer_id, {
        title: "Confirm your appointment is complete",
        body: `${cleanServiceLabel(booking.service_name) || "Your service"} is marked done. Tap to confirm so your professional gets paid.`,
        url: `${siteUrl}/bookings/${booking.id}`,
      }).catch((error) => console.error("Completion-request push failed:", error));

      return NextResponse.json({ ok: true });
    }

    // action === "confirm"
    if (!isCustomer) {
      return NextResponse.json({ error: "Only the customer can confirm completion" }, { status: 403 });
    }

    // The customer can confirm as soon as the appointment is over (checked
    // above), whether or not the pro has marked it done yet.
    if (booking.status !== "completion_requested" && booking.status !== "confirmed") {
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

    {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.lineup-aesthetics.ca";
      await sendPushToUser(booking.professional_id, {
        title: "Confirmed complete",
        body: `Your client confirmed ${cleanServiceLabel(booking.service_name) || "the service"}. Your payout is on its way.`,
        url: `${siteUrl}/bookings/${booking.id}`,
      }).catch((error) => console.error("Completion-confirmed push failed:", error));
    }

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
