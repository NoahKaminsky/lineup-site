import { stripe } from "@/app/lib/stripe";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

type CompleteBookingResult = {
  ok: boolean;
  alreadyCompleted: boolean;
  error?: string;
};

// Marks a booking (and its linked request, if any) completed, and releases the
// remaining payout to the professional. Shared by the manual "confirm completion"
// API route and the 24h-past-appointment auto-complete cron so there's exactly
// one place that does the payout transfer.
export async function completeBooking(
  bookingId: string,
  trigger: "manual" | "auto"
): Promise<CompleteBookingResult> {
  const supabase = getServiceSupabase();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select(
      "id, request_id, professional_id, status, payout_status, remaining_payout_cents, stripe_final_transfer_id"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, alreadyCompleted: false, error: fetchError.message };
  }

  if (!booking) {
    return { ok: false, alreadyCompleted: false, error: "Booking not found." };
  }

  if (booking.status === "completed") {
    return { ok: true, alreadyCompleted: true };
  }

  const completedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", bookingId)
    .neq("status", "completed");

  if (updateError) {
    return { ok: false, alreadyCompleted: false, error: updateError.message };
  }

  if (booking.request_id) {
    await supabase
      .from("service_requests")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", booking.request_id);
  }

  if (booking.remaining_payout_cents && booking.remaining_payout_cents > 0) {
    await releaseRemainingPayout(supabase, booking, trigger);
  }

  return { ok: true, alreadyCompleted: false };
}

async function releaseRemainingPayout(
  supabase: ReturnType<typeof getServiceSupabase>,
  booking: {
    id: string;
    professional_id: string;
    remaining_payout_cents: number | null;
    stripe_final_transfer_id: string | null;
  },
  trigger: "manual" | "auto"
) {
  // Re-check right before transferring — narrows the window where a concurrent
  // caller (e.g. the auto-complete sweep firing the same moment someone manually
  // confirms) could otherwise trigger a duplicate transfer.
  const { data: latest } = await supabase
    .from("bookings")
    .select("stripe_final_transfer_id")
    .eq("id", booking.id)
    .maybeSingle();

  if (latest?.stripe_final_transfer_id) return;

  const { data: professionalProfile } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", booking.professional_id)
    .maybeSingle();

  if (!professionalProfile?.stripe_account_id) return;

  try {
    const transfer = await stripe.transfers.create({
      amount: booking.remaining_payout_cents!,
      currency: "cad",
      destination: professionalProfile.stripe_account_id,
      transfer_group: `booking_${booking.id}`,
      metadata: {
        flow_type: "final_payout",
        booking_id: booking.id,
        trigger,
      },
    });

    await supabase
      .from("bookings")
      .update({
        stripe_final_transfer_id: transfer.id,
        payout_status: "final_released",
      })
      .eq("id", booking.id);
  } catch (transferError) {
    // Completion itself already succeeded — a payout failure here (e.g. the
    // professional's Connect account isn't fully onboarded) shouldn't undo that.
    // Leaves stripe_final_transfer_id null so it can be retried later.
    console.error("Final payout transfer failed:", transferError);
  }
}

// Professional-side "request completion" — no payout, just the status hop that
// asks the customer to confirm.
export async function requestBookingCompletion(bookingId: string): Promise<CompleteBookingResult> {
  const supabase = getServiceSupabase();
  const completionRequestedAt = new Date().toISOString();

  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, request_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) return { ok: false, alreadyCompleted: false, error: fetchError.message };
  if (!booking) return { ok: false, alreadyCompleted: false, error: "Booking not found." };
  if (booking.status === "completed") return { ok: true, alreadyCompleted: true };

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "completion_requested", completion_requested_at: completionRequestedAt })
    .eq("id", bookingId)
    .eq("status", "confirmed");

  if (updateError) {
    return { ok: false, alreadyCompleted: false, error: updateError.message };
  }

  if (booking.request_id) {
    await supabase
      .from("service_requests")
      .update({
        status: "completion_requested",
        completion_requested_at: completionRequestedAt,
      })
      .eq("id", booking.request_id);
  }

  return { ok: true, alreadyCompleted: false };
}
