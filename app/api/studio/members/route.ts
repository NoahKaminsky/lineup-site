import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { cancelRent, getStudioForUser, parseCommissionPercent, syncMemberPlan, syncStudioMemberPlans, errorMessage } from "@/app/lib/studios";

// PATCH  /api/studio/members { memberId, commissionPercent?, role? }
//   Owner only: a member's own commission split (null = studio default) and
//   whether they're a manager.
// DELETE /api/studio/members { memberId }
//   Owner/managers remove someone or cancel an invite; anyone can remove
//   themselves (leave). The owner can't leave their own studio.

async function loadTarget(supabase: ReturnType<typeof getServiceSupabase>, studioId: string, memberId: unknown) {
  if (typeof memberId !== "string" || !memberId) return null;
  const { data } = await supabase
    .from("studio_members")
    .select("id, studio_id, profile_id, role, status, rent_subscription_id")
    .eq("id", memberId)
    .eq("studio_id", studioId)
    .maybeSingle();
  return data;
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner can change this." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const target = await loadTarget(supabase, ctx.studio.id, body?.memberId);
    if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

    const update: Record<string, unknown> = {};

    if ("commissionPercent" in (body || {})) {
      const parsed = parseCommissionPercent(body.commissionPercent);
      if (parsed === "invalid") {
        return NextResponse.json({ error: "Commission must be between 0% and 70%." }, { status: 400 });
      }
      update.commission_percent = parsed;
    }

    if ("role" in (body || {})) {
      if (target.role === "owner") return NextResponse.json({ error: "The owner's role can't be changed." }, { status: 400 });
      if (body.role !== "manager" && body.role !== "member") {
        return NextResponse.json({ error: "Unknown role." }, { status: 400 });
      }
      update.role = body.role;
    }

    if (!Object.keys(update).length) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("studio_members").update(update).eq("id", target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/members failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not update the team member.") }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const target = await loadTarget(supabase, ctx.studio.id, body?.memberId);
    if (!target) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

    const isSelf = target.profile_id === user.id;

    if (target.role === "owner") {
      return NextResponse.json(
        { error: isSelf ? "Owners can't leave their own studio." : "The owner can't be removed." },
        { status: 400 }
      );
    }
    if (!isSelf) {
      if (!ctx.canManage) return NextResponse.json({ error: "Only the owner or managers can remove people." }, { status: 403 });
      if (target.role === "manager" && !ctx.isOwner) {
        return NextResponse.json({ error: "Only the owner can remove a manager." }, { status: 403 });
      }
    }

    // Leaving the shop ends their booth rent straight away.
    await cancelRent(supabase, target, { immediately: true });

    const { error } = await supabase.from("studio_members").delete().eq("id", target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // They keep their LineUp account, profile and bookings; only the
    // studio-covered plan goes away.
    if (target.profile_id) await syncMemberPlan(supabase, target.profile_id);
    // The rest of the team too: dropping below the minimum turns benefits off.
    await syncStudioMemberPlans(supabase, ctx.studio.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/studio/members failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not remove the team member.") }, { status: 500 });
  }
}
