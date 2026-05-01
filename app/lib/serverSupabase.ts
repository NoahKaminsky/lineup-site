import { createClient } from "@supabase/supabase-js";

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
    .select("id, email, full_name, role, professional_type, professional_types, email_request_notifications")
    .eq("id", userId)
    .maybeSingle();

  let email = profile?.email || null;

  if (!email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email || null;
  }

  return { ...(profile || { id: userId }), email };
}
