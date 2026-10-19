// Where to send someone after they sign in, sign up (through email
// confirmation) or finish onboarding: e.g. back to the pro's calendar they
// were about to book. Only same-site paths are accepted, so a crafted link
// can't bounce people to another website.

const KEY = "lu_return_to";

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/onboarding")) return null;
  return path.slice(0, 500);
}

// Kept in localStorage too, so it survives a sign-up's email confirmation
// (which reopens the site in a fresh page).
export function rememberReturnTo(path: string | null | undefined) {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() }));
  } catch {
    // storage unavailable: the ?next= param still carries it
  }
}

// Read and clear. Stale after a day.
export function takeReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw) as { path: string; at: number };
    if (Date.now() - at > 24 * 3600 * 1000) return null;
    return safeReturnPath(path);
  } catch {
    return null;
  }
}

export function loginHref(returnPath: string, mode: "signin" | "signup" = "signin") {
  const params = new URLSearchParams({ next: returnPath });
  if (mode === "signup") params.set("mode", "signup");
  return `/login?${params.toString()}`;
}
