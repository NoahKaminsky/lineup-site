import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const service = getServiceSupabase();

  // endpoint is unique across the whole table, not just per-user — upsert
  // on it (not an id) so re-subscribing the same browser updates the same
  // row instead of erroring on the unique constraint or leaving a duplicate.
  const { error } = await service
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
