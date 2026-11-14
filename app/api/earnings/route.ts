import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { proEarnings, shopEarnings, todayLocal } from "@/app/lib/earnings";

// GET /api/earnings?scope=me|shop&year=2026
//   me:   the signed-in pro's own sales for the year.
//   shop: the whole shop's (owner and managers only).
// The page does the month filters, totals and CSV from these lines.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "shop" ? "shop" : "me";
    const thisYear = Number(todayLocal().slice(0, 4));
    const year = Number(url.searchParams.get("year")) || thisYear;
    if (year < 2025 || year > thisYear) return NextResponse.json({ error: "Pick a year from 2025 on." }, { status: 400 });
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const supabase = getServiceSupabase();

    if (scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 });
      if (!ctx.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's earnings." }, { status: 403 });
      const result = await shopEarnings(supabase, ctx.studio, from, to);
      return NextResponse.json({ scope, year, name: ctx.studio.name, rows: result.rows, attention: result.attention });
    }

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) {
      return NextResponse.json({ error: "Earnings are for professionals." }, { status: 403 });
    }
    const result = await proEarnings(supabase, user.id, from, to);
    return NextResponse.json({ scope, year, name: profile?.full_name || null, rows: result.rows, attention: result.attention });
  } catch (error) {
    console.error("GET /api/earnings failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load earnings.") }, { status: 500 });
  }
}
