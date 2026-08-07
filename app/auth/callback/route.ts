import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  if (code) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !session) {
      // Code expired or already used — send to login with a message
      return NextResponse.redirect(
        new URL("/login?confirmed=1", requestUrl.origin)
      );
    }

    // Password recovery must always land on the reset-password form regardless
    // of profile completeness — this is the one case where "next" is a real
    // functional requirement, not just a routing preference.
    if (next === "/reset-password") {
      return NextResponse.redirect(new URL("/reset-password", requestUrl.origin));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "full_name, role, professional_type, professional_types, terms_accepted, privacy_accepted"
      )
      .eq("id", session.user.id)
      .maybeSingle();

    const professionalTypes = Array.isArray(profile?.professional_types)
      ? profile.professional_types
      : [];

    const hasCompletedProfile =
      !!profile?.full_name &&
      !!profile?.role &&
      !!profile?.terms_accepted &&
      !!profile?.privacy_accepted &&
      (profile.role !== "professional" ||
        !!profile?.professional_type ||
        professionalTypes.length > 0);

    return NextResponse.redirect(
      new URL(
        hasCompletedProfile ? "/requests" : "/onboarding",
        requestUrl.origin
      )
    );
  }

  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
