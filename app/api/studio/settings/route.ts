import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, parseCommissionPercent, errorMessage } from "@/app/lib/studios";

// PATCH /api/studio/settings { name?, commissionPercent? } — owner only.
// The commission is the shop's default cut of each member's bookings; it
// applies to bookings paid from now on, never to ones already paid.
export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner can change settings." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Studio name must be 2 to 80 characters." }, { status: 400 });
      }
      update.name = name;
    }

    if ("commissionPercent" in (body || {})) {
      const parsed = parseCommissionPercent(body.commissionPercent);
      if (parsed === "invalid" || parsed === null) {
        return NextResponse.json({ error: "Commission must be between 0% and 70%." }, { status: 400 });
      }
      update.commission_percent = parsed;
    }

    if (!Object.keys(update).length) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("studios").update(update).eq("id", ctx.studio.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/settings failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save settings.") }, { status: 500 });
  }
}
