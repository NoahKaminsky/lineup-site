import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

// How many pros have bid on each request, for the "2 pros have bid on this
// already" blip pros see before they send their own offer. Pros can't read
// each other's offers directly (row-level security), so this returns counts
// only — never who bid or for how much.
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const requestIds: string[] = Array.isArray(body?.requestIds)
      ? body.requestIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 200)
      : [];

    if (requestIds.length === 0) return NextResponse.json({ counts: {} });

    const supabase = getServiceSupabase();

    const { data: offers, error } = await supabase
      .from("request_offers")
      .select("request_id, professional_id, status")
      .in("request_id", requestIds)
      .neq("status", "withdrawn");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Distinct pros per request; a pro who re-offered counts once. The asking
    // user is left out so their own offer never shows up as "other pros".
    const prosByRequest = new Map<string, Set<string>>();
    for (const offer of offers || []) {
      if (offer.professional_id === user.id) continue;
      if (!prosByRequest.has(offer.request_id)) prosByRequest.set(offer.request_id, new Set());
      prosByRequest.get(offer.request_id)!.add(offer.professional_id);
    }

    const counts: Record<string, number> = {};
    for (const [requestId, pros] of prosByRequest) counts[requestId] = pros.size;

    return NextResponse.json({ counts });
  } catch (error: any) {
    console.error("bid-counts failed:", error);
    return NextResponse.json({ error: error?.message || "Could not load bid counts" }, { status: 500 });
  }
}
