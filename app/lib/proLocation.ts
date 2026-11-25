// Bookings at the pro's place (their shop or home studio) take the pro's saved
// address. The payment webhook refuses to create such a booking without it, so
// checkout must refuse first: otherwise the card is charged and no booking is made.
export function usesProLocation(mode: string | null | undefined) {
  return mode === "in_shop" || mode === "home_studio";
}

export function hasProLocation(profile: {
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
} | null | undefined) {
  return Boolean(profile?.formatted_address) && typeof profile?.location_lat === "number" && typeof profile?.location_lng === "number";
}

export const PRO_LOCATION_MISSING =
  "This pro needs to add their shop or studio address before this can be booked. Message them, or pick another offer.";
