import { NextResponse } from "next/server";
import { requireAdmin, getServiceSupabase } from "@/app/lib/serverSupabase";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const service = getServiceSupabase();

  let query = service
    .from("profiles")
    .select("id, full_name, email, role, subscription_status, subscription_plan, is_admin, is_featured, is_founding_artist, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data || [] });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, subscriptionPlan, subscriptionStatus, isFeatured, isFoundingArtist } = await req.json();

  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const service = getServiceSupabase();

  // Featured toggle can be updated on its own, without touching plan/status.
  if (isFeatured !== undefined && subscriptionPlan === undefined && subscriptionStatus === undefined && isFoundingArtist === undefined) {
    const { error } = await service
      .from("profiles")
      .update({ is_featured: !!isFeatured })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Founding Artist toggle can also be updated on its own.
  if (isFoundingArtist !== undefined && subscriptionPlan === undefined && subscriptionStatus === undefined && isFeatured === undefined) {
    const { error } = await service
      .from("profiles")
      .update({ is_founding_artist: !!isFoundingArtist })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const validPlans = [null, "apprentice", "pro", "master"];
  const validStatuses = [null, "active", "trialing", "past_due", "canceled", "incomplete"];

  if (!validPlans.includes(subscriptionPlan ?? null)) {
    return NextResponse.json({ error: "Invalid subscription plan" }, { status: 400 });
  }

  if (!validStatuses.includes(subscriptionStatus ?? null)) {
    return NextResponse.json({ error: "Invalid subscription status" }, { status: 400 });
  }

  const isSubscribed =
    !!subscriptionPlan &&
    (subscriptionStatus === "active" || subscriptionStatus === "trialing");

  const { error } = await service
    .from("profiles")
    .update({
      subscription_plan: subscriptionPlan ?? null,
      subscription_status: subscriptionStatus ?? null,
      // Instant-booking calendar is meant to just work on any paid tier,
      // not require finding a settings toggle.
      ...(isSubscribed
        ? { direct_booking_enabled: true, public_availability_enabled: true }
        : { direct_booking_enabled: false, public_availability_enabled: false }),
    })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
