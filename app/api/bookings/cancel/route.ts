import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

const CANCELLATION_CUTOFF_HOURS = 24;

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

    // Cancellations are only allowed more than 24 hours before the appointment.
    // Both sides are told this policy when the booking is made, so this should
    // never trip for a good-faith cancellation.
    const appointmentAt = new Date(`${booking.booking_date}T${booking.start_time}`);
    const hoursUntilAppointment = (appointmentAt.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < CANCELLATION_CUTOFF_HOURS) {
      return NextResponse.json(
        {
          error: `Bookings can only be cancelled more than ${CANCELLATION_CUTOFF_HOURS} hours before the appointment. Message the ${
            isCustomer ? "professional" : "client"
          } directly if something's come up.`,
        },
        { status: 403 }
      );
    }

    // Refund the customer before touching the booking status — if the refund
    // fails, we want the booking to stay as-is rather than silently cancel
    // without the customer actually getting their money back.
    let refundStatus: string | null = null;
    let stripeRefundId: string | null = null;

    if (booking.stripe_payment_intent_id) {
      try {
        // Deposits are transferred to the professional's connected account as
        // soon as the booking is confirmed (separate charges & transfers), so
        // refunding the PaymentIntent alone would leave the platform covering
        // that amount out of its own balance. Reverse it first.
        if (booking.stripe_deposit_transfer_id) {
          try {
            await stripe.transfers.createReversal(booking.stripe_deposit_transfer_id);
          } catch (reversalError) {
            console.error("Deposit transfer reversal failed:", reversalError);
          }
        }

        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
        });

        refundStatus = "refunded";
        stripeRefundId = refund.id;
      } catch (refundError) {
        console.error("Booking cancellation refund failed:", refundError);
        const message = refundError instanceof Error ? refundError.message : null;
        return NextResponse.json(
          {
            error: message || "Could not process the refund. Please contact support instead of retrying.",
          },
          { status: 502 }
        );
      }
    }

    const cancelledAt = new Date().toISOString();

    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_by: user.id,
        cancelled_at: cancelledAt,
        refund_status: refundStatus,
        stripe_refund_id: stripeRefundId,
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
        }${refundStatus === "refunded" ? " — full refund issued" : ""}`,
      }]);
    }

    return NextResponse.json({ ok: true, cancelledAt, refundStatus });
  } catch (error: any) {
    console.error("booking cancel failed:", error);

    return NextResponse.json(
      { error: error?.message || "Cancellation failed" },
      { status: 500 }
    );
  }
}
