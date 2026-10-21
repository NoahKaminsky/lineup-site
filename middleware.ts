import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on each page request. Without this, a
// cookie-based session can go stale between requests since nothing else
// proactively refreshes it server-side (the browser client only refreshes
// on its own timer while a tab is actively open).
//
// getClaims() rather than getUser(): it verifies the JWT locally (refreshing
// it first if it has expired), so a page load no longer waits on a round
// trip to the Supabase Auth server before anything else can start.
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  // Signed-in visitors skip the landing page entirely — sent straight to
  // their dashboard from the server, instead of downloading the landing page,
  // checking auth in the browser, then navigating.
  if (signedIn && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/requests";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Pages only. API routes authenticate each call themselves (bearer token
    // or cookie), and static files/media never need a session.
    "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|woff2?|txt|xml|json|js)$).*)",
  ],
};
