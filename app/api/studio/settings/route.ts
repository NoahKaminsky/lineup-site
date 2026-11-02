import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { SLUG_RE, getStudioForUser, parseCommissionPercent, errorMessage } from "@/app/lib/studios";
import { cleanTrades, parsePlace, setTakesClients } from "@/app/lib/shopAccount";

// PATCH /api/studio/settings { name?, commissionPercent?, place?, trades?, ... }
// Owner only, except { takesClients, myTrades }: an owner or manager saying
// whether they take clients themselves.
// The commission is the shop's default cut of each member's bookings; it
// applies to bookings paid from now on, never to ones already paid.
export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    const body = await req.json().catch(() => ({}));

    if (typeof body?.takesClients === "boolean") {
      if (!ctx?.canManage || !ctx.member.profile_id) {
        return NextResponse.json({ error: "Only owners and managers can change this." }, { status: 403 });
      }
      const result = await setTakesClients(supabase, {
        studioId: ctx.studio.id,
        memberId: ctx.member.id,
        profileId: ctx.member.profile_id,
        takesClients: body.takesClients,
        trades: cleanTrades(body?.myTrades),
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!ctx?.isOwner) return NextResponse.json({ error: "Only the studio owner can change settings." }, { status: 403 });

    const update: Record<string, unknown> = {};

    if ("place" in (body || {})) {
      const place = parsePlace(body.place);
      if (place === "invalid") return NextResponse.json({ error: "Pick the shop's address from the list." }, { status: 400 });
      Object.assign(
        update,
        place || { address: null, place_id: null, lat: null, lng: null, area_label: null }
      );
    }

    if ("trades" in (body || {})) update.trades = cleanTrades(body.trades);

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

    if (typeof body?.slug === "string") {
      const slug = body.slug.trim().toLowerCase();
      if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 40) {
        return NextResponse.json(
          { error: "Your link can use lowercase letters, numbers and dashes (3 to 40 characters)." },
          { status: 400 }
        );
      }
      update.slug = slug;
    }

    if (typeof body?.tagline === "string") {
      const tagline = body.tagline.trim().replace(/\s+/g, " ");
      if (tagline.length > 160) return NextResponse.json({ error: "Keep the tagline under 160 characters." }, { status: 400 });
      update.tagline = tagline || null;
    }

    if (typeof body?.payAtShop === "boolean") update.pay_at_shop_enabled = body.payAtShop;

    if ("noShowFeePercent" in (body || {})) {
      const pct = Math.round(Number(body.noShowFeePercent));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: "No-show fee must be between 0% and 100% of the price." }, { status: 400 });
      }
      update.no_show_fee_percent = pct;
    }

    if (!Object.keys(update).length) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("studios").update(update).eq("id", ctx.studio.id);
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "That link is taken. Try another." }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/settings failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save settings.") }, { status: 500 });
  }
}
