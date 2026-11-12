// Cities and trades for the public "find a pro" pages:
//   /beauty/<city>          every verified pro and shop near that city
//   /beauty/<city>/<trade>  just one trade, e.g. /beauty/winnipeg/barbers
//
// A pro belongs to the nearest city on this list whose centre is within
// CITY_RADIUS_KM of their saved base. Only the city name is ever shown, never
// an address. Add a city here and its pages exist; they only go in the
// sitemap once someone verified is there.

export const CITY_RADIUS_KM = 40;

export type City = { slug: string; name: string; province: string; lat: number; lng: number };

export const CITIES: City[] = [
  { slug: "winnipeg", name: "Winnipeg", province: "MB", lat: 49.8954, lng: -97.1385 },
  { slug: "brandon", name: "Brandon", province: "MB", lat: 49.8485, lng: -99.95 },
  { slug: "steinbach", name: "Steinbach", province: "MB", lat: 49.5258, lng: -96.684 },
  { slug: "portage-la-prairie", name: "Portage la Prairie", province: "MB", lat: 49.9728, lng: -98.2926 },
  { slug: "winkler", name: "Winkler", province: "MB", lat: 49.1817, lng: -97.9397 },
  { slug: "regina", name: "Regina", province: "SK", lat: 50.4452, lng: -104.6189 },
  { slug: "saskatoon", name: "Saskatoon", province: "SK", lat: 52.1332, lng: -106.67 },
  { slug: "calgary", name: "Calgary", province: "AB", lat: 51.0447, lng: -114.0719 },
  { slug: "edmonton", name: "Edmonton", province: "AB", lat: 53.5461, lng: -113.4938 },
  { slug: "red-deer", name: "Red Deer", province: "AB", lat: 52.2681, lng: -113.8112 },
  { slug: "lethbridge", name: "Lethbridge", province: "AB", lat: 49.6956, lng: -112.8451 },
  { slug: "vancouver", name: "Vancouver", province: "BC", lat: 49.2827, lng: -123.1207 },
  { slug: "surrey", name: "Surrey", province: "BC", lat: 49.1913, lng: -122.849 },
  { slug: "kelowna", name: "Kelowna", province: "BC", lat: 49.888, lng: -119.496 },
  { slug: "victoria", name: "Victoria", province: "BC", lat: 48.4284, lng: -123.3656 },
  { slug: "toronto", name: "Toronto", province: "ON", lat: 43.6532, lng: -79.3832 },
  { slug: "mississauga", name: "Mississauga", province: "ON", lat: 43.589, lng: -79.6441 },
  { slug: "brampton", name: "Brampton", province: "ON", lat: 43.7315, lng: -79.7624 },
  { slug: "hamilton", name: "Hamilton", province: "ON", lat: 43.2557, lng: -79.8711 },
  { slug: "ottawa", name: "Ottawa", province: "ON", lat: 45.4215, lng: -75.6972 },
  { slug: "london", name: "London", province: "ON", lat: 42.9849, lng: -81.2453 },
  { slug: "kitchener", name: "Kitchener", province: "ON", lat: 43.4516, lng: -80.4925 },
  { slug: "windsor", name: "Windsor", province: "ON", lat: 42.3149, lng: -83.0364 },
  { slug: "thunder-bay", name: "Thunder Bay", province: "ON", lat: 48.3809, lng: -89.2477 },
  { slug: "montreal", name: "Montreal", province: "QC", lat: 45.5019, lng: -73.5674 },
  { slug: "quebec-city", name: "Quebec City", province: "QC", lat: 46.8139, lng: -71.208 },
  { slug: "halifax", name: "Halifax", province: "NS", lat: 44.6488, lng: -63.5752 },
  { slug: "moncton", name: "Moncton", province: "NB", lat: 46.0878, lng: -64.7782 },
  { slug: "st-johns", name: "St. John's", province: "NL", lat: 47.5615, lng: -52.7126 },
  { slug: "charlottetown", name: "Charlottetown", province: "PE", lat: 46.2382, lng: -63.1311 },
];

// URL word → the professions it covers, and how it reads in a heading.
export type Trade = { slug: string; professions: string[]; plural: string; singular: string };

export const TRADES: Trade[] = [
  { slug: "barbers", professions: ["barber"], plural: "Barbers", singular: "barber" },
  { slug: "hairstylists", professions: ["hairstylist"], plural: "Hairstylists", singular: "hairstylist" },
  { slug: "nail-artists", professions: ["nail_artist"], plural: "Nail artists", singular: "nail artist" },
  { slug: "lash-artists", professions: ["lash_artist"], plural: "Lash artists", singular: "lash artist" },
  { slug: "brow-artists", professions: ["brow_artist"], plural: "Brow artists", singular: "brow artist" },
  { slug: "makeup-artists", professions: ["makeup_artist"], plural: "Makeup artists", singular: "makeup artist" },
  { slug: "waxing", professions: ["wax_technician"], plural: "Waxing pros", singular: "waxing pro" },
  { slug: "sugaring", professions: ["body_sugaring"], plural: "Sugaring pros", singular: "sugaring pro" },
];

export function findCity(slug: string) {
  return CITIES.find((city) => city.slug === slug) || null;
}

export function findTrade(slug: string) {
  return TRADES.find((trade) => trade.slug === slug) || null;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The listed city a point belongs to, or null if none is close enough.
export function cityForPoint(lat: number | null | undefined, lng: number | null | undefined): City | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  let best: City | null = null;
  let bestKm = CITY_RADIUS_KM;
  for (const city of CITIES) {
    const km = distanceKm({ lat, lng }, city);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}
