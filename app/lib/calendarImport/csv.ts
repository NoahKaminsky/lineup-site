import { addMinutes, parseDate, parseMinutes, parseTime, splitRows } from "@/app/lib/appointmentImport";
import { shopNow } from "@/app/lib/bookingTime";
import { matchPro } from "./match";
import type { ImportRow, ParsedFile, SkippedRow, TeamPro } from "./types";

// Reads a CSV export from Squire, Booksy, Fresha, Square or a spreadsheet.
// Columns are found by their headings; when the date or start time can't be
// found, the owner matches them by hand (see CsvMapping).

export const CSV_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "start", label: "Start time", required: true },
  { key: "end", label: "End time" },
  { key: "duration", label: "Length" },
  { key: "staff", label: "Team member" },
  { key: "client", label: "Client name" },
  { key: "first", label: "Client first name" },
  { key: "last", label: "Client last name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "service", label: "Service" },
  { key: "price", label: "Price" },
] as const;

export type CsvField = (typeof CSV_FIELDS)[number]["key"];
export type CsvMapping = Record<CsvField, number>; // column index, -1 for none

export type CsvTable = { headers: string[]; body: string[][]; mapping: CsvMapping; needsMapping: boolean };

// Headings the big apps use, in order of preference (compared without
// spaces or punctuation).
const NAMES: Record<CsvField, string[]> = {
  date: ["date", "appointmentdate", "scheduleddate", "bookingdate", "startdate", "day", "datetime", "startdatetime", "scheduled", "starts", "startsat", "appointmentdatetime"],
  start: ["starttime", "start", "time", "appointmenttime", "from", "begins", "bookingtime", "scheduledtime", "startsat"],
  end: ["endtime", "end", "finish", "finishtime", "to", "ends", "endsat"],
  duration: ["duration", "durationminutes", "durationmins", "length", "minutes", "mins", "servicelength", "servicedurationminutes"],
  staff: ["staff", "staffmember", "staffname", "teammember", "employee", "employeename", "provider", "barber", "stylist", "artist", "professional", "pro", "technician", "resource", "assignedto", "with", "teammembername"],
  client: ["clientname", "customername", "client", "customer", "guest", "guestname", "fullname", "name", "clientfullname", "customerfullname"],
  first: ["firstname", "clientfirstname", "customerfirstname", "first", "givenname"],
  last: ["lastname", "clientlastname", "customerlastname", "last", "surname", "familyname"],
  phone: ["phone", "mobile", "mobilephone", "cell", "phonenumber", "clientphone", "customerphone", "mobilenumber", "telephone"],
  email: ["email", "emailaddress", "clientemail", "customeremail"],
  service: ["service", "services", "servicename", "treatment", "item", "itemname", "appointment", "servicetitle", "appointmenttype"],
  price: ["price", "total", "amount", "cost", "serviceprice", "grosssales", "subtotal"],
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

export function readCsv(content: string): CsvTable {
  const trimmed = content.replace(/^﻿/, "").trim();
  if (!trimmed) throw new Error("This file is empty.");
  const first = trimmed.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = splitRows(trimmed, delimiter);
  if (rows.length < 2) throw new Error("This file has no appointments in it, just a heading row (or nothing).");
  const headers = rows[0];
  const n = headers.map(norm);
  const used = new Set<number>();
  const mapping = {} as CsvMapping;
  for (const field of CSV_FIELDS) {
    let index = -1;
    for (const name of NAMES[field.key]) {
      const i = n.findIndex((h, idx) => h === name && !used.has(idx));
      if (i !== -1) {
        index = i;
        break;
      }
    }
    mapping[field.key] = index;
    if (index !== -1 && field.key !== "start") used.add(index);
  }
  // A combined "date and time" column can serve as both.
  if (mapping.start === -1 && mapping.date !== -1) {
    const sample = rows.slice(1, 6).map((r) => r[mapping.date] || "");
    if (sample.some((v) => parseTime(v.replace(/^\S+\s*/, "")))) mapping.start = mapping.date;
  }
  if (mapping.client !== -1 && (mapping.client === mapping.first || mapping.client === mapping.last)) mapping.client = -1;
  return { headers, body: rows.slice(1), mapping, needsMapping: mapping.date === -1 || mapping.start === -1 };
}

export function csvRows(table: CsvTable, fileId: string, team: TeamPro[]): ParsedFile {
  const { mapping: c, body } = table;
  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];
  const today = shopNow().dateKey;
  const oldest = new Date(`${today}T12:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - 730);
  const oldestKey = oldest.toISOString().slice(0, 10);

  // Squire, Booksy and Square include a status column on full exports.
  const statusCol = table.headers.map(norm).findIndex((h) => h === "status" || h === "appointmentstatus" || h === "bookingstatus");

  body.forEach((row, index) => {
    const where = `Line ${index + 2}`;
    const get = (i: number) => (i >= 0 ? (row[i] || "").trim() : "");
    if (!row.some((cell) => cell.trim())) return;
    const status = statusCol >= 0 ? get(statusCol).toLowerCase() : "";
    if (/\b(cancell?ed|no[- ]?show|deleted)\b/.test(status) && !/\bnot cancell?ed\b/.test(status)) {
      skipped.push({ fileId, where, reason: /no[- ]?show/.test(status) ? "Marked as a no-show" : "Cancelled in the file" });
      return;
    }

    const dateCell = get(c.date);
    const date = parseDate(dateCell);
    if (!date) return skipped.push({ fileId, where, reason: `We couldn't read the date "${dateCell || "blank"}"` });
    let start = c.start >= 0 && c.start !== c.date ? parseTime(get(c.start)) : null;
    if (!start) start = parseTime(dateCell.replace(/^\S+\s*/, "").replace(/^\d{4}[^\s]*\s*/, ""));
    if (!start) return skipped.push({ fileId, where, reason: `We couldn't read the start time on ${date}` });
    if (date < oldestKey) return skipped.push({ fileId, where, reason: "More than two years ago" });

    let end = c.end >= 0 ? parseTime(get(c.end)) : null;
    let guessedEnd = false;
    if (!end || end <= start) {
      const minutes = c.duration >= 0 ? parseMinutes(get(c.duration)) : null;
      if (minutes && minutes > 0 && minutes <= 12 * 60) end = addMinutes(start, minutes);
      else {
        end = addMinutes(start, 60);
        guessedEnd = true;
      }
    }

    const staffText = get(c.staff) || null;
    const match = matchPro(staffText, team);
    const name = [get(c.first), get(c.last)].join(" ").trim() || get(c.client) || null;
    const price = Number(get(c.price).replace(/[^0-9.]/g, ""));
    rows.push({
      key: `${fileId}:${index}`,
      fileId,
      where,
      date,
      start,
      end,
      clientName: name ? name.slice(0, 80) : null,
      clientPhone: get(c.phone).slice(0, 30) || null,
      clientEmail: get(c.email).toLowerCase().slice(0, 254) || null,
      service: get(c.service).slice(0, 120) || null,
      priceCents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
      staffText,
      proId: match.proId,
      confidence: match.confidence,
      guessedEnd,
      repeating: false,
    });
  });
  return { rows, skipped };
}
