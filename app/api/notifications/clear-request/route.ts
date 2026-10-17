import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

// Clears the "new request" alerts sent to professionals once a request is
// cancelled. Only the customer who posted the request may do this.
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { requestId } = await req.json();

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: request } = await supabase
      .from("service_requests")
      .select("client_id")
      .eq("id", requestId)
      .maybeSingle();

    if (!request) return NextResponse.json({ ok: true });
    if (request.client_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase
      .from("notifications")
      .delete()
      .eq("request_id", requestId)
      .eq("type", "request");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("clear-request notification cleanup failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
