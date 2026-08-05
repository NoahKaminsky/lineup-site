import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    await supabase
      .from("notifications")
      .delete()
      .eq("request_id", requestId)
      .eq("type", "request");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("clear-request notification cleanup failed:", err);

    return NextResponse.json(
      { error: err?.message || "Cleanup failed" },
      { status: 500 }
    );
  }
}
