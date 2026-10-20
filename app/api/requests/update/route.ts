import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { containsProfanity } from "@/app/lib/profanityFilter";

// A client edits their own request. Only while it's still open and no offer
// has been accepted (or is mid-payment) — after that it's a booking. Pros who
// already sent an offer get a heads-up that the details changed.
const LOCKED_OFFER_STATUSES = ["accepted", "payment_pending"];
const TIMING_OPTIONS = ["exact", "flexible", "anytime"];

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const requestId = typeof body?.requestId === "string" ? body.requestId : null;
    if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

    const title = cleanText(body.title, 120);
    const description = cleanText(body.description, 2000);
    const budget = cleanText(body.budget, 60);
    const timing = TIMING_OPTIONS.includes(body.timing_flexibility) ? body.timing_flexibility : "exact";
    const preferredDate =
      timing === "anytime" ? null : /^\d{4}-\d{2}-\d{2}$/.test(body.preferred_date || "") ? body.preferred_date : null;
    const preferredStartTime =
      timing === "anytime" ? null : /^\d{2}:\d{2}(:\d{2})?$/.test(body.preferred_start_time || "") ? body.preferred_start_time : null;

    if (!title) return NextResponse.json({ error: "Give your request a title." }, { status: 400 });
    if (timing !== "anytime" && (!preferredDate || !preferredStartTime)) {
      return NextResponse.json({ error: "Pick a date and start time, or choose “Anytime”." }, { status: 400 });
    }
    if (containsProfanity(title) || containsProfanity(description) || containsProfanity(budget)) {
      return NextResponse.json({ error: "Please remove inappropriate language from your request." }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: request } = await supabase
      .from("service_requests")
      .select("id, client_id, status, title")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (request.client_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (request.status !== "open") {
      return NextResponse.json({ error: "This request can't be edited anymore." }, { status: 409 });
    }

    const { data: offers } = await supabase
      .from("request_offers")
      .select("professional_id, status")
      .eq("request_id", requestId);

    if ((offers || []).some((offer) => LOCKED_OFFER_STATUSES.includes(offer.status))) {
      return NextResponse.json(
        { error: "You've already accepted an offer, so this request can't be edited." },
        { status: 409 }
      );
    }

    const updates = {
      title,
      description,
      budget,
      timing_flexibility: timing,
      preferred_date: preferredDate,
      preferred_start_time: preferredStartTime,
    };

    const { data: updated, error } = await supabase
      .from("service_requests")
      .update(updates)
      .eq("id", requestId)
      .eq("client_id", user.id)
      .eq("status", "open")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "This request can't be edited anymore." }, { status: 409 });
    }

    // Let pros with a live offer know the details changed so they can adjust.
    const prosToTell = [
      ...new Set((offers || []).filter((offer) => offer.status === "pending").map((offer) => offer.professional_id)),
    ];
    if (prosToTell.length > 0) {
      await supabase.from("notifications").insert(
        prosToTell.map((professionalId) => ({
          user_id: professionalId,
          request_id: requestId,
          is_read: false,
          type: "request_updated",
          title: `A request you offered on was updated: ${title}`,
        }))
      );
    }

    return NextResponse.json({ ok: true, request: updates });
  } catch (error: any) {
    console.error("update request failed:", error);
    return NextResponse.json({ error: error?.message || "Could not update request" }, { status: 500 });
  }
}
