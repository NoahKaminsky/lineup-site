import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { payoutsFor, proEarnings, shopEarnings, todayLocal } from "@/app/lib/earnings";
import { checkRange, type RentMember } from "@/app/lib/earningsCore";

// GET /api/earnings?scope=me|shop&from=YYYY-MM-DD&to=YYYY-MM-DD   (or &year=2026)
//   me:   the signed-in pro's own figures. There is no way to ask for anyone else's.
//   shop: the signed-in owner's or manager's shop. Members get a 403.
// Every figure is worked out by app/lib/earningsCore on the page from these lines.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "shop" ? "shop" : "me";
    const today = todayLocal();
    let from = url.searchParams.get("from") || "";
    let to = url.searchParams.get("to") || "";
    const yearParam = url.searchParams.get("year");
    if (!from && !to) {
      const year = Number(yearParam) || Number(today.slice(0, 4));
      from = `${year}-01-01`;
      to = `${year}-12-31`;
    }
    const bad = checkRange(from, to);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const year = Number(from.slice(0, 4));

    const supabase = getServiceSupabase();

    if (scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 });
      if (!ctx.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's earnings." }, { status: 403 });
      const [result, payouts, members] = await Promise.all([
        shopEarnings(supabase, ctx.studio, from, to),
        payoutsFor(supabase, { studio: ctx.studio }, from, to),
        supabase
          .from("studio_members")
          .select("profile_id, arrangement, rent_cents, rent_interval, rent_status, rent_current_period_end")
          .eq("studio_id", ctx.studio.id)
          .eq("status", "active")
          .eq("arrangement", "booth_rent"),
      ]);
      if (members.error) throw members.error;
      const renterIds = (members.data || []).map((m) => m.profile_id).filter((id): id is string => !!id);
      const { data: renterProfiles } = renterIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", renterIds)
        : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((renterProfiles || []).map((p) => [p.id, p.full_name]));
      const rent: RentMember[] = (members.data || []).map((m) => ({
        proId: m.profile_id as string,
        name: names.get(m.profile_id as string) || "Team member",
        rentCents: m.rent_cents,
        rentInterval: m.rent_interval,
        rentStatus: m.rent_status,
        periodEnd: m.rent_current_period_end,
      }));
      return NextResponse.json({
        scope, year, from, to, today, name: ctx.studio.name, ownerId: ctx.studio.owner_id,
        rows: result.rows, attention: result.attention, payouts, rent,
      });
    }

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) {
      return NextResponse.json({ error: "Earnings are for professionals." }, { status: 403 });
    }
    const [result, payouts] = await Promise.all([proEarnings(supabase, user.id, from, to), payoutsFor(supabase, { proId: user.id }, from, to)]);
    const membership = await getStudioForUser(supabase, user.id);
    return NextResponse.json({
      scope, year, from, to, today, name: profile?.full_name || null,
      inShop: !!membership, solo: !membership,
      rows: result.rows, attention: result.attention, payouts,
    });
  } catch (error) {
    console.error("GET /api/earnings failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load earnings.") }, { status: 500 });
  }
}
