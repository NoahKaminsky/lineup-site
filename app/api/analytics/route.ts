import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
import { buildAnalytics, type RangeDays } from "@/app/lib/analytics";

// GET /api/analytics?scope=me|shop&days=30|90|365
//   me:   the signed-in pro's analytics. Needs a plan; the basic plan gets the
//         headline numbers and trend, Pro and Master get everything.
//   shop: the whole shop's, for the owner and managers of a shop on a plan.
//         Add &pro=<id> to see one team member's work at the shop.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "shop" ? "shop" : "me";
    const d = Number(url.searchParams.get("days"));
    const days: RangeDays = d === 30 || d === 365 ? d : 90;
    const supabase = getServiceSupabase();

    if (scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 });
      if (!ctx.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's analytics." }, { status: 403 });
      const locked = !isStudioLive(ctx.studio);
      const proId = url.searchParams.get("pro");
      if (proId && !locked) {
        const { data: member } = await supabase
          .from("studio_members")
          .select("profile_id")
          .eq("studio_id", ctx.studio.id)
          .eq("profile_id", proId)
          .maybeSingle();
        if (!member) return NextResponse.json({ error: "That pro isn't on your team." }, { status: 404 });
        const { data: pro } = await supabase.from("profiles").select("full_name, business_name").eq("id", proId).maybeSingle();
        const name = pro?.full_name || pro?.business_name || "Team member";
        const one = await buildAnalytics(supabase, {
          scope: "me",
          userId: proId,
          days,
          locked: false,
          name,
          onlyStudioId: ctx.studio.id,
          viewing: { id: proId, name },
        });
        return NextResponse.json(one);
      }
      const { data: goalRow } = await supabase.from("studios").select("sales_goal_cents").eq("id", ctx.studio.id).maybeSingle();
      const summary = await buildAnalytics(supabase, {
        scope,
        userId: user.id,
        studio: ctx.studio,
        days,
        locked,
        name: ctx.studio.name,
        goalCents: goalRow?.sales_goal_cents ?? null,
      });
      return NextResponse.json(summary);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) return NextResponse.json({ error: "Analytics are for professionals." }, { status: 403 });
    const subscribed = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
    if (!subscribed) return NextResponse.json({ error: "Analytics come with every LineUp plan.", needsPlan: true }, { status: 402 });
    const full = profile?.subscription_plan === "pro" || profile?.subscription_plan === "master";
    const summary = await buildAnalytics(supabase, { scope, userId: user.id, days, locked: !full, name: profile?.full_name || null, goalCents: profile?.sales_goal_cents ?? null });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/analytics failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load analytics.") }, { status: 500 });
  }
}
