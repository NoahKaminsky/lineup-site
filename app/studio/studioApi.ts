import { supabase } from "@/lib/supabaseClient";

// Speed: GETs are remembered for this tab (sessionStorage), so a revisit
// paints instantly from the last answer while a fresh one loads, and two
// callers asking for the same thing at once share one request. The memory
// is wiped whenever someone signs in or out, so switching accounts never
// shows the last person's shop.
const CACHE_PREFIX = "lu-studio:";
type Result<T> = { ok: boolean; status: number; data: T & { error?: string; code?: string } };
const inflight = new Map<string, Promise<Result<unknown>>>();

function clearStudioCache() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") clearStudioCache();
  });
}

// The last good answer for a GET, if this tab has one.
export function peekStudio<T>(path: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Calls /api/studio/* with the signed-in user's token.
export async function studioFetch<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Result<T>> {
  const method = options.method || "GET";
  if (method === "GET") {
    const pending = inflight.get(path);
    if (pending) return pending as Promise<Result<T>>;
    const p = rawFetch<T>(path, options).then((res) => {
      inflight.delete(path);
      try {
        if (res.ok) sessionStorage.setItem(CACHE_PREFIX + path, JSON.stringify(res.data));
      } catch {
        /* full or unavailable: fine */
      }
      return res;
    });
    inflight.set(path, p as Promise<Result<unknown>>);
    return p;
  }
  // Anything that changes data makes the remembered answers stale.
  const res = await rawFetch<T>(path, options);
  if (res.ok) clearStudioCache();
  return res;
}

async function rawFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Result<T>> {
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
