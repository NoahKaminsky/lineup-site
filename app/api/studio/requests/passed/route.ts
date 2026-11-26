import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

// GET /api/studio/requests/passed[?requestId=]
// The open requests a shop owner or manager passed to the signed-in pro, with
// who passed it and from which shop, so Home can put them first and the
// request page can say so. Only ever the caller's own passes.
export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const db = getServiceSupabase();
  const requestId = new URL(req.url).searchParams.get("requestId");
  let q = db.from("studio_request_passes").select("request_id, passed_by, studio_id, created_at").eq("professional_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (requestId) q = q.eq("request_id", requestId);
  const { data: passes } = await q;
  if (!passes?.length) return NextResponse.json({ passed: [] });
  const [{ data: people }, { data: studios }] = await Promise.all([
    db.from("profiles").select("id, full_name").in("id", [...new Set(passes.map((p) => p.passed_by as string))]),
    db.from("studios").select("id, name").in("id", [...new Set(passes.map((p) => p.studio_id as string))]),
  ]);
  const name = new Map((people || []).map((p) => [p.id as string, ((p.full_name as string) || "").split(" ")[0] || "Your shop"]));
  const shop = new Map((studios || []).map((s) => [s.id as string, (s.name as string) || "your shop"]));
  return NextResponse.json({
    passed: passes.map((p) => ({ requestId: p.request_id, by: name.get(p.passed_by as string) || "Your shop", shop: shop.get(p.studio_id as string) || "your shop" })),
  });
}
