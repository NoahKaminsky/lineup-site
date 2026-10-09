import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const service = getServiceSupabase();

  // Scoped to this user's own id too, not just the endpoint -- belt and
  // suspenders against one user's unsubscribe call ever touching a row it
  // doesn't own.
  const { error } = await service
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
