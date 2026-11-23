import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { sendPushToUser } from "@/app/lib/push";
import { analyticsAccess, comparisonFor, type Period } from "@/app/lib/analyticsMetrics";
import { section } from "@/app/lib/proAnalytics";
import { shopSection } from "@/app/lib/shopAnalytics";
import { inSendWindow, shouldGetWeeklyPush, weekKey, weeklyPushMessage } from "@/app/lib/weeklyPush";

// Mondays (vercel.json). The opt-in weekly push summary: last week's
// revenue, bookings and new clients plus one suggestion, opening Analytics.
// Push only (never email or SMS), only to pros and shop owners who turned it
// on, never to customers, once per week (weekly_push_log).
// ?dry=1 lists who would get it without sending.

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const db = getServiceSupabase();
  const now = new Date();
  const { data: people, error } = await db
    .from("profiles")
    .select("id, role, weekly_push_opt_in, time_zone, full_name, subscription_plan, subscription_status")
    .eq("weekly_push_opt_in", true)
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; outcome: string }[] = [];
  for (const p of people || []) {
    if (!shouldGetWeeklyPush(p)) {
      results.push({ id: p.id, outcome: "not a pro" });
      continue;
    }
    if (!inSendWindow(now, p.time_zone)) {
      results.push({ id: p.id, outcome: "not Monday morning there" });
      continue;
    }
    const week = weekKey(now, p.time_zone);
    // Last week, Monday to Sunday, against the week before.
    const lastWeek: Period = { from: new Date(Date.parse(`${week}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10), to: new Date(Date.parse(`${week}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) };
    const compare = comparisonFor(lastWeek, "previous");
    try {
      const ctx = await getStudioForUser(db, p.id).catch(() => null);
      const shop = ctx?.canManage && isStudioLive(ctx.studio) ? ctx.studio : null;
      let o: Record<string, unknown> & { suggestion: { text: string } | null };
      if (shop) {
        o = await shopSection("overview", { db, studio: shop, userId: p.id, today: week, period: lastWeek, compare, service: null, accessToken: null });
      } else {
        const access = analyticsAccess({ ...p, studioMember: !!ctx && isStudioLive(ctx.studio) });
        if (access === "none") {
          results.push({ id: p.id, outcome: "no plan with Analytics" });
          continue;
        }
        o = await section("overview", { db, proId: p.id, today: week, period: lastWeek, compare, service: null, accessToken: null, access });
      }
      const rev = o.revenue as { now: number; prev: number };
      const msg = weeklyPushMessage({ shop: !!shop, revenue: rev.now, prevRevenue: rev.prev, bookings: (o.bookings as { now: number }).now, newClients: (o.newClients as { now: number }).now, suggestion: o.suggestion?.text || null });
      if (dry) {
        results.push({ id: p.id, outcome: `would send: ${msg.title}` });
        continue;
      }
      // Claim the week first, so a second run can't send it again.
      const { error: claim } = await db.from("weekly_push_log").insert({ profile_id: p.id, week });
      if (claim) {
        results.push({ id: p.id, outcome: "already sent this week" });
        continue;
      }
      await sendPushToUser(p.id, msg);
      results.push({ id: p.id, outcome: "sent" });
    } catch (e) {
      console.error(`weekly push failed for ${p.id}:`, e);
      results.push({ id: p.id, outcome: "failed" });
    }
  }
  return NextResponse.json({ ok: true, sent: results.filter((r) => r.outcome === "sent").length, results });
}
