import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { PROFESSION_LABELS } from "@/app/lib/verificationRules";
import { errorMessage, getStudioForUser, isStudioLive } from "@/app/lib/studios";
import {
  OPENING_COLUMNS,
  OPENING_DAYS,
  areaFromAddress,
  distanceKm,
  featuredOpeningIds,
  notifyMatchingPros,
  proTypes,
  type ChairOpeningRow,
} from "@/app/lib/chairs";

// GET  /api/chairs — open chairs for the signed-in professional, only in
//      their trade(s). Clients never see these.
// POST /api/chairs — a studio's owner or manager posts an opening.

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const { data: me } = await supabase
      .from("profiles")
      .select("id, role, professional_type, professional_types, location_lat, location_lng")
      .eq("id", user.id)
      .maybeSingle();

    if (me?.role !== "professional") {
      return NextResponse.json({ error: "Chair openings are for professionals." }, { status: 403 });
    }

    const types = proTypes(me);
    if (!types.length) return NextResponse.json({ openings: [], professions: [] });

    const myStudio = await getStudioForUser(supabase, user.id);

    const { data: rows, error } = await supabase
      .from("chair_openings")
      .select(OPENING_COLUMNS)
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .overlaps("professions", types)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const openings = ((rows as ChairOpeningRow[]) || []).filter((o) => o.studio_id !== myStudio?.studio.id);
    const studioIds = [...new Set(openings.map((o) => o.studio_id))];
    const openingIds = openings.map((o) => o.id);

    const [{ data: studios }, { data: applications }, featured] = await Promise.all([
      studioIds.length
        ? supabase.from("studios").select("id, name, slug").in("id", studioIds)
        : Promise.resolve({ data: [] as { id: string; name: string; slug: string | null }[] }),
      openingIds.length
        ? supabase
            .from("chair_applications")
            .select("opening_id, status")
            .eq("professional_id", user.id)
            .in("opening_id", openingIds)
        : Promise.resolve({ data: [] as { opening_id: string; status: string }[] }),
      featuredOpeningIds(supabase, openingIds),
    ]);
    const studioMap = new Map((studios || []).map((s) => [s.id, s]));
    const appliedMap = new Map((applications || []).map((a) => [a.opening_id, a.status]));

    const result = openings
      .map((o) => {
        const km = distanceKm(me.location_lat, me.location_lng, o.lat, o.lng);
        return {
          id: o.id,
          title: o.title,
          studioName: studioMap.get(o.studio_id)?.name || "A LineUp studio",
          studioSlug: studioMap.get(o.studio_id)?.slug || null,
          professions: o.professions.map((p) => PROFESSION_LABELS[p] || p),
          arrangement: o.arrangement,
          rentCents: o.rent_cents,
          rentInterval: o.rent_interval,
          commissionNote: o.commission_note,
          description: o.description,
          availableFrom: o.available_from,
          areaLabel: o.area_label,
          distanceKm: km === null ? null : Math.round(km),
          featured: featured.has(o.id),
          postedAt: o.created_at,
          applied: appliedMap.get(o.id) || null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999) ||
          b.postedAt.localeCompare(a.postedAt)
      );

    return NextResponse.json({ openings: result, professions: types.map((t) => PROFESSION_LABELS[t] || t) });
  } catch (error) {
    console.error("GET /api/chairs failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load chair openings.") }, { status: 500 });
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/[ \t]+/g, " ").slice(0, max) : "";
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only a studio's owner or managers can post." }, { status: 403 });
    if (!isStudioLive(ctx.studio)) {
      return NextResponse.json({ error: "Posting chair openings is included with a studio plan." }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const title = cleanText(body?.title, 80);
    const description = cleanText(body?.description, 1500) || null;
    const commissionNote = cleanText(body?.commissionNote, 60) || null;
    const professions = Array.isArray(body?.professions)
      ? [...new Set((body.professions as unknown[]).filter((p): p is string => typeof p === "string" && p in PROFESSION_LABELS))]
      : [];
    const arrangement = ["booth_rent", "commission", "either"].includes(body?.arrangement) ? body.arrangement : "either";
    const rentInterval = body?.rentInterval === "month" ? "month" : body?.rentInterval === "week" ? "week" : null;
    const rentCents =
      body?.rentCents === null || body?.rentCents === undefined || body?.rentCents === "" ? null : Math.round(Number(body.rentCents));
    const availableFrom = typeof body?.availableFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.availableFrom) ? body.availableFrom : null;

    if (title.length < 3) return NextResponse.json({ error: "Give the opening a short title." }, { status: 400 });
    if (!professions.length) return NextResponse.json({ error: "Pick at least one trade." }, { status: 400 });
    if (rentCents !== null && (!Number.isFinite(rentCents) || rentCents < 0 || rentCents > 1_000_000)) {
      return NextResponse.json({ error: "That rent doesn't look right." }, { status: 400 });
    }

    // Where: the shop's address (from the owner's profile), shown as just the area.
    const { data: owner } = await supabase
      .from("profiles")
      .select("formatted_address, location_lat, location_lng")
      .eq("id", ctx.studio.owner_id)
      .maybeSingle();

    const { data: opening, error } = await supabase
      .from("chair_openings")
      .insert({
        studio_id: ctx.studio.id,
        posted_by: user.id,
        title,
        professions,
        arrangement,
        rent_cents: arrangement === "commission" ? null : rentCents,
        rent_interval: arrangement === "commission" || rentCents === null ? null : rentInterval || "week",
        commission_note: arrangement === "booth_rent" ? null : commissionNote,
        description,
        available_from: availableFrom,
        area_label: areaFromAddress(owner?.formatted_address),
        lat: owner?.location_lat ?? null,
        lng: owner?.location_lng ?? null,
        expires_at: new Date(Date.now() + OPENING_DAYS * 86_400_000).toISOString(),
      })
      .select(OPENING_COLUMNS)
      .single<ChairOpeningRow>();
    if (error || !opening) throw new Error(error?.message || "Could not post.");

    const { data: team } = await supabase.from("studio_members").select("profile_id").eq("studio_id", ctx.studio.id);
    const notified = await notifyMatchingPros(
      supabase,
      opening,
      ctx.studio.name,
      (team || []).map((m) => m.profile_id).filter(Boolean) as string[]
    ).catch((e) => {
      console.error("Chair opening notifications failed:", e);
      return 0;
    });

    return NextResponse.json({ ok: true, id: opening.id, notified });
  } catch (error) {
    console.error("POST /api/chairs failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not post the opening.") }, { status: 500 });
  }
}
