import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import {
  CLIENT_MEMBERSHIP_COLUMNS,
  MEMBERSHIP_PLAN_COLUMNS,
  USABLE_STATUSES,
  visitsThisPeriod,
  type ClientMembershipRow,
  type MembershipPlanRow,
} from "@/app/lib/memberships";

// Shop side of memberships.
// GET   — plans and members (anyone on the team, so pros can check members in).
// POST  { action: "create_plan", name, description, priceCents, visitsPerPeriod } — owner.
// POST  { action: "checkin", membershipId, force? } — anyone on the team.
// POST  { action: "cancel", membershipId } — owner; ends at the period end.
// PATCH { planId, active } — owner; hiding a plan doesn't cancel members.

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const [{ data: plans }, { data: rows }] = await Promise.all([
      supabase.from("membership_plans").select(MEMBERSHIP_PLAN_COLUMNS).eq("studio_id", ctx.studio.id).order("created_at"),
      supabase
        .from("client_memberships")
        .select(CLIENT_MEMBERSHIP_COLUMNS)
        .eq("studio_id", ctx.studio.id)
        .in("status", USABLE_STATUSES)
        .order("created_at", { ascending: false }),
    ]);

    const memberships = (rows as ClientMembershipRow[]) || [];
    const planList = (plans as MembershipPlanRow[]) || [];
    const planMap = new Map(planList.map((p) => [p.id, p]));
    const { counts, lastVisit } = await visitsThisPeriod(supabase, memberships);

    const customerIds = [...new Set(memberships.map((m) => m.customer_id))];
    const { data: customers } = customerIds.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", customerIds)
      : { data: [] };
    const customerMap = new Map((customers || []).map((c) => [c.id, c]));

    const monthlyCents = memberships
      .filter((m) => m.status === "active" || m.status === "trialing")
      .reduce((sum, m) => sum + (planMap.get(m.plan_id)?.price_cents || 0), 0);

    return NextResponse.json({
      canManage: ctx.isOwner,
      live: isStudioLive(ctx.studio),
      payoutsSetUp: !!ctx.studio.stripe_account_id,
      monthlyCents,
      plans: planList.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.price_cents,
        visitsPerPeriod: p.visits_per_period,
        active: p.active,
        memberCount: memberships.filter((m) => m.plan_id === p.id).length,
      })),
      members: memberships.map((m) => {
        const c = customerMap.get(m.customer_id);
        const plan = planMap.get(m.plan_id);
        return {
          id: m.id,
          name: c?.full_name || "Client",
          avatarUrl: c?.avatar_url || null,
          planName: plan?.name || "Membership",
          status: m.status,
          cancelAtPeriodEnd: m.cancel_at_period_end,
          renewsOn: m.current_period_end,
          visitsUsed: counts.get(m.id) || 0,
          visitsIncluded: plan?.visits_per_period ?? null,
          lastVisit: lastVisit.get(m.id) || null,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/studio/memberships failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load memberships.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    if (body?.action === "create_plan") {
      if (!ctx.isOwner) return NextResponse.json({ error: "Only the owner can create memberships." }, { status: 403 });
      if (!isStudioLive(ctx.studio)) {
        return NextResponse.json({ error: "Memberships are included with a studio plan." }, { status: 402 });
      }
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
      const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) || null : null;
      const priceCents = Math.round(Number(body?.priceCents));
      const visits = body?.visitsPerPeriod === null || body?.visitsPerPeriod === "" || body?.visitsPerPeriod === undefined
        ? null
        : Math.round(Number(body.visitsPerPeriod));
      if (name.length < 2) return NextResponse.json({ error: "Give the membership a name." }, { status: 400 });
      if (!Number.isFinite(priceCents) || priceCents < 500 || priceCents > 100000) {
        return NextResponse.json({ error: "Price must be between $5 and $1,000 a month." }, { status: 400 });
      }
      if (visits !== null && (!Number.isFinite(visits) || visits < 1 || visits > 60)) {
        return NextResponse.json({ error: "Visits must be between 1 and 60, or unlimited." }, { status: 400 });
      }
      const { error } = await supabase.from("membership_plans").insert({
        studio_id: ctx.studio.id,
        name,
        description,
        price_cents: priceCents,
        visits_per_period: visits,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const { data: membership } = await supabase
      .from("client_memberships")
      .select(CLIENT_MEMBERSHIP_COLUMNS)
      .eq("id", typeof body?.membershipId === "string" ? body.membershipId : "")
      .eq("studio_id", ctx.studio.id)
      .maybeSingle<ClientMembershipRow>();
    if (!membership) return NextResponse.json({ error: "Membership not found." }, { status: 404 });

    if (body?.action === "checkin") {
      if (!USABLE_STATUSES.includes(membership.status)) {
        return NextResponse.json({ error: "This membership isn't active." }, { status: 409 });
      }
      const { data: plan } = await supabase
        .from("membership_plans")
        .select("visits_per_period")
        .eq("id", membership.plan_id)
        .maybeSingle();
      const { counts } = await visitsThisPeriod(supabase, [membership]);
      const used = counts.get(membership.id) || 0;
      const limit = plan?.visits_per_period ?? null;
      if (limit !== null && used >= limit && body?.force !== true) {
        return NextResponse.json(
          { error: `They've used all ${limit} visits this month.`, code: "limit_reached" },
          { status: 409 }
        );
      }
      const { error } = await supabase.from("membership_visits").insert({ membership_id: membership.id, checked_in_by: user.id });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, visitsUsed: used + 1, visitsIncluded: limit });
    }

    if (body?.action === "cancel") {
      if (!ctx.isOwner) return NextResponse.json({ error: "Only the owner can cancel memberships." }, { status: 403 });
      if (!membership.stripe_subscription_id) return NextResponse.json({ error: "Nothing to cancel." }, { status: 400 });
      await stripe.subscriptions.update(membership.stripe_subscription_id, { cancel_at_period_end: true });
      await supabase.from("client_memberships").update({ cancel_at_period_end: true }).eq("id", membership.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/studio/memberships failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not do that.") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the owner can change memberships." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.active !== "boolean") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

    const { data, error } = await supabase
      .from("membership_plans")
      .update({ active: body.active })
      .eq("id", typeof body?.planId === "string" ? body.planId : "")
      .eq("studio_id", ctx.studio.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/memberships failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save.") }, { status: 500 });
  }
}
