import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

// Clears the "new offer" notifications for an offer that was withdrawn or
// declined. Only someone involved in that offer (the professional who sent
// it or the customer who received it) may do this.
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { offerId } = await req.json();

    if (!offerId || typeof offerId !== "string") {
      return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: offer } = await supabase
      .from("request_offers")
      .select("id, professional_id, request_id")
      .eq("id", offerId)
      .maybeSingle();

    if (!offer) return NextResponse.json({ ok: true });

    let allowed = offer.professional_id === user.id;

    if (!allowed && offer.request_id) {
      const { data: request } = await supabase
        .from("service_requests")
        .select("client_id")
        .eq("id", offer.request_id)
        .maybeSingle();
      allowed = request?.client_id === user.id;
    }

    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await supabase.from("notifications").delete().eq("offer_id", offerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("clear-offer notification cleanup failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
