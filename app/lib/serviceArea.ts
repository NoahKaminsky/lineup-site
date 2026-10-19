// Service areas: a professional covers requests within `service_radius_km`
// of their base (the location saved in Services). Requests carry an
// approximate point (area_lat/area_lng, rounded to ~1 km) and a city-level
// label, so matching never needs, or shows, anyone's exact address.

export const SERVICE_RADIUS_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_SERVICE_RADIUS_KM = 50;

type Point = { lat: number; lng: number };

export function distanceKm(a: Point, b: Point) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ~1 km precision: enough to match on, not enough to find a front door.
export function roundForArea(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function requestPoint(request: {
  area_lat?: number | null;
  area_lng?: number | null;
  location_lat?: number | null;
  location_lng?: number | null;
}): Point | null {
  const lat = request.area_lat ?? request.location_lat;
  const lng = request.area_lng ?? request.location_lng;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

export function proBase(pro: { location_lat?: number | null; location_lng?: number | null }): Point | null {
  return typeof pro.location_lat === "number" && typeof pro.location_lng === "number"
    ? { lat: pro.location_lat, lng: pro.location_lng }
    : null;
}

// null radius = anywhere. Unknown points don't exclude (old requests, pros
// without a base yet), so nobody silently loses requests.
export function withinServiceArea(
  pro: { location_lat?: number | null; location_lng?: number | null; service_radius_km?: number | null },
  request: Parameters<typeof requestPoint>[0]
) {
  const radius = pro.service_radius_km === undefined ? DEFAULT_SERVICE_RADIUS_KM : pro.service_radius_km;
  if (radius === null) return true;
  const base = proBase(pro);
  const point = requestPoint(request);
  if (!base || !point) return true;
  return distanceKm(base, point) <= radius;
}

// "~8 km away" for a professional looking at a request.
export function approxDistanceLabel(
  pro: { location_lat?: number | null; location_lng?: number | null },
  request: Parameters<typeof requestPoint>[0]
) {
  const base = proBase(pro);
  const point = requestPoint(request);
  if (!base || !point) return null;
  const km = distanceKm(base, point);
  return km < 1 ? "Under 1 km away" : `~${Math.round(km)} km away`;
}
