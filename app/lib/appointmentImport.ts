// Reads an appointments export from another booking app (Squire, Booksy,
// Fresha, Vagaro, Square, a spreadsheet) in the browser. Finds the date,
// time, client and service columns by their headings, understands the usual
// date and time formats, and says which rows it couldn't read, so the pro can
// check the preview before anything is saved.

export type ParsedAppointment = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  service: string | null;
  priceCents: number | null;
  guessedEnd: boolean; // no end or length in the file: one hour assumed
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const pad = (n: number) => String(n).padStart(2, "0");

// "2026-11-20", "11/20/2026", "20/11/2026" (when the day is over 12),
// "Nov 20, 2026", "20 Nov 2026", "Thursday, November 20, 2026".
export function parseDate(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (a > 12 && b <= 12) [a, b] = [b, a]; // day first
    return valid(y, a, b);
  }
  m = s.match(/([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 4)] !== undefined) return valid(+m[3], MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)], +m[2]);
  if (m && MONTHS[m[1].slice(0, 3)]) return valid(+m[3], MONTHS[m[1].slice(0, 3)], +m[2]);
  m = s.match(/(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].slice(0, 3)]) return valid(+m[3], MONTHS[m[2].slice(0, 3)], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// "2:30 PM", "2:30pm", "2pm", "14:30", "14:30:00", "1430".
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  const m = s.match(/(\d{1,2})(?::?(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?\b/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  } else if (!m[2] && !s.includes(":")) {
    return null; // a bare number isn't a time
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

// "45", "45 min", "1h 30m", "1:30", "90 minutes", "1.5 hours".
function parseMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const mm = s.match(/(\d+)\s*m/);
  if (h || mm) return Math.round((h ? +h[1] * 60 : 0) + (mm ? +mm[1] : 0));
  m = s.match(/^(\d{1,3})$/);
  return m ? +m[1] : null;
}

function addMinutes(time: string, minutes: number) {
  const total = +time.slice(0, 2) * 60 + +time.slice(3, 5) + minutes;
  if (total >= 24 * 60) return "23:59";
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

function col(headers: string[], ...names: string[]) {
  const n = headers.map(norm);
  for (const name of names) {
    const i = n.indexOf(name);
    if (i !== -1) return i;
  }
  for (const name of names) {
    const i = n.findIndex((h) => h.includes(name));
    if (i !== -1) return i;
  }
  return -1;
}

export function parseAppointments(text: string): { appointments: ParsedAppointment[]; problems: { line: number; reason: string }[]; headerFound: boolean } {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { appointments: [], problems: [], headerFound: false };
  const first = trimmed.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = splitRows(trimmed, delimiter);
  const header = rows[0] || [];
  const headerFound = header.some((h) => /date|time|start|client|customer|service/i.test(h));
  if (!headerFound) return { appointments: [], problems: [{ line: 1, reason: "No column headings found. The first row should name the columns (Date, Time, Client, Service)." }], headerFound };

  const c = {
    date: col(header, "date", "appointmentdate", "day", "startdate"),
    start: col(header, "starttime", "start", "time", "from", "appointmenttime"),
    end: col(header, "endtime", "end", "to", "finish"),
    length: col(header, "duration", "length", "minutes", "mins"),
    first: col(header, "firstname", "first", "givenname"),
    last: col(header, "lastname", "last", "surname"),
    name: col(header, "clientname", "customername", "client", "customer", "name", "fullname", "guest"),
    phone: col(header, "mobile", "mobilephone", "cell", "phone", "phonenumber"),
    email: col(header, "email", "emailaddress"),
    service: col(header, "service", "services", "servicename", "treatment", "item", "appointment"),
    price: col(header, "price", "total", "amount", "cost"),
  };
  if (c.name === c.first || c.name === c.last) c.name = -1;
  if (c.start === c.date) c.start = -1;

  const appointments: ParsedAppointment[] = [];
  const problems: { line: number; reason: string }[] = [];

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const get = (i: number) => (i >= 0 ? row[i] || "" : "");
    // A combined "2026-11-20 2:30 PM" in the date (or start) column.
    const dateCell = get(c.date) || get(c.start);
    const date = parseDate(dateCell);
    let start = c.start >= 0 ? parseTime(get(c.start)) : null;
    if (!start) start = parseTime(dateCell.replace(/^[^\s,]+[\s,]+/, "").replace(/^\d{4}[^\s]*\s*/, ""));
    if (!date) return problems.push({ line, reason: `Couldn't read the date "${dateCell || "(blank)"}"` });
    if (!start) return problems.push({ line, reason: `Couldn't read the start time on ${date}` });

    let end = c.end >= 0 ? parseTime(get(c.end)) : null;
    let guessedEnd = false;
    if (!end || end <= start) {
      const minutes = c.length >= 0 ? parseMinutes(get(c.length)) : null;
      if (minutes && minutes > 0 && minutes <= 12 * 60) end = addMinutes(start, minutes);
      else {
        end = addMinutes(start, 60);
        guessedEnd = true;
      }
    }

    const name =
      [get(c.first), get(c.last)].join(" ").trim() || get(c.name) || null;
    const priceNum = Number(get(c.price).replace(/[^0-9.]/g, ""));
    appointments.push({
      date,
      start,
      end,
      clientName: name ? name.slice(0, 80) : null,
      clientPhone: get(c.phone).slice(0, 30) || null,
      clientEmail: get(c.email).toLowerCase() || null,
      service: get(c.service).slice(0, 120) || null,
      priceCents: Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null,
      guessedEnd,
    });
  });

  return { appointments, problems, headerFound };
}
