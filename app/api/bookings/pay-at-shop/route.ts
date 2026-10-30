import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { createPayAtShopBooking, getPayAtShopTerms } from "@/app/lib/payAtShop";

// GET  /api/bookings/pay-at-shop?professionalId=… — can clients of this pro
//      book now and pay at the shop, and what's the no-show fee? (Public.)
// POST /api/bookings/pay-at-shop { setupIntentId } — the client's card is
//      saved; make the booking. (Started from /api/stripe/create-payment-intent
//      with payAtShop: true.)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const professionalId = new URL(req.url).searchParams.get("professionalId") || "";
  if (!UUID.test(professionalId)) return NextResponse.json({ available: false });

  try {
    const terms = await getPayAtShopTerms(getServiceSupabase(), professionalId);
    return NextResponse.json(
      terms.available
        ? { available: true, studioName: terms.studioName, noShowFeePercent: terms.noShowFeePercent }
        : { available: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ available: false });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const setupIntentId = typeof body?.setupIntentId === "string" ? body.setupIntentId : "";
    if (!setupIntentId.startsWith("seti_")) return NextResponse.json({ error: "Missing card setup." }, { status: 400 });

    const result = await createPayAtShopBooking(setupIntentId, user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, bookingId: result.bookingId });
  } catch (error) {
    console.error("POST /api/bookings/pay-at-shop failed:", error);
    return NextResponse.json({ error: "Could not make the booking." }, { status: 500 });
  }
}
