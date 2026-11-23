import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { bearer, readQuery } from "@/app/lib/analyticsQuery";
import { sectionCsv } from "@/app/lib/analyticsCsv";
import { SHOP_SECTIONS, shopSection, type ShopSectionName } from "@/app/lib/shopAnalytics";
import { loadTimes, loadVisitsBy } from "@/app/lib/proAnalytics";
import { atRisk, overview, revenueSeries } from "@/app/lib/analyticsMetrics";

// GET /api/analytics/shop?section=overview|team|chairs|channels|clients|
//     memberships|rent|forecast|local [&period=...&from&to&compare&service]
//     [&format=csv]
// GET /api/analytics/shop?section=pro&pro=<id>  one pro's work at the shop.
// Owner and managers only; members get a 403 and keep their own Analytics.
// Every live Studio and Studio Plus shop gets every section (plans.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const started = Date.now();
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const timing: Record<string, number> = { auth: Date.now() - started };
    const url = new URL(req.url);
    const name = url.searchParams.get("section") || "";
    if (name !== "pro" && !SHOP_SECTIONS.includes(name as ShopSectionName)) return NextResponse.json({ error: "Unknown section." }, { status: 400 });

    const db = getServiceSupabase();
    const ctx = await getStudioForUser(db, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 });
    if (!ctx.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's analytics." }, { status: 403 });
    if (!isStudioLive(ctx.studio)) return NextResponse.json({ error: "Shop analytics come with a Studio plan.", needsPlan: true }, { status: 402 });
    timing.studio = Date.now() - started;

    const today = todayLocal();
    const q = readQuery(url, today);
    if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });

    if (name === "pro") {
      // One pro's work at this shop only (never their solo clients).
      const proId = url.searchParams.get("pro") || "";
      const { data: member } = await db.from("studio_members").select("profile_id").eq("studio_id", ctx.studio.id).eq("profile_id", proId).maybeSingle();
      if (!member) return NextResponse.json({ error: "That pro isn't on your team." }, { status: 404 });
      const visits = (await loadVisitsBy(db, "studio_id", ctx.studio.id, today)).filter((v) => v.proId === proId);
      const { data: pro } = await db.from("profiles").select("full_name").eq("id", proId).maybeSingle();
      const svc = new Map<string, { count: number; revenue: number }>();
      for (const v of visits.filter((x) => x.state === "done" && !x.imported && x.date >= q.period.from && x.date <= q.period.to)) {
        const s = svc.get(v.service) || { count: 0, revenue: 0 };
        s.count++;
        s.revenue += v.sales;
        svc.set(v.service, s);
      }
      return NextResponse.json({
        section: "pro",
        name: pro?.full_name || "Team member",
        ...overview(visits, q.period, q.compare, today),
        series: revenueSeries(visits, q.period, q.compare),
        services: [...svc.entries()].map(([label, s]) => ({ label, ...s })).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
        overdue: atRisk(visits, today).length,
        ms: Date.now() - started,
      });
    }

    const data = await shopSection(name as ShopSectionName, { db, studio: ctx.studio, userId: user.id, today, period: q.period, compare: q.compare, service: q.service, accessToken: bearer(req) });
    if (url.searchParams.get("format") === "csv") {
      const csv = sectionCsv(name, data, { name: ctx.studio.name, from: q.period.from, to: q.period.to, compareFrom: q.compare.from, compareTo: q.compare.to });
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lineup-shop-analytics-${name}-${q.period.from}-${q.period.to}.csv"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ section: name, today, period: q.period, compare: q.compare, ...data, ms: Date.now() - started, timing: { ...timing, ...Object.fromEntries(loadTimes) } });
  } catch (error) {
    console.error("GET /api/analytics/shop failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load this section.") }, { status: 500 });
  }
}
