import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("marketing_consent", true)
    .eq("unsubscribed_from_marketing", false)
    .not("email", "is", null);

  const { data: signupRows, error: signupError } = await supabase
    .from("lineup_signups")
    .select("email")
    .eq("marketing_consent", true)
    .eq("unsubscribed_from_marketing", false)
    .not("email", "is", null);

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: profileError.message },
      { status: 500 }
    );
  }

  if (signupError) {
    return NextResponse.json(
      { ok: false, error: signupError.message },
      { status: 500 }
    );
  }

  const emails = Array.from(
    new Set(
      [...(profileRows ?? []), ...(signupRows ?? [])]
        .map((row) => row.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    )
  );

  return NextResponse.json({
    ok: true,
    count: emails.length,
    emails,
  });
}