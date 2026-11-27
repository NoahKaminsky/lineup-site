// Open times on a shop's booking page: each pro's weekly hours minus
// everything already on their calendar, and "Anyone" (whoever is free).
// Pure, so it can be tested; ShopBooking draws it.

import { shopNow } from "@/app/lib/bookingTime";

export type SlotPro = { id: string; bookingWindowDays: number; hours: Record<number, [string, string][]> };

export type Busy = { professional_id: string; booking_date: string; start_time: string; end_time: string };

export const DAYS_SHOWN = 14;
// Start times on the half hour, plus the moment a pro frees up (so a 15
// minute gap after a booking isn't lost). Fewer, cleaner choices.
const STEP_MIN = 30;

export const PERIODS = [
  { key: "morning", label: "Morning", from: 0, to: 12 * 60 },
  { key: "afternoon", label: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "evening", label: "Evening", from: 17 * 60, to: 24 * 60 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
const LEAD_MIN = 15; // never offer a time starting in the next 15 minutes

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function toMin(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
// "tomorrow" reads as part of the sentence; weekday names keep their capital.
export function nextDayWord(label: string) {
  return label.toLowerCase() === "tomorrow" ? "tomorrow" : label;
}
export function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hour = h % 12 || 12;
  // Always "4:00pm", never "4pm", so times line up with "4:30pm".
  return `${hour}:${String(m || 0).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}
export function dayName(key: string, today: string) {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

// Open start times for one pro on one day, for an appointment this long.
export function openTimes(pro: SlotPro, busy: Busy[], day: string, minutes: number, today: string, nowMinutes = shopNow().minutes) {
  const offset = Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  if (offset < 0 || offset >= pro.bookingWindowDays) return [];
  const windows = pro.hours[new Date(`${day}T00:00:00`).getDay()] || [];
  const taken = busy
    .filter((b) => b.professional_id === pro.id && b.booking_date === day)
    .map((b) => [toMin(b.start_time), b.end_time.startsWith("24") ? 24 * 60 : toMin(b.end_time)] as const);
  const earliest = day === today ? nowMinutes + LEAD_MIN : -1;
  const out: string[] = [];
  for (const [ws, we] of windows) {
    const start = toMin(ws);
    const end = toMin(we);
    const candidates = new Set<number>();
    for (let t = Math.ceil(start / STEP_MIN) * STEP_MIN; t <= end; t += STEP_MIN) candidates.add(t);
    candidates.add(start);
    // Right when a booking ends, if that's inside their hours.
    for (const [, be] of taken) if (be > start && be < end) candidates.add(be);
    for (const t of candidates) {
      if (t + minutes > end || t <= earliest) continue;
      if (taken.some(([bs, be]) => t < be && t + minutes > bs)) continue;
      out.push(fromMin(t));
    }
  }
  return [...new Set(out)].sort();
}

// "Anyone": the pro who's free at a time, among those who do the service.
// Earliest next opening wins, so the soonest-free pro gets the booking.
export function resolveAnyone<P extends SlotPro>(candidates: P[], busy: Busy[], day: string, time: string, minutesFor: (p: P) => number, today: string) {
  return candidates.find((p) => openTimes(p, busy, day, minutesFor(p), today).includes(time)) || null;
}


