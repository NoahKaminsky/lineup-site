// The monthly request-booking cap, in one place (checkout, the webhook's
// "nearing your limit" notice and the pro's usage meter all use it).
// Only request/offer bookings count; direct calendar bookings never do.
import type { SupabaseClient } from "@supabase/supabase-js";

export function getMonthlyBookingCap(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";

  if (!subscribed) return 15; // Basic
  if (profile.subscription_plan === "apprentice") return 25;
  if (profile.subscription_plan === "pro" || profile.subscription_plan === "master") return null; // unlimited
  return 15; // anything unrecognised gets the Basic limit, never unlimited
}

// First and last day of the current month (server time), as YYYY-MM-DD.
export function capMonthRange(now = new Date()) {
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    monthEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export async function countRequestBookingsThisMonth(supabase: SupabaseClient, professionalId: string) {
  const { monthStart, monthEnd } = capMonthRange();
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("source", "request")
    .in("status", ["confirmed", "completion_requested", "completed"])
    .gte("booking_date", monthStart)
    .lte("booking_date", monthEnd);
  return count || 0;
}
