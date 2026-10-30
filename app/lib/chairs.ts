// Chair openings: studios post an open chair, and only professionals in the
// matching trade can see it. Server-only.

import type { getServiceSupabase } from "./serverSupabase";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export const OPENING_COLUMNS =
  "id, studio_id, posted_by, title, professions, arrangement, rent_cents, rent_interval, commission_note, description, available_from, area_label, lat, lng, status, expires_at, created_at";

export type ChairOpeningRow = {
  id: string;
  studio_id: string;
  posted_by: string | null;
  title: string;
  professions: string[];
  arrangement: "booth_rent" | "commission" | "either";
  rent_cents: number | null;
  rent_interval: "week" | "month" | null;
  commission_note: string | null;
  description: string | null;
  available_from: string | null;
  area_label: string | null;
  lat: number | null;
  lng: number | null;
  status: "open" | "filled" | "closed";
  expires_at: string;
  created_at: string;
};

// Pros hear about openings this far away when they haven't set a radius.
export const DEFAULT_NOTIFY_RADIUS_KM = 50;
// Openings stay up this long unless filled or closed sooner.
export const OPENING_DAYS = 30;

export function proTypes(profile: { professional_types?: string[] | null; professional_type?: string | null }) {
  const types = Array.isArray(profile.professional_types) ? profile.professional_types.filter(Boolean) : [];
  if (types.length) return types;
  return profile.professional_type ? [profile.professional_type] : [];
}

export function distanceKm(aLat: number | null | undefined, aLng: number | null | undefined, bLat: number | null | undefined, bLng: number | null | undefined) {
  if (typeof aLat !== "number" || typeof aLng !== "number" || typeof bLat !== "number" || typeof bLng !== "number") return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// "123 Main St, Winnipeg, MB R3C 1A1, Canada" → "Winnipeg, MB". Openings only
// show the area, not the street.
export function areaFromAddress(address: string | null | undefined) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 3];
    const province = parts[parts.length - 2].split(/\s+/)[0];
    return `${city}, ${province}`;
  }
  return parts.length === 2 ? parts[0] : null;
}

// Active "featured" boosts for chair openings.
export async function featuredOpeningIds(supabase: ServiceClient, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const { data } = await supabase
    .from("boosts")
    .select("target_id")
    .eq("kind", "chair_opening")
    .in("target_id", ids)
    .lte("starts_at", new Date().toISOString())
    .gt("ends_at", new Date().toISOString());
  return new Set((data || []).map((b) => b.target_id as string));
}

// Tell nearby pros in the right trade about a new opening (in-app
// notification). Capped so one post can't flood the table.
export async function notifyMatchingPros(supabase: ServiceClient, opening: ChairOpeningRow, studioName: string, excludeIds: string[]) {
  const { data: pros } = await supabase
    .from("profiles")
    .select("id, role, professional_type, professional_types, location_lat, location_lng, service_radius_km")
    .eq("role", "professional")
    .limit(5000);

  const exclude = new Set(excludeIds);
  const recipients = (pros || [])
    .filter((p) => !exclude.has(p.id))
    .filter((p) => proTypes(p).some((t) => opening.professions.includes(t)))
    .filter((p) => {
      const km = distanceKm(opening.lat, opening.lng, p.location_lat, p.location_lng);
      if (km === null) return true; // no location on either side: don't exclude
      return km <= (Number(p.service_radius_km) || DEFAULT_NOTIFY_RADIUS_KM);
    })
    .slice(0, 500);

  if (!recipients.length) return 0;

  const where = opening.area_label ? ` in ${opening.area_label}` : "";
  await supabase.from("notifications").insert(
    recipients.map((p) => ({
      user_id: p.id,
      request_id: null,
      is_read: false,
      type: "chair_opening",
      title: `Chair opening: ${studioName} is looking for someone${where}`,
    }))
  );
  return recipients.length;
}
