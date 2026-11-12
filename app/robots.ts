import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/app/lib/siteUrl";

// Search engines may crawl the public pages (landing, info pages, news, pro
// profiles, shop pages, city pages). Signed-in areas and the API are off
// limits; they hold nothing useful to a search result anyway.
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl("https://www.lineup-aesthetics.ca");

  // Preview (test site) builds should never be indexed.
  if (process.env.VERCEL_ENV === "preview") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/account",
          "/analytics",
          "/archive",
          "/auth/",
          "/bookings",
          "/calendar",
          "/chairs",
          "/onboarding",
          "/requests",
          "/reset-password",
          "/services",
          "/studio",
          "/subscription",
          "/unsubscribe",
          "/verification",
          "/work",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
