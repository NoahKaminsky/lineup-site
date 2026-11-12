import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { getPublicIssues } from "@/lib/email/issues";
import { CITIES, TRADES } from "@/app/lib/cities";
import { getLocalDirectory } from "@/app/lib/localPros";

// The map Google reads to find every public page. Rebuilt hourly, so a newly
// verified pro or a new shop appears without a deploy. Only pages with
// something on them are listed: verified pros, live shops, and city pages
// that have at least one of those.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl("https://www.lineup-aesthetics.ca");
  const url = (path: string) => `${site}${path}`;
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: url("/discover"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: url("/beauty"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: url("/shops"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/faq"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/news"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: url("/contact"), changeFrequency: "yearly", priority: 0.3 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];

  for (const issue of getPublicIssues()) {
    entries.push({ url: url(`/news/${issue.slug}`), lastModified: new Date(`${issue.date}T12:00:00Z`), priority: 0.5 });
  }

  // If the database is unreachable, still serve the static part.
  try {
    const supabase = getServiceSupabase();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, role, verification_status, verified_until")
      .eq("role", "professional")
      .eq("verification_status", "verified");
    for (const p of profiles || []) {
      if (!isVerifiedNow(p)) continue;
      entries.push({ url: url(getProfileHref(p)), changeFrequency: "weekly", priority: 0.7 });
    }

    const { pros, shops } = await getLocalDirectory();
    for (const shop of shops) {
      entries.push({ url: url(`/shop/${shop.slug}`), changeFrequency: "weekly", priority: 0.7 });
    }

    for (const city of CITIES) {
      const prosHere = pros.filter((p) => p.city.slug === city.slug);
      const shopsHere = shops.filter((s) => s.city.slug === city.slug);
      if (!prosHere.length && !shopsHere.length) continue;
      entries.push({ url: url(`/beauty/${city.slug}`), lastModified: now, changeFrequency: "daily", priority: 0.8 });
      for (const trade of TRADES) {
        const has =
          prosHere.some((p) => p.professions.some((x) => trade.professions.includes(x))) ||
          shopsHere.some((s) => s.trades.some((x) => trade.professions.includes(x)));
        if (has) {
          entries.push({ url: url(`/beauty/${city.slug}/${trade.slug}`), lastModified: now, changeFrequency: "daily", priority: 0.7 });
        }
      }
    }
  } catch (error) {
    console.error("Sitemap: could not load pros and shops", error);
  }

  return entries;
}
