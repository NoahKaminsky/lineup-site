import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { analyticsAccess } from "@/app/lib/analyticsMetrics";
import { bearer, readQuery } from "@/app/lib/analyticsQuery";
import { section } from "@/app/lib/proAnalytics";
import { shopSection } from "@/app/lib/shopAnalytics";
import { summaryInput } from "@/app/lib/analyticsSummary";
import { renderAnalyticsSummaryPdf } from "@/app/lib/analyticsPdf";

// GET /api/analytics/summary?scope=me|shop&period=...  a one-page PDF of the
// chosen dates, from the same section data as the screen.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const url = new URL(req.url);
    const db = getServiceSupabase();
    const today = todayLocal();
    const q = readQuery(url, today);
    if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
    const ctx = await getStudioForUser(db, user.id).catch(() => null);
    const compareLabel = q.mode === "last_year" ? "same dates last year" : "period before";
    let input;
    if (url.searchParams.get("scope") === "shop") {
      if (!ctx?.canManage) return NextResponse.json({ error: "Only the owner and managers can download this." }, { status: 403 });
      if (!isStudioLive(ctx.studio)) return NextResponse.json({ error: "Shop analytics come with a Studio plan.", needsPlan: true }, { status: 402 });
      const c = { db, studio: ctx.studio, userId: user.id, today, period: q.period, compare: q.compare, service: q.service, accessToken: bearer(req) };
      const [overview, forecast, mix, extra] = await Promise.all([shopSection("overview", c), shopSection("forecast", c), shopSection("channels", c), shopSection("team", c)]);
      input = summaryInput("shop", { name: ctx.studio.name, from: q.period.from, to: q.period.to, compareLabel }, { overview, forecast, mix, extra });
    } else {
      const { data: profile } = await db.from("profiles").select("role, full_name, subscription_plan, subscription_status").eq("id", user.id).maybeSingle();
      const role = String(profile?.role || "").toLowerCase();
      if (!role || role.includes("customer")) return NextResponse.json({ error: "Analytics are for professionals." }, { status: 403 });
      const access = analyticsAccess({ ...profile, studioMember: !!ctx && isStudioLive(ctx.studio) });
      if (access !== "full") return NextResponse.json({ error: "The summary PDF comes with Pro and Master.", needsPlan: true }, { status: 402 });
      const c = { db, proId: user.id, today, period: q.period, compare: q.compare, service: q.service, accessToken: bearer(req), access };
      const [overview, forecast, mix] = await Promise.all([section("overview", c), section("forecast", c), section("sources", c)]);
      input = summaryInput("me", { name: profile?.full_name || "Your analytics", from: q.period.from, to: q.period.to, compareLabel }, { overview, forecast, mix });
    }
    const pdf = await renderAnalyticsSummaryPdf(input);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="lineup-analytics-${q.period.from}-${q.period.to}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/analytics/summary failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not make the PDF.") }, { status: 500 });
  }
}
