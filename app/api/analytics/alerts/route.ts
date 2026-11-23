import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { analyticsAccess } from "@/app/lib/analyticsMetrics";
import { refreshAlerts } from "@/app/lib/shopAnalytics";

// GET /api/analytics/alerts?scope=me|shop
// The alerts for the signed-in pro, or their shop (owner and managers).
// New ones are saved, so the same alert never shows twice in its window.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const db = getServiceSupabase();
    const ctx = await getStudioForUser(db, user.id).catch(() => null);
    if (new URL(req.url).searchParams.get("scope") === "shop") {
      if (!ctx?.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's alerts." }, { status: 403 });
      if (!isStudioLive(ctx.studio)) return NextResponse.json({ alerts: [] });
      return NextResponse.json({ alerts: await refreshAlerts(db, { studio: ctx.studio }, todayLocal()) });
    }
    const { data: profile } = await db.from("profiles").select("role, subscription_plan, subscription_status").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) return NextResponse.json({ error: "Analytics are for professionals." }, { status: 403 });
    if (analyticsAccess({ ...profile, studioMember: !!ctx && isStudioLive(ctx.studio) }) !== "full") return NextResponse.json({ alerts: [] });
    return NextResponse.json({ alerts: await refreshAlerts(db, { proId: user.id }, todayLocal()) });
  } catch (error) {
    console.error("GET /api/analytics/alerts failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load alerts.") }, { status: 500 });
  }
}
