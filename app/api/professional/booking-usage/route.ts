import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

function getMonthlyBookingCap(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";

  if (!subscribed || !profile.subscription_plan) return 15; // Basic
  if (profile.subscription_plan === "apprentice") return 25;
  return null; // Pro / Master — unlimited
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("subscription_status, subscription_plan")
    .eq("id", user.id)
    .single();

  const cap = getMonthlyBookingCap(profile || {});

  if (cap === null) {
    return NextResponse.json({ cap: null, count: 0 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Only request/offer-sourced jobs count toward the cap — direct calendar
  // bookings are never gated by this limit.
  const { count } = await service
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", user.id)
    .eq("source", "request")
    .in("status", ["confirmed", "completion_requested", "completed"])
    .gte("booking_date", monthStart)
    .lte("booking_date", monthEnd);

  return NextResponse.json({ cap, count: count || 0 });
}
