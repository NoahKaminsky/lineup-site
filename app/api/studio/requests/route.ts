import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { errorMessage, getStudioForUser, getStudioPlace, takesClients, type StudioMemberRow } from "@/app/lib/studios";
import { getRequestProfessions, professionLabel, requestMatchesProfessional } from "@/app/lib/professions";
import { approxDistanceLabel, withinServiceArea } from "@/app/lib/serviceArea";

// GET  /api/studio/requests  — open client requests the shop's team can take:
//      each one with the pros who match it, the offers they've sent and who
//      it's been passed to. Owners and managers see the whole team's; a
//      member sees the ones that match them.
// POST /api/studio/requests { requestId, professionalId } — a manager passes
//      a request to a pro on the team, who gets a notification to send an offer.

const LOOKBACK_DAYS = 30;

type TeamPro = {
  id: string;
  full_name: string | null;
  professional_type: string | null;
  professional_types: string[] | null;
  service_modes: string[] | null;
  location_lat: number | null;
  location_lng: number | null;
  service_radius_km: number | null;
};

type RequestRow = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  categories: string[] | null;
  target_professions?: string[] | null;
  service_mode: string | null;
  service_modes: string[] | null;
  budget: string | null;
  status: string;
  created_at: string;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  preferred_professional_id?: string | null;
  is_direct_rebook?: boolean | null;
  area_label?: string | null;
  area_lat?: number | null;
  area_lng?: number | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

async function loadTeam(supabase: ReturnType<typeof getServiceSupabase>, studioId: string) {
  const { data: members } = await supabase.from("studio_members").select("*").eq("studio_id", studioId).eq("status", "active");
  const ids = ((members || []) as StudioMemberRow[])
    .filter(takesClients)
    .map((m) => m.profile_id)
    .filter(Boolean) as string[];
  if (!ids.length) return [] as TeamPro[];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, professional_type, professional_types, service_modes, location_lat, location_lng, service_radius_km")
    .in("id", ids);
  return ((data || []) as (TeamPro & { role: string | null })[]).filter((p) => !!p.role && p.role !== "shop" && p.role !== "customer");
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx) return NextResponse.json({ error: "You're not on a studio's team." }, { status: 404 });

    const [allTeam, place] = await Promise.all([loadTeam(supabase, ctx.studio.id), getStudioPlace(supabase, ctx.studio.id)]);
    const team = ctx.canManage ? allTeam : allTeam.filter((p) => p.id === user.id);
    if (!team.length) return NextResponse.json({ requests: [], teamSize: 0 });

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data: rows } = await supabase
      .from("service_requests")
      .select("*")
      .eq("status", "open")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    const requests = (rows || []) as RequestRow[];

    const shopBase = place.lat !== null && place.lng !== null ? { location_lat: place.lat, location_lng: place.lng } : null;

    const matched = requests
      .map((r) => {
        const matches = team.filter((p) => {
          if (!requestMatchesProfessional(r, p)) return false;
          // A pro without a base of their own works from the shop.
          const base = p.location_lat !== null && p.location_lng !== null ? p : shopBase ? { ...p, ...shopBase } : p;
          return withinServiceArea(base, r);
        });
        return { r, matches };
      })
      .filter((x) => x.matches.length > 0)
      .slice(0, 60);

    const requestIds = matched.map((x) => x.r.id);
    const teamIds = team.map((p) => p.id);

    const [{ data: offers }, { data: passes }] = await Promise.all([
      requestIds.length
        ? supabase
            .from("request_offers")
            .select("request_id, professional_id, status, proposed_price")
            .in("request_id", requestIds)
            .in("professional_id", teamIds)
            .neq("status", "withdrawn")
        : Promise.resolve({ data: [] as never[] }),
      requestIds.length
        ? supabase
            .from("studio_request_passes")
            .select("request_id, professional_id")
            .eq("studio_id", ctx.studio.id)
            .in("request_id", requestIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    return NextResponse.json({
      teamSize: team.length,
      requests: matched.map(({ r, matches }) => ({
        id: r.id,
        title: r.title || "Request",
        description: r.description ? r.description.slice(0, 280) : null,
        professions: getRequestProfessions(r).map(professionLabel),
        areaLabel: r.area_label || null,
        distanceLabel: shopBase ? approxDistanceLabel(shopBase, r) : null,
        budget: r.budget,
        preferredDate: r.preferred_date || null,
        preferredTime: r.preferred_start_time ? String(r.preferred_start_time).slice(0, 5) : null,
        atShop: (r.service_modes?.length ? r.service_modes : r.service_mode ? [r.service_mode] : []).includes("in_shop"),
        direct: !!(r.is_direct_rebook || r.preferred_professional_id),
        createdAt: r.created_at,
        matches: matches.map((p) => p.id),
        offers: (offers || [])
          .filter((o) => o.request_id === r.id)
          .map((o) => ({ professionalId: o.professional_id, status: o.status, price: o.proposed_price })),
        passedTo: ((passes || []) as { request_id: string; professional_id: string }[])
          .filter((p) => p.request_id === r.id)
          .map((p) => p.professional_id),
      })),
    });
  } catch (error) {
    console.error("GET /api/studio/requests failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load requests.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only owners and managers can pass requests." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const professionalId = typeof body?.professionalId === "string" ? body.professionalId : "";

    const team = await loadTeam(supabase, ctx.studio.id);
    const pro = team.find((p) => p.id === professionalId);
    if (!pro) return NextResponse.json({ error: "That pro isn't taking clients at your shop." }, { status: 404 });

    const { data: request } = await supabase.from("service_requests").select("*").eq("id", requestId).maybeSingle<RequestRow>();
    if (!request || request.status !== "open") return NextResponse.json({ error: "That request isn't open anymore." }, { status: 409 });
    if (!requestMatchesProfessional(request, pro)) {
      return NextResponse.json({ error: "That request isn't for their trade." }, { status: 400 });
    }

    const { error: passError } = await supabase
      .from("studio_request_passes")
      .insert({ studio_id: ctx.studio.id, request_id: request.id, professional_id: pro.id, passed_by: user.id });
    if (passError && passError.code !== "23505") {
      return NextResponse.json(
        {
          error: /studio_request_passes/.test(passError.message)
            ? "Run the latest SQL (20261104_shop_accounts.sql) in Supabase first."
            : passError.message,
        },
        { status: 500 }
      );
    }

    if (!passError && pro.id !== user.id) {
      const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      await supabase.from("notifications").insert({
        user_id: pro.id,
        request_id: request.id,
        is_read: false,
        type: "request_passed",
        title: `${me?.full_name?.split(" ")[0] || ctx.studio.name} passed you a request: ${request.title || "new request"}. Send an offer.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/studio/requests failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not pass the request.") }, { status: 500 });
  }
}
