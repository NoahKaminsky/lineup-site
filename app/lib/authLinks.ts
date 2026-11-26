// Where a confirmation link should go when it lands somewhere other than
// /auth/callback. Supabase sends people to the project's Site URL (the home
// page) instead of our callback whenever the address the link was made for
// isn't on its allowed list (www vs bare domain, a preview…), and it adds an
// error instead of a code when the link has expired or was already used.
// Either way the person should still see "Email confirmed" or a clear
// "that link expired", never land on the home page wondering if it worked.
export const CONFIRMED_NEXT = "/login?confirmed=1";

export function strayAuthLanding(url: URL): string | null {
  if (url.pathname !== "/" && url.pathname !== "/login") return null;
  const q = url.searchParams;
  const code = q.get("code");
  if (code && /^[A-Za-z0-9-]{8,200}$/.test(code)) {
    const next = new URLSearchParams({ code, next: CONFIRMED_NEXT });
    return `/auth/callback?${next.toString()}`;
  }
  if (q.get("error_code") || q.get("error") === "access_denied") return "/login?link=expired";
  return null;
}

// The same, for errors Supabase puts after the # (the server never sees those).
export function hashSaysExpired(hash: string) {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  return !!(h.get("error_code") || h.get("error") === "access_denied");
}
