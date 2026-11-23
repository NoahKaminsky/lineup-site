import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { errorMessage } from "@/app/lib/studios";

// GET  /api/notifications/weekly-push  -> { on }
// POST /api/notifications/weekly-push { on: boolean }
// The signed-in pro's opt-in for the Monday push summary. Off by default;
// customers can't turn it on.

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data } = await getServiceSupabase().from("profiles").select("weekly_push_opt_in").eq("id", user.id).maybeSingle();
  return NextResponse.json({ on: data?.weekly_push_opt_in === true });
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const db = getServiceSupabase();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role || "").toLowerCase();
    if (!role || role.includes("customer")) return NextResponse.json({ error: "The weekly summary is for professionals and shops." }, { status: 403 });
    const on = body?.on === true;
    const { error } = await db.from("profiles").update({ weekly_push_opt_in: on }).eq("id", user.id);
    if (error) throw error;
    return NextResponse.json({ on });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save that.") }, { status: 500 });
  }
}
