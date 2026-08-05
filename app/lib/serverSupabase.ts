import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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
      "id, email, full_name, role, professional_type, professional_types, email_request_notifications"
    )
    .eq("id", userId)
    .maybeSingle();

  let email = profile?.email || null;

  if (!email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email || null;
  }

  return { ...(profile || { id: userId }), email };
}
