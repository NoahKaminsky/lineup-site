import { stripe } from "@/app/lib/stripe";
import { getServiceSupabase, getProfileEmail } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";

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
      "id, request_id, professional_id, customer_id, service_name, status, payout_status, remaining_payout_cents, stripe_final_transfer_id"
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
    // service_requests has no completed_at/completion_requested_at columns —
    // including them here makes Postgres reject the whole update, so status
    // silently never changes. status is the only column that exists to set.
    const { error: requestSyncError } = await supabase
      .from("service_requests")
      .update({ status: "completed" })
      .eq("id", booking.request_id);

    if (requestSyncError) {
      console.error(`Failed to sync service_requests ${booking.request_id} to completed:`, requestSyncError);
    }
  }

  if (booking.remaining_payout_cents && booking.remaining_payout_cents > 0) {
    await releaseRemainingPayout(supabase, booking, trigger);
  }

  // Best-effort — reviews are the only way this platform builds trust, and
  // right now nothing ever prompts a customer to leave one unless they
  // happen to come back to this exact booking on their own. A failure here
  // (email provider down, etc.) shouldn't undo the completion itself.
  notifyCustomerForReview(supabase, booking, trigger).catch((error) => {
    console.error(`Failed to send review request for booking ${booking.id}:`, error);
  });

  return { ok: true, alreadyCompleted: false };
}

async function notifyCustomerForReview(
  supabase: ReturnType<typeof getServiceSupabase>,
  booking: { id: string; request_id: string | null; professional_id: string; customer_id: string; service_name: string | null },
  trigger: string
) {
  // When the customer confirms in the app, the review sheet opens right
  // there, so no bell notification, push or text is needed. Only an
  // auto-completed booking (customer never confirmed) gets a review email.
  if (trigger !== "auto") return;

  // Already reviewed (shouldn't normally happen right at completion, but the
  // auto-complete cron and a manual confirm could theoretically race) —
  // don't prompt for a review that already exists.
  const { data: existingReview } = await supabase
    .from("professional_reviews")
    .select("id")
    .or([`booking_id.eq.${booking.id}`, booking.request_id ? `request_id.eq.${booking.request_id}` : null].filter(Boolean).join(","))
    .maybeSingle();

  if (existingReview) return;

  const [customer, professional] = await Promise.all([
    getProfileEmail(supabase, booking.customer_id),
    supabase.from("profiles").select("full_name").eq("id", booking.professional_id).maybeSingle(),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";
  const reviewUrl = booking.request_id ? `${siteUrl}/requests/${booking.request_id}` : `${siteUrl}/bookings/${booking.id}`;
  const serviceLabel = booking.service_name || "your service";
  const professionalName = professional.data?.full_name || "your professional";

  if (!customer.email) return;

  const html = createEmailLayout({
    title: "How did it go?",
    preview: `Rate your experience with ${professionalName} on LineUp.`,
    ctaLabel: "Leave a review",
    ctaUrl: reviewUrl,
    content: `
      <p style="margin:0 0 16px 0;">Your booking for <strong>${escapeHtml(serviceLabel)}</strong> with <strong>${escapeHtml(
      professionalName
    )}</strong> is complete.</p>
      <p style="margin:0 0 16px 0;">A quick rating helps other clients book with confidence, and helps ${escapeHtml(
        professionalName
      )} build their track record on LineUp. It only takes a minute.</p>
    `,
  });

  await sendEmail({
    to: customer.email,
    subject: `How was your ${serviceLabel}?`,
    html,
  });
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
    const { error: requestSyncError } = await supabase
      .from("service_requests")
      .update({ status: "completion_requested" })
      .eq("id", booking.request_id);

    if (requestSyncError) {
      console.error(`Failed to sync service_requests ${booking.request_id} to completion_requested:`, requestSyncError);
    }
  }

  return { ok: true, alreadyCompleted: false };
}
