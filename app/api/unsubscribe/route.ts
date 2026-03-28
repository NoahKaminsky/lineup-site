import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawEmail = body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing email" },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();
    const now = new Date().toISOString();

    await supabase
      .from("profiles")
      .update({
        marketing_consent: false,
        unsubscribed_from_marketing: true,
        unsubscribed_at: now,
      })
      .eq("email", email);

    await supabase
      .from("lineup_signups")
      .update({
        marketing_consent: false,
        unsubscribed_from_marketing: true,
        unsubscribed_at: now,
      })
      .eq("email", email);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}