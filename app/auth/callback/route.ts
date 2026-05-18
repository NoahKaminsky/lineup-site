import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/serverSupabase";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const supabase = await createSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);

    // Important:
    // Confirming an email can create an active session.
    // We immediately sign out so the user is forced back to login,
    // then your normal login flow decides whether they need onboarding.
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login?confirmed=1", requestUrl.origin));
}
