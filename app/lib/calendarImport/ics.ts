import ICAL from "ical.js";
import { shopDateTimeOf, shopNow } from "@/app/lib/bookingTime";
import { findEmail, findLabelledName, findPhone, splitTitle } from "./client";
import { findProInText, matchPro } from "./match";
import type { ImportRow, ParsedFile, SkippedRow, TeamPro } from "./types";

// Reads an .ics export from Apple Calendar, Google Calendar or Outlook.
//
// Times: an event's clock time is kept as-is when it was written in
// Winnipeg / Central time or with no zone at all, so "10:00" stays 10:00
// no matter which daylight-saving rules the exporting app still carries
// (Manitoba stopped changing clocks on Nov 1, 2026). Times in UTC or any
// other zone are converted to the shop clock.
//
// Repeating events are expanded into single visits from today up to six
// months out, honouring removed dates (EXDATE), moved or edited visits
// (RECURRENCE-ID) and cancelled ones. All-day events are skipped.

const HORIZON_DAYS = 183;
const HISTORY_DAYS = 730;
const MAX_ROWS = 5000;

// Zone names that mean "the shop's own clock" for a Manitoba shop.
const WALL_ZONES = /winnipeg|canada\/central|^central standard time$|^central time|^\(utc-0?[56]:00\) central/i;

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

// Offset (ms) of an IANA zone from UTC at an instant, via Intl.
function zoneOffset(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

function isIanaZone(name: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// One calendar time to a shop-clock date and time.
function toShop(time: ICAL.Time): { date: string; time: string } {
  // An unregistered TZID is kept on the time as `timezone` (not in the types).
  const loose = (time as unknown as { timezone?: string }).timezone;
  const tzid = String((time.zone && time.zone.tzid) || loose || "floating");
  const wall = { date: `${time.year}-${pad(time.month)}-${pad(time.day)}`, time: `${pad(time.hour)}:${pad(time.minute)}` };
  if (tzid === "floating" || WALL_ZONES.test(tzid)) return wall;
  if (tzid === "UTC" || tzid === "Z" || time.zone === ICAL.Timezone.utcTimezone) {
    return shopDateTimeOf(new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute)));
  }
  if (isIanaZone(tzid)) {
    const asUtc = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
    let instant = asUtc - zoneOffset(asUtc, tzid);
    instant = asUtc - zoneOffset(instant, tzid);
    return shopDateTimeOf(new Date(instant));
  }
  // A zone only this file defines (Outlook's Windows names): let ical.js
  // apply the file's own VTIMEZONE rules.
  if (time.zone && time.zone !== ICAL.Timezone.localTimezone) return shopDateTimeOf(time.toJSDate());
  return wall;
}

function text(component: ICAL.Component, name: string) {
  const value = component.getFirstPropertyValue(name);
  return value == null ? "" : String(value).trim();
}

function attendees(component: ICAL.Component) {
  const organizer = String(component.getFirstPropertyValue("organizer") || "").replace(/^mailto:/i, "").toLowerCase();
  return component.getAllProperties("attendee").map((p) => {
    const email = String(p.getFirstValue() || "").replace(/^mailto:/i, "").toLowerCase();
    const name = String(p.getParameter("cn") || "").trim();
    return { email: email.includes("@") && email !== organizer ? email : null, name: name && !name.includes("@") ? name : null };
  });
}

