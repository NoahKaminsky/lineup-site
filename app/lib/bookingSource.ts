// Where a client found a pro, worked out in the browser when they open the
// pro's profile and logged with that profile visit. When the client books,
// the database stamps the booking's came_from from their latest visit
// (migration 20261125_booking_came_from.sql), so no payment code changes.
//
//   spotlight / boost / discover   tapped in Discover (the Spotlight card,
//                                   a boosted pro, or anywhere else there)
//   referral                       a link with ?ref=
//   booking_link                   the page was opened from outside LineUp
//                                   (Instagram, a text, typed in)
//   null                           moved around inside LineUp otherwise
// Requests, regulars and gift cards are known from the booking itself.

export type VisitSource = "spotlight" | "boost" | "discover" | "referral" | "booking_link";
export const VISIT_SOURCES: VisitSource[] = ["spotlight", "boost", "discover", "referral", "booking_link"];

const KEY = "lu-visit-via";
const FRESH_MS = 30 * 60_000;

type Pending = { path: string; via: VisitSource; at: number };

// Discover: remember which card was tapped, just before the profile opens.
export function markDiscoverTap(path: string, via: "spotlight" | "boost" | "discover") {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, via, at: Date.now() } satisfies Pending));
  } catch {
    /* private mode */
  }
}

export function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

export function visitSource(input: {
  path: string; // the profile page's pathname
  search: string;
  origin: string;
  referrer: string;
  firstLoadUrl: string | null; // the URL this browser tab first loaded (performance navigation entry)
  href: string; // the current URL
  pending: Pending | null;
  now: number;
}): VisitSource | null {
  if (new URLSearchParams(input.search).get("ref")) return "referral";
  const p = input.pending;
  if (p && p.path === input.path && input.now - p.at <= FRESH_MS) return p.via;
  // Opened straight onto this profile: from outside LineUp, unless the
  // referrer is LineUp itself (a reload or a full page change inside it).
  const landedHere = !!input.firstLoadUrl && input.firstLoadUrl.split("#")[0] === input.href.split("#")[0];
  if (landedHere) {
    let refOrigin: string | null = null;
    try {
      refOrigin = input.referrer ? new URL(input.referrer).origin : null;
    } catch {
      refOrigin = null;
    }
    return refOrigin === input.origin ? null : "booking_link";
  }
  return null;
}
