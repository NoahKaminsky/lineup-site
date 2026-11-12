// Server only. A pro's private calendar feed link:
//   /api/calendar/feed/<profileId>-<signature>.ics
// The signature is an HMAC of the profile id, so the link can't be guessed
// from someone's id and needs nothing stored. Anyone holding the link can
// read the feed, so it carries client first names only, never phone numbers.
//
// To revoke every link at once (e.g. one leaked), set CALENDAR_FEED_SECRET to
// a new value. Bump VERSION to do the same without a new secret.

import { createHmac, timingSafeEqual } from "crypto";

const VERSION = "v1";

function secret() {
  const value = process.env.CALENDAR_FEED_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("No secret for calendar feeds");
  return value;
}

function sign(profileId: string) {
  return createHmac("sha256", secret()).update(`calendar-feed:${VERSION}:${profileId}`).digest("base64url").slice(0, 32);
}

export function calendarFeedPath(profileId: string) {
  return `/api/calendar/feed/${profileId}-${sign(profileId)}.ics`;
}

const KEY = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([A-Za-z0-9_-]{32})(\.ics)?$/;

// The profile id a feed key belongs to, or null if the key is wrong.
export function verifyCalendarFeedKey(key: string): string | null {
  const match = KEY.exec(key);
  if (!match) return null;
  const [, profileId, given] = match;
  const expected = Buffer.from(sign(profileId));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? profileId : null;
}