export function parseIcs(content: string, fileId: string, team: TeamPro[]): ParsedFile {
  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(content));
  } catch {
    throw new Error("This calendar file couldn't be read. Try exporting it again.");
  }
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* a broken zone: its events fall back to their clock time */
    }
  }

  const today = shopNow().dateKey;
  const horizon = addDays(today, HORIZON_DAYS);
  const oldest = addDays(today, -HISTORY_DAYS);

  // Masters and their edited visits, grouped by UID.
  const vevents = root.getAllSubcomponents("vevent");
  const exceptions = new Map<string, ICAL.Component[]>();
  const masters: ICAL.Component[] = [];
  for (const ve of vevents) {
    if (ve.hasProperty("recurrence-id")) {
      const uid = text(ve, "uid");
      exceptions.set(uid, [...(exceptions.get(uid) || []), ve]);
    } else masters.push(ve);
  }

  let n = 0;
  // `series` is the repeating event an edited visit belongs to: its notes and
  // invitees fill in whatever the edited copy left out.
  const push = (item: ICAL.Component, start: ICAL.Time, end: ICAL.Time, repeating: boolean, series: ICAL.Component = item) => {
    const title = text(item, "summary");
    const where = title || "Untitled event";
    if (start.isDate) {
      skipped.push({ fileId, where, reason: "All-day event, so there's no time to hold" });
      return;
    }
    const s = toShop(start);
    const e = toShop(end);
    if (text(item, "status").toUpperCase() === "CANCELLED") {
      const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      skipped.push({ fileId, where: repeating ? `${where}, ${day}` : where, reason: "Cancelled in the calendar" });
      return;
    }
    if (s.date < oldest) {
      skipped.push({ fileId, where, reason: "More than two years ago" });
      return;
    }
    if (e.date !== s.date || e.time <= s.time) {
      skipped.push({ fileId, where, reason: e.date !== s.date ? "Runs past midnight" : "Ends before it starts" });
      return;
    }

    const notes = text(item, "description") || text(series, "description");
    const people = item.hasProperty("attendee") ? attendees(item) : attendees(series);
    const titleName = findProInText(title, team);
    let proId = titleName.proId;
    let confidence = titleName.confidence;
    let staffText: string | null = null;
    // An invitee who's on the team tells us whose appointment it is.
    if (!proId) {
      for (const person of people) {
        const m = matchPro(person.name, team);
        if (m.proId) {
          proId = m.proId;
          confidence = m.confidence;
          staffText = person.name;
          break;
        }
      }
    }
    const client = people.find((p) => !matchPro(p.name, team).proId);
    const split = splitTitle(titleName.rest);
    rows.push({
      key: `${fileId}:${n++}`,
      fileId,
      where,
      date: s.date,
      start: s.time,
      end: e.time,
      clientName: (findLabelledName(notes) || split.client || client?.name || null)?.slice(0, 80) || null,
      clientPhone: findPhone(notes) || findPhone(title),
      clientEmail: client?.email || findEmail(notes),
      service: split.service?.slice(0, 120) || null,
      priceCents: null,
      staffText: staffText || (proId ? title : null),
      proId,
      confidence: proId ? confidence : "none",
      guessedEnd: false,
      repeating,
    });
  };

  for (const master of masters) {
    if (rows.length >= MAX_ROWS) break;
    const event = new ICAL.Event(master);
    if (!event.startDate) {
      skipped.push({ fileId, where: text(master, "summary") || "Untitled event", reason: "No start time" });
      continue;
    }
    for (const ex of exceptions.get(event.uid) || []) {
      try {
        event.relateException(ex);
      } catch {
        /* an edit that doesn't belong to this event */
      }
    }

    if (!event.isRecurring()) {
      push(master, event.startDate, event.endDate, false);
      continue;
    }

    if (text(master, "status").toUpperCase() === "CANCELLED") {
      skipped.push({ fileId, where: event.summary || "Untitled event", reason: "Cancelled in the calendar (every repeat)" });
      continue;
    }

    const it = event.iterator();
    let guard = 0;
    for (let next = it.next(); next && guard < 2000 && rows.length < MAX_ROWS; next = it.next(), guard++) {
      const details = event.getOccurrenceDetails(next);
      const day = toShop(details.startDate).date;
      if (day > horizon) break;
      if (day < today) continue;
      push(details.item.component, details.startDate, details.endDate, true, master);
    }
  }

  return { rows, skipped };
}
