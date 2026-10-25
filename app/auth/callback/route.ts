import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/app/lib/returnTo";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const isRecovery = next === "/reset-password";
  // Signup / resend confirmation links carry next=/login?confirmed=1.
  const isEmailConfirmation = !!next && next.includes("confirmed=1");

  // Leaves a one-time marker so the page they land on can show the
  // "Email confirmed" modal (app/components/EmailConfirmedModal.tsx).
  const withConfirmedMarker = (response: NextResponse, value: "1" | "signin") => {
    if (isEmailConfirmation) {
      response.cookies.set("lu_email_confirmed", value, { path: "/", maxAge: 300, sameSite: "lax" });
    }
    return response;
  };

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
      // A failed password-reset link must never fall through to the
      // "email confirmed" message — the reset page explains what happened
      // (expired, already used, or opened in a different browser than the
      // one that requested it) and offers a fresh link.
      if (isRecovery) {
        return NextResponse.redirect(new URL("/reset-password", requestUrl.origin));
      }

      // Code expired or already used — send to login with a message
      return withConfirmedMarker(
        NextResponse.redirect(new URL("/login?confirmed=1", requestUrl.origin)),
        "signin"
      );
    }

    // Password recovery must always land on the reset-password form regardless
    // of profile completeness — this is the one case where "next" is a real
    // functional requirement, not just a routing preference.
    if (isRecovery) {
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

    // Signed up from a page they meant to come back to (e.g. a pro's booking
    // link): go straight there, or through onboarding first.
    const returnPath = safeReturnPath(requestUrl.searchParams.get("return"));
    if (!hasCompletedProfile) {
      const onboarding = new URL("/onboarding", requestUrl.origin);
      if (returnPath) onboarding.searchParams.set("next", returnPath);
      return withConfirmedMarker(NextResponse.redirect(onboarding), "1");
    }
    return withConfirmedMarker(
      NextResponse.redirect(new URL(returnPath || "/requests", requestUrl.origin)),
      "1"
    );
  }

  // No code: Supabase sent an error instead (link expired / already used —
  // often because an email scanner opened it first). For a reset, the reset
  // page shows a clear explanation; browsers carry any #fragment (e.g. tokens
  // from an implicit-flow link) across this redirect.
  return NextResponse.redirect(
    new URL(isRecovery ? "/reset-password" : "/login", requestUrl.origin)
  );
}
