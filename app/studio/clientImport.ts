// Reads a client list someone exported from another booking app (Squire,
// Booksy, Fresha, Vagaro, Square, a spreadsheet) or pasted in. Finds the
// name, email and phone columns by their headings, so the export can be
// used as it comes. Runs in the browser; nothing is sent until the owner
// confirms.

export type ParsedClient = { name: string | null; email: string; phone: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+/;

// One CSV line at a time, honouring quotes ("Smith, Jo").
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

function pickDelimiter(firstLine: string) {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

function findColumn(headers: string[], ...names: string[]) {
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

export function parseClientList(text: string): { clients: ParsedClient[]; noEmail: number; duplicates: number } {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { clients: [], noEmail: 0, duplicates: 0 };

  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const rows = splitRows(trimmed, pickDelimiter(firstLine));
  const header = rows[0] || [];
  const hasHeader = header.some((h) => /mail|name|phone|mobile/i.test(h)) && !header.some((h) => EMAIL_RE.test(h));

  let emailCol = -1;
  let nameCol = -1;
  let firstCol = -1;
  let lastCol = -1;
  let phoneCol = -1;
  if (hasHeader) {
    emailCol = findColumn(header, "email", "emailaddress", "mail");
    firstCol = findColumn(header, "firstname", "first", "givenname");
    lastCol = findColumn(header, "lastname", "last", "surname", "familyname");
    nameCol = findColumn(header, "name", "fullname", "clientname", "customername", "client", "customer");
    if (nameCol === firstCol || nameCol === lastCol) nameCol = -1;
    phoneCol = findColumn(header, "mobile", "mobilephone", "cell", "phone", "phonenumber", "telephone");
  }

  const seen = new Set<string>();
  const clients: ParsedClient[] = [];
  let noEmail = 0;
  let duplicates = 0;

  for (const row of hasHeader ? rows.slice(1) : rows) {
    // No email heading (or a plain pasted list): take the first email anywhere in the row.
    const rawEmail = emailCol !== -1 ? row[emailCol] : row.find((c) => EMAIL_IN_TEXT.test(c));
    const email = (rawEmail?.match(EMAIL_IN_TEXT)?.[0] || "").toLowerCase();
    if (!EMAIL_RE.test(email)) {
      noEmail++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);

    let name: string | null = null;
    if (firstCol !== -1 || lastCol !== -1) {
      name = [row[firstCol] || "", lastCol !== -1 ? row[lastCol] || "" : ""].join(" ").trim() || null;
    }
    if (!name && nameCol !== -1) name = row[nameCol] || null;
    if (!name && !hasHeader) {
      // "Jo Smith, jo@x.com" or "Jo Smith <jo@x.com>"
      const rest = row.filter((c) => !EMAIL_IN_TEXT.test(c) && !/^[+\d\s().-]{7,}$/.test(c));
      name = rest[0] || row.find((c) => EMAIL_IN_TEXT.test(c))?.replace(EMAIL_IN_TEXT, "").replace(/[<>"]/g, "").trim() || null;
    }
    const phone = phoneCol !== -1 ? row[phoneCol] || null : row.find((c) => /^[+\d\s().-]{7,}$/.test(c)) || null;

    clients.push({ name: name?.slice(0, 120) || null, email, phone: phone?.slice(0, 40) || null });
  }

  return { clients, noEmail, duplicates };
}
