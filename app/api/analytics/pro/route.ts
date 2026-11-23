import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { analyticsAccess } from "@/app/lib/analyticsMetrics";
import { bearer, readQuery } from "@/app/lib/analyticsQuery";
import { sectionCsv } from "@/app/lib/analyticsCsv";
import { BASIC_SECTIONS, SECTIONS, section, type SectionName } from "@/app/lib/proAnalytics";

// GET /api/analytics/pro?section=overview&period=month|week|quarter|year|custom
//     [&from=&to=] [&compare=previous|last_year] [&service=Name] [&format=csv]
// One section of the signed-in pro's Analytics. Only ever their own data.
// Plans exactly as app/lib/plans.ts: no plan -> 402 (the page shows a
// labelled example); Apprentice -> the overview only; Pro, Master and shop
// members -> everything.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const started = Date.now();
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const url = new URL(req.url);
    const name = url.searchParams.get("section") as SectionName;
    if (!SECTIONS.includes(name)) return NextResponse.json({ error: "Unknown section." }, { status: 400 });

    const db = getServiceSupabase();
    const { data: profile } = await db.from("profiles").select("role, full_name, subscription_plan, subscription_status").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) return NextResponse.json({ error: "Analytics are for professionals." }, { status: 403 });
    const studio = await getStudioForUser(db, user.id).catch(() => null);
    const access = analyticsAccess({ ...profile, studioMember: !!studio && isStudioLive(studio.studio) });
    if (access === "none") return NextResponse.json({ error: "Analytics come with Apprentice, Pro and Master.", needsPlan: true }, { status: 402 });
    if (access === "basic" && !BASIC_SECTIONS.includes(name)) return NextResponse.json({ locked: true, access }, { status: 200 });

    const today = todayLocal();
    const q = readQuery(url, today);
    if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });

    const data = await section(name, { db, proId: user.id, today, period: q.period, compare: q.compare, service: q.service, accessToken: bearer(req), access });
    if (url.searchParams.get("format") === "csv") {
      const csv = sectionCsv(name, data, { name: profile?.full_name || "LineUp", from: q.period.from, to: q.period.to, compareFrom: q.compare.from, compareTo: q.compare.to });
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lineup-analytics-${name}-${q.period.from}-${q.period.to}.csv"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ section: name, access, today, period: q.period, compare: q.compare, ...data, ms: Date.now() - started });
  } catch (error) {
    console.error("GET /api/analytics/pro failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load this section.") }, { status: 500 });
  }
}
