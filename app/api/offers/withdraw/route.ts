import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

// A pro takes back an offer they sent. Only their own offer, only while it's
// still pending (once the client is paying or has accepted, it's a booking
// and has to be cancelled from there instead). Done server-side so it works
// regardless of row-level-security on request_offers, and clears the
// client's "new offer" notification in the same step.
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
      .select("id, professional_id, status")
      .eq("id", offerId)
      .maybeSingle();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.professional_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (offer.status === "withdrawn") return NextResponse.json({ ok: true });
    if (offer.status !== "pending") {
      return NextResponse.json(
        { error: "This offer can't be withdrawn anymore — the client has already responded to it." },
        { status: 409 }
      );
    }

    const { data: updated, error } = await supabase
      .from("request_offers")
      .update({ status: "withdrawn" })
      .eq("id", offerId)
      .eq("professional_id", user.id)
      .eq("status", "pending")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "This offer can't be withdrawn anymore — the client has already responded to it." },
        { status: 409 }
      );
    }

    await supabase.from("notifications").delete().eq("offer_id", offerId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("withdraw offer failed:", error);
    return NextResponse.json({ error: error?.message || "Could not withdraw offer" }, { status: 500 });
  }
}
