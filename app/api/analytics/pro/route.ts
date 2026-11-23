import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { analyticsAccess, checkPeriod, comparisonFor, periodFor, type CompareMode, type PeriodKind } from "@/app/lib/analyticsMetrics";
import { BASIC_SECTIONS, SECTIONS, section, type SectionName } from "@/app/lib/proAnalytics";

// GET /api/analytics/pro?section=overview&period=month|week|quarter|year|custom
//     [&from=&to=] [&compare=previous|last_year] [&service=Name]
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
    const { data: profile } = await db.from("profiles").select("role, subscription_plan, subscription_status").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) return NextResponse.json({ error: "Analytics are for professionals." }, { status: 403 });
    const studio = await getStudioForUser(db, user.id).catch(() => null);
    const access = analyticsAccess({ ...profile, studioMember: !!studio && isStudioLive(studio.studio) });
    if (access === "none") return NextResponse.json({ error: "Analytics come with Apprentice, Pro and Master.", needsPlan: true }, { status: 402 });
    if (access === "basic" && !BASIC_SECTIONS.includes(name)) return NextResponse.json({ locked: true, access }, { status: 200 });

    const today = todayLocal();
    const kind = (url.searchParams.get("period") || "month") as PeriodKind;
    const period =
      kind === "custom"
        ? { from: url.searchParams.get("from") || "", to: url.searchParams.get("to") || "" }
        : periodFor((["week", "month", "quarter", "year"].includes(kind) ? kind : "month") as Exclude<PeriodKind, "custom">, today);
    const bad = checkPeriod(period, today);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (period.to > today) period.to = today;
    const mode: CompareMode = url.searchParams.get("compare") === "last_year" ? "last_year" : "previous";
    const service = (url.searchParams.get("service") || "").trim().slice(0, 120) || null;
    const accessToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;

    const data = await section(name, { db, proId: user.id, today, period, compare: comparisonFor(period, mode), service, accessToken, access });
    return NextResponse.json({ section: name, access, today, period, compare: comparisonFor(period, mode), ...data, ms: Date.now() - started });
  } catch (error) {
    console.error("GET /api/analytics/pro failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load this section.") }, { status: 500 });
  }
}
