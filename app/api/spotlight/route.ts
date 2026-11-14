import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";

// POST /api/spotlight { professionalId, kind: "view" | "tap", surface? }
//   Logs one Spotlight impression or tap (surface "explore"), or one visit to
//   a pro's profile page (kind "view", surface "profile") for Analytics. Explore is public, so no login is
//   needed; the viewer is recorded when there is one. The browser already
//   dedupes views per visit, and a pro's own views aren't counted.
// GET /api/spotlight
//   The signed-in pro's views and taps for the last 7 and 30 days.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const professionalId = typeof body?.professionalId === "string" ? body.professionalId : "";
  const kind = body?.kind === "view" || body?.kind === "tap" ? body.kind : null;
  const surface = body?.surface === "profile" ? "profile" : "explore";
  if (!UUID.test(professionalId) || !kind) return NextResponse.json({ ok: false }, { status: 400 });

  const viewer = await getAuthenticatedUser(req).catch(() => null);
  if (viewer?.id === professionalId) return NextResponse.json({ ok: true, skipped: "own" });

  const { error } = await getServiceSupabase()
    .from("spotlight_events")
    .insert({ professional_id: professionalId, kind, surface, viewer_id: viewer?.id ?? null });
  // Missing table (migration not run yet) shouldn't break Explore.
  if (error) console.warn("spotlight event not logged:", error.message);
  return NextResponse.json({ ok: !error });
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since7 = Date.now() - 7 * 86_400_000;
  const { data, error } = await supabase
    .from("spotlight_events")
    .select("kind, created_at")
    .eq("professional_id", user.id)
    .eq("surface", "explore")
    .gte("created_at", since30)
    .limit(20000);
  if (error) return NextResponse.json({ week: { views: 0, taps: 0 }, month: { views: 0, taps: 0 }, ready: false });
  const tally = (rows: { kind: string }[]) => ({
    views: rows.filter((r) => r.kind === "view").length,
    taps: rows.filter((r) => r.kind === "tap").length,
  });
  const rows = data || [];
  return NextResponse.json({
    ready: true,
    week: tally(rows.filter((r) => new Date(r.created_at).getTime() >= since7)),
    month: tally(rows),
  });
}
