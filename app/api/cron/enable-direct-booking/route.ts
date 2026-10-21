import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";

// One-off catch-up: turn instant booking on for every pro who is already
// paying (Apprentice / Pro / Master, active or trialing) but still has it
// off. New subscriptions get it automatically; this covers pros who were
// paying before that existed. Run by .github/workflows/enable-direct-booking.yml.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getServiceSupabase();

  const { data: candidates, error } = await service
    .from("profiles")
    .select("id, direct_booking_enabled, public_availability_enabled")
    .in("subscription_plan", ["apprentice", "pro", "master"])
    .in("subscription_status", ["active", "trialing"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (candidates || [])
    .filter((p) => !p.direct_booking_enabled || !p.public_availability_enabled)
    .map((p) => p.id);

  if (ids.length > 0) {
    const { error: updateError } = await service
      .from("profiles")
      .update({ direct_booking_enabled: true, public_availability_enabled: true })
      .in("id", ids);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paidPros: candidates?.length ?? 0, enabled: ids.length });
}
