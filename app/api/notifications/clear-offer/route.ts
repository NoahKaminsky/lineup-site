import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    const { offerId } = await req.json();

    if (!offerId) {
      return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    await supabase.from("notifications").delete().eq("offer_id", offerId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("clear-offer notification cleanup failed:", err);

    return NextResponse.json(
      { error: err?.message || "Cleanup failed" },
      { status: 500 }
    );
  }
}
