import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { countRequestBookingsThisMonth, getMonthlyBookingCap } from "@/app/lib/bookingCap";

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

  const count = await countRequestBookingsThisMonth(service, user.id);

  return NextResponse.json({ cap, count: count || 0 });
}
