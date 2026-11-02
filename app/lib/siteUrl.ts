// The address links in emails and Stripe redirects should point to.
//
// On a Vercel preview (a branch's test copy) it's that branch's own address,
// so testing never sends people to the live site, and NEXT_PUBLIC_SITE_URL
// doesn't need a separate preview value. In production it's
// NEXT_PUBLIC_SITE_URL. Server-side only (VERCEL_* aren't in the browser).
export function getSiteUrl(fallback = "http://localhost:3000") {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || fallback;
}
