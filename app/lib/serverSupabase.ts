import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Constant-time string compare, so a secret can't be guessed one character at
// a time by measuring how long a rejected request takes.
export function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// For scheduled jobs and server-to-server calls. Fails CLOSED: if CRON_SECRET
// isn't configured, nobody gets in (these routes used to be wide open when the
// variable was missing).
export function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing scheduled/internal request.");
    return false;
  }
  return safeEqual(req.headers.get("authorization"), `Bearer ${secret}`);
}

// Rejects POSTs sent from other websites. Browsers always send Origin on a
// cross-site fetch, so this blocks someone embedding calls to our API (and
// spending our Google/Twilio quota) from their own page. It is not a
// substitute for real auth checks.
export function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin GETs and non-browser callers
  try {
    const originHost = new URL(origin).host;
    const requestHost = new URL(req.url).host;
    const siteHost = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
      : null;
    const bare = (h: string) => h.replace(/^www\./, "");
    return (
      bare(originHost) === bare(requestHost) ||
      (!!siteHost && bare(originHost) === bare(siteHost))
    );
  } catch {
    return false;
  }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // This can happen inside Server Components.
            // Auth still works for reading the session.
          }
        },
      },
    }
  );
}

// The client-side Supabase client (lib/supabaseClient.ts) stores its session in
// localStorage, not cookies — so createSupabaseServerClient() alone never sees a
// logged-in user on the server. Routes called from client components must send
// `Authorization: Bearer <access_token>` and use this helper instead.
export async function getAuthenticatedUser(req: Request) {
  const serviceSupabase = getServiceSupabase();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : null;

  if (token) {
    const { data, error } = await serviceSupabase.auth.getUser(token);

    if (!error && data?.user) {
      return data.user;
    }
  }

  const authSupabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await authSupabase.auth.getUser();

  if (error || !user) return null;

  return user;
}

// For admin-only API routes. Checks the requesting user's profile.is_admin flag
// via the service role (bypasses RLS) — never trust a client-sent admin claim.
export async function requireAdmin(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;

  const service = getServiceSupabase();
  const { data: profile } = await service
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;

  return user;
}

export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getProfileEmail(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, professional_type, professional_types, email_request_notifications, phone_number, sms_notifications_enabled"
    )
    .eq("id", userId)
    .maybeSingle();

  let email = profile?.email || null;

  if (!email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email || null;
  }

  return {
    ...(profile || { id: userId, phone_number: null, sms_notifications_enabled: null }),
    email,
  };
}

// Who's signed in, for server pages. getClaims() verifies the session JWT's
// signature locally (Supabase's asymmetric signing keys, keys cached), so it
// skips the extra round trip to the Auth server that getUser() makes on every
// page load. If the project still uses the legacy shared secret, getClaims()
// itself falls back to asking the Auth server — same result as before.
// Pages only need the id; all their reads still go through RLS with the token.
export async function getVerifiedUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!error && typeof sub === "string" && sub) return { id: sub };
    if (!error) return null;
  } catch {
    // fall through to the network check
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}
