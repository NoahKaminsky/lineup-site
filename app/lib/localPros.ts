// Server only: uses the service key. Never import from a client component.
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { getProfileHref } from "@/app/lib/profileLink";
import { getProfessionalTypes, professionLabel } from "@/app/lib/professions";
import { isStudioLive } from "@/app/lib/studios";
import { cityForPoint, type City } from "@/app/lib/cities";

// Server-only data for the public city pages and the sitemap. Same rule as
// Browse: only verified pros are listed. Only public details leave here
// (name, photo, trades, rating, city), never an address or a point.

export type LocalPro = {
  id: string;
  href: string;
  name: string;
  avatarUrl: string | null;
  professions: string[]; // keys, e.g. "barber"
  professionLabels: string[];
  rating: number | null;
  reviewCount: number;
  city: City;
};

export type LocalShop = { slug: string; name: string; tagline: string | null; trades: string[]; city: City };

export async function getLocalDirectory(): Promise<{ pros: LocalPro[]; shops: LocalShop[] }> {
  const supabase = getServiceSupabase();

  const [{ data: profiles }, { data: reviews }, { data: studios }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, username, full_name, business_name, avatar_url, role, professional_type, professional_types, location_lat, location_lng, verification_status, verified_until"
      )
      .eq("role", "professional")
      .not("location_lat", "is", null),
    supabase.from("professional_reviews").select("professional_id, rating"),
    supabase
      .from("studios")
      .select("slug, name, tagline, trades, lat, lng, plan, subscription_status")
      .not("slug", "is", null),
  ]);

  const ratings = new Map<string, { sum: number; count: number }>();
  for (const row of reviews || []) {
    const r = Number(row.rating);
    if (!Number.isFinite(r)) continue;
    const entry = ratings.get(row.professional_id) || { sum: 0, count: 0 };
    entry.sum += r;
    entry.count += 1;
    ratings.set(row.professional_id, entry);
  }

  const pros: LocalPro[] = [];
  for (const p of profiles || []) {
    if (!isVerifiedNow(p)) continue;
    const city = cityForPoint(p.location_lat, p.location_lng);
    if (!city) continue;
    const professions = getProfessionalTypes(p);
    const r = ratings.get(p.id);
    pros.push({
      id: p.id,
      href: getProfileHref(p),
      name: p.full_name?.trim() || p.business_name?.trim() || "LineUp pro",
      avatarUrl: p.avatar_url,
      professions,
      professionLabels: professions.map(professionLabel),
      rating: r ? Math.round((r.sum / r.count) * 10) / 10 : null,
      reviewCount: r?.count || 0,
      city,
    });
  }
  // Most-reviewed first, then best rated, then by name.
  pros.sort(
    (a, b) => b.reviewCount - a.reviewCount || (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name)
  );

  const shops: LocalShop[] = [];
  for (const s of studios || []) {
    if (!isStudioLive(s)) continue;
    const city = cityForPoint(s.lat, s.lng);
    if (!city || !s.slug) continue;
    shops.push({
      slug: s.slug,
      name: s.name || "LineUp shop",
      tagline: s.tagline,
      trades: Array.isArray(s.trades) ? s.trades : [],
      city,
    });
  }

  return { pros, shops };
}
