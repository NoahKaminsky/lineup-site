import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";

// POST /api/analytics/goal { scope: "me" | "shop", cents: number | null }
//   Sets (or clears) the monthly sales goal shown in Analytics.
// POST { scope: "me", kind: "bookings", bookings: number | null }
//   A pro can aim for a number of bookings instead.

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body?.scope !== "shop" && body?.kind === "bookings") {
      const n = body?.bookings === null || body?.bookings === "" ? null : Math.round(Number(body?.bookings));
      if (n !== null && (!Number.isFinite(n) || n < 1 || n > 2000)) return NextResponse.json({ error: "Pick between 1 and 2,000 bookings." }, { status: 400 });
      const { error } = await getServiceSupabase().from("profiles").update({ goal_kind: "bookings", goal_bookings: n }).eq("id", user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, kind: "bookings", bookings: n });
    }
    const cents = body?.cents === null || body?.cents === "" ? null : Math.round(Number(body?.cents));
    if (cents !== null && (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000)) {
      return NextResponse.json({ error: "That goal doesn't look right." }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const value = cents || null;
    if (body?.scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx?.canManage) return NextResponse.json({ error: "Only the owner and managers can set the shop's goal." }, { status: 403 });
      const { error } = await supabase.from("studios").update({ sales_goal_cents: value }).eq("id", ctx.studio.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("profiles").update({ sales_goal_cents: value, goal_kind: "revenue" }).eq("id", user.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true, cents: value });
  } catch (error) {
    console.error("POST /api/analytics/goal failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save the goal.") }, { status: 500 });
  }
}
