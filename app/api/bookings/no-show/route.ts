import { NextResponse } from "next/server";
import { getAuthenticatedUser, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { markNoShow } from "@/app/lib/payAtShop";

// POST /api/bookings/no-show { bookingId } — the pro (or a studio manager)
// marks a "pay at the shop" client as a no-show, which charges the shop's
// no-show fee to the card they saved when booking.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.bookingId !== "string") return NextResponse.json({ error: "Missing booking." }, { status: 400 });

    const result = await markNoShow(body.bookingId, user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/bookings/no-show failed:", error);
    return NextResponse.json({ error: "Could not mark the no-show." }, { status: 500 });
  }
}
