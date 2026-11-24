// The address links in emails and Stripe redirects should point to.
//
// On a Vercel preview (a branch's test copy) it's that branch's own address,
// so testing never sends people to the live site, and NEXT_PUBLIC_SITE_URL
// doesn't need a separate preview value. Under `npm run dev` it's this
// machine (LOCAL_SITE_URL, default http://localhost:3000), so Stripe sends a
// local test back to the local app instead of the live site. In production
// it's NEXT_PUBLIC_SITE_URL. Server-side only (VERCEL_* aren't in the browser).
export function getSiteUrl(fallback = "http://localhost:3000", env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL) {
    return `https://${env.VERCEL_BRANCH_URL}`;
  }
  if (env.NODE_ENV === "development" && !env.VERCEL_ENV) {
    return env.LOCAL_SITE_URL || "http://localhost:3000";
  }
  return env.NEXT_PUBLIC_SITE_URL || fallback;
}
