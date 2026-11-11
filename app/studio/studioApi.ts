import { supabase } from "@/lib/supabaseClient";

// Speed: GETs are remembered on this device (localStorage, a day at most),
// keyed by who's signed in, so the shop paints instantly from the last answer
// while a fresh one loads, even after closing the browser. Two callers asking
// for the same thing at once share one request. Signing out wipes it, and a
// different account never reads another's entries.
const CACHE_PREFIX = "lu-studio:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
type Result<T> = { ok: boolean; status: number; data: T & { error?: string; code?: string } };
const inflight = new Map<string, Promise<Result<unknown>>>();

// The signed-in user's id, read synchronously from the auth cookie.
function currentUid(): string | null {
  try {
    const raw = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => /^sb-[^=]+-auth-token=/.test(c));
    if (!raw) return null;
    let value = decodeURIComponent(raw.slice(raw.indexOf("=") + 1));
    if (value.startsWith("base64-")) value = atob(value.slice(7).replace(/-/g, "+").replace(/_/g, "/"));
    const session = JSON.parse(value) as { user?: { id?: string } };
    return session.user?.id ?? null;
  } catch {
    return null;
  }
}

function cacheKey(path: string) {
  const uid = currentUid();
  return uid ? `${CACHE_PREFIX}${uid}:${path}` : null;
}

function clearStudioCache() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") clearStudioCache();
  });
}

// The last good answer for a GET, if this device has one for this user.
export function peekStudio<T>(path: string): T | null {
  try {
    const key = cacheKey(path);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { t: number; d: T };
    if (Date.now() - entry.t > CACHE_TTL_MS) return null;
    return entry.d;
  } catch {
    return null;
  }
}

function remember(path: string, data: unknown) {
  try {
    const key = cacheKey(path);
    if (key) localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    /* full or unavailable: fine */
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
      if (res.ok) remember(path, res.data);
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
