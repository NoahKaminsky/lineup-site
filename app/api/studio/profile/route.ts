import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { cleanAbout, cleanAmenities, cleanHours, cleanInstagram, cleanPhone, cleanWebsite, publicName } from "@/app/lib/shopProfile";

// GET   /api/studio/profile  -> the shop's public profile, photos and reviews (any team member)
// PATCH /api/studio/profile  { about?, phone?, website?, instagram?, hours?, amenities? } (owner or manager)
const FIELDS = "id, about, cover_url, logo_url, phone, website, instagram, hours, amenities";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 403 });

    const [{ data: profile }, { data: photos }, { data: reviews }] = await Promise.all([
      supabase.from("studios").select(FIELDS).eq("id", ctx.studio.id).maybeSingle(),
      supabase.from("studio_photos").select("id, url, caption, sort, created_at").eq("studio_id", ctx.studio.id).order("sort").order("created_at"),
      supabase
        .from("studio_reviews")
        .select("id, rating, comment, reply, replied_at, created_at, reviewer_id")
        .eq("studio_id", ctx.studio.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const reviewerIds = [...new Set((reviews || []).map((r) => r.reviewer_id as string))];
    const { data: people } = reviewerIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", reviewerIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const names = new Map((people || []).map((p) => [p.id as string, publicName(p.full_name as string | null)]));

    return NextResponse.json({
      canEdit: ctx.canManage,
      profile,
      photos: photos || [],
      reviews: (reviews || []).map(({ reviewer_id, ...r }) => ({ ...r, reviewer: names.get(reviewer_id as string) || "LineUp client" })),
    });
  } catch (error) {
    console.error("GET /api/studio/profile failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load the shop profile.") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only the shop's owner and managers can edit its profile." }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

    if ("about" in body) {
      const r = cleanAbout(body.about);
      if (r.error) return fail(r.error);
      update.about = r.value;
    }
    if ("phone" in body) {
      const r = cleanPhone(body.phone);
      if (r.error) return fail(r.error);
      update.phone = r.value;
    }
    if ("website" in body) {
      const r = cleanWebsite(body.website);
      if (r.error) return fail(r.error);
      update.website = r.value;
    }
    if ("instagram" in body) {
      const r = cleanInstagram(body.instagram);
      if (r.error) return fail(r.error);
      update.instagram = r.value;
    }
    if ("hours" in body) {
      const r = cleanHours(body.hours);
      if (r.error) return fail(r.error);
      update.hours = r.hours;
    }
    if ("amenities" in body) update.amenities = cleanAmenities(body.amenities);
    if (!Object.keys(update).length) return fail("Nothing to save.");

    const { error } = await supabase.from("studios").update(update).eq("id", ctx.studio.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/studio/profile failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save the shop profile.") }, { status: 500 });
  }
}
