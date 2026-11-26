// A shop's public profile: the rules for what an owner can save (hours,
// contact links, amenities) and how the page reads them ("Open now · closes
// 7 pm"). Pure, so tests/shop can check them.

export type DayHours = [string, string][]; // [["09:00","17:00"], ...]
export type WeekHours = Record<number, DayHours>; // 0 = Sunday

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Things clients look for before they pick a shop. Fixed list, so every shop
// page reads the same way and nothing odd can be typed in.
export const AMENITIES = [
  "Walk-ins welcome",
  "Appointments only",
  "Wheelchair accessible",
  "Free parking",
  "Street parking",
  "Near transit",
  "Kids welcome",
  "Card accepted",
  "Cash accepted",
  "Free Wi-Fi",
  "Drinks offered",
  "Quiet appointments on request",
] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Owner input -> clean hours: valid times, start before end, overlapping
// windows merged, at most 3 a day. Anything else -> null (with a reason).
export function cleanHours(input: unknown): { hours: WeekHours | null; error?: string } {
  if (input === null) return { hours: null };
  if (typeof input !== "object" || Array.isArray(input)) return { hours: null, error: "Those hours don't look right." };
  const out: WeekHours = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { hours: null, error: "Those hours don't look right." };
    if (!Array.isArray(v)) return { hours: null, error: "Those hours don't look right." };
    const windows: [number, number][] = [];
    for (const w of v) {
      if (!Array.isArray(w) || w.length !== 2 || !TIME.test(String(w[0])) || !TIME.test(String(w[1]))) {
        return { hours: null, error: `${DAY_NAMES[day]}: use times like 09:00.` };
      }
      const a = toMin(String(w[0]));
      const b = toMin(String(w[1]));
      if (b <= a) return { hours: null, error: `${DAY_NAMES[day]}: closing time must be after opening time.` };
      windows.push([a, b]);
    }
    windows.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const w of windows) {
      const last = merged[merged.length - 1];
      if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
      else merged.push([...w]);
    }
    if (merged.length > 3) return { hours: null, error: `${DAY_NAMES[day]}: up to 3 opening windows a day.` };
    if (merged.length) out[day] = merged.map(([a, b]) => [fromMin(a), fromMin(b)]);
  }
  return { hours: out };
}

// When the shop hasn't set its own hours: the team's working hours combined.
export function combinedHours(team: WeekHours[]): WeekHours {
  const out: WeekHours = {};
  for (let d = 0; d < 7; d++) {
    const all = team.flatMap((h) => h[d] || []);
    if (!all.length) continue;
    const { hours } = cleanHours({ [d]: all.map((w) => [w[0].slice(0, 5), w[1].slice(0, 5)]) });
    if (hours?.[d]) out[d] = hours[d].slice(0, 3);
  }
  return out;
}

export function time12(t: string) {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

// "Open now · closes 7 pm" / "Closed · opens 9 am" / "Closed · opens Tue 9 am".
export function openStatus(hours: WeekHours, now: { dow: number; minutes: number }): { open: boolean; label: string } | null {
  if (!Object.keys(hours).length) return null;
  const today = hours[now.dow] || [];
  const current = today.find(([a, b]) => now.minutes >= toMin(a) && now.minutes < toMin(b));
  if (current) return { open: true, label: `Open now · closes ${time12(current[1])}` };
  const later = today.find(([a]) => toMin(a) > now.minutes);
  if (later) return { open: false, label: `Closed · opens ${time12(later[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = (now.dow + i) % 7;
    const first = hours[d]?.[0];
    if (first) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : DAY_SHORT[d]} ${time12(first[0])}` };
  }
  return null;
}

export function cleanPhone(input: unknown): { value: string | null; error?: string } {
  if (input === null || input === "") return { value: null };
  const s = String(input).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15 || !/^[+\d\s().-]+$/.test(s)) return { value: null, error: "Enter a phone number like 204-555-0123." };
  return { value: s.replace(/\s+/g, " ") };
}

export function cleanWebsite(input: unknown): { value: string | null; error?: string } {
  if (input === null || input === "") return { value: null };
  let s = String(input).trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    if (!u.hostname.includes(".")) throw new Error();
    return { value: u.toString().replace(/\/$/, "") };
  } catch {
    return { value: null, error: "Enter a website like yourshop.ca." };
  }
}

export function cleanInstagram(input: unknown): { value: string | null; error?: string } {
  if (input === null || input === "") return { value: null };
  const s = String(input)
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return { value: null, error: "Enter your Instagram handle, like @yourshop." };
  return { value: s };
}

export function cleanAmenities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(AMENITIES);
  return [...new Set(input.map(String))].filter((a) => allowed.has(a));
}

export function cleanAbout(input: unknown): { value: string | null; error?: string } {
  if (input === null) return { value: null };
  const s = String(input ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!s) return { value: null };
  if (s.length > 1500) return { value: null, error: "Keep the about section under 1,500 characters." };
  return { value: s };
}

// ── Reviews ─────────────────────────────────────────────────────────────

export type ReviewLite = { rating: number };

export function reviewSummary(reviews: ReviewLite[]) {
  const count = reviews.length;
  const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++;
  const average = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  return { count, average, counts };
}

// "Alex M." from "Alex Morgan": first name and last initial only, on public pages.
export function publicName(full: string | null | undefined) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "LineUp client";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export function cleanReview(input: { rating?: unknown; comment?: unknown }): { rating: number; comment: string | null } | { error: string } {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose 1 to 5 stars." };
  const comment = String(input.comment ?? "").trim();
  if (comment.length > 1000) return { error: "Keep your review under 1,000 characters." };
  return { rating, comment: comment || null };
}
