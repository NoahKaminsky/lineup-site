import { NextResponse } from "next/server";
import { getServiceSupabase, requireAdmin } from "@/app/lib/serverSupabase";

// Returns every subscriber's email address — admins only. (This used to be
// readable by anyone who knew the URL.)
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();

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