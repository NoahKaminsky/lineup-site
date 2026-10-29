import { supabase } from "@/lib/supabaseClient";

// Calls /api/studio/* with the signed-in user's token.
export async function studioFetch<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(path, {
    method: options.method || "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function formatCad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}
