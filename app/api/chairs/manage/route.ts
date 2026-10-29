import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { PROFESSION_LABELS } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { errorMessage, getStudioForUser } from "@/app/lib/studios";
import { OPENING_COLUMNS, featuredOpeningIds, proTypes, type ChairOpeningRow } from "@/app/lib/chairs";

// GET   /api/chairs/manage — the studio's own openings, with who applied.
// PATCH /api/chairs/manage { openingId, status } | { applicationId, status: "declined" }
// Owners and managers only.

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only a studio's owner or managers can see this." }, { status: 403 });

    const { data: rows, error } = await supabase
      .from("chair_openings")
      .select(OPENING_COLUMNS)
      .eq("studio_id", ctx.studio.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const openings = (rows as ChairOpeningRow[]) || [];
    const ids = openings.map((o) => o.id);

    const [{ data: apps }, featured] = await Promise.all([
      ids.length
        ? supabase
            .from("chair_applications")
            .select("id, opening_id, professional_id, message, status, created_at")
            .in("opening_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as { id: string; opening_id: string; professional_id: string; message: string | null; status: string; created_at: string }[] }),
      featuredOpeningIds(supabase, ids),
    ]);

    const proIds = [...new Set((apps || []).map((a) => a.professional_id))];
    const { data: pros } = proIds.length
      ? await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, professional_type, professional_types, verification_status")
          .in("id", proIds)
      : { data: [] };
    const proMap = new Map((pros || []).map((p) => [p.id, p]));

    return NextResponse.json({
      openings: openings.map((o) => ({
        id: o.id,
        title: o.title,
        professions: o.professions,
        professionLabels: o.professions.map((p) => PROFESSION_LABELS[p] || p),
        arrangement: o.arrangement,
        rentCents: o.rent_cents,
        rentInterval: o.rent_interval,
        commissionNote: o.commission_note,
        description: o.description,
        availableFrom: o.available_from,
        areaLabel: o.area_label,
        status: Date.parse(o.expires_at) < Date.now() && o.status === "open" ? "expired" : o.status,
        expiresAt: o.expires_at,
        featured: featured.has(o.id),
        createdAt: o.created_at,
        applicants: (apps || [])
          .filter((a) => a.opening_id === o.id)
          .map((a) => {
            const p = proMap.get(a.professional_id);
            return {
              id: a.id,
              profileId: a.professional_id,
              name: p?.full_name || "LineUp pro",
              avatarUrl: p?.avatar_url || null,
              profileHref: p ? getProfileHref(p) : null,
              trades: p ? proTypes(p).map((t) => PROFESSION_LABELS[t] || t) : [],
              verified: p?.verification_status === "verified",
              message: a.message,
              status: a.status,
              appliedAt: a.created_at,
            };
          }),
      })),
    });
  } catch (error) {
    console.error("GET /api/chairs/manage failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load your openings.") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only a studio's owner or managers can change this." }, { status: 403 });

    const body = await req.json().catch(() => ({}));

    if (typeof body?.applicationId === "string") {
      if (body.status !== "declined") return NextResponse.json({ error: "Unknown status." }, { status: 400 });
      const { data: app } = await supabase
        .from("chair_applications")
        .select("id, chair_openings!inner(studio_id)")
        .eq("id", body.applicationId)
        .maybeSingle();
      const studioId = (app?.chair_openings as unknown as { studio_id: string } | null)?.studio_id;
      if (!app || studioId !== ctx.studio.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
      await supabase.from("chair_applications").update({ status: "declined" }).eq("id", app.id);
      return NextResponse.json({ ok: true });
    }

    const status = body?.status;
    if (!["open", "filled", "closed"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });

    const update: Record<string, unknown> = { status };
    // Reopening (or reposting an expired one) runs another 30 days.
    if (status === "open") update.expires_at = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const { data: updated, error } = await supabase
      .from("chair_openings")
      .update(update)
      .eq("id", typeof body?.openingId === "string" ? body.openingId : "")
      .eq("studio_id", ctx.studio.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/chairs/manage failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not update that.") }, { status: 500 });
  }
}
