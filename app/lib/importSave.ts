// Server only: imported from API routes, never from a page.
//
// Saving a shop's reviewed calendar import. The review sends its rows in
// chunks; each chunk is checked against what's already in LineUp and saved
// in one statement (all of it or none of it). Any failure rolls the whole
// batch back. Nothing here sends a message or touches payments: imported
// appointments live in shop_appointments (kind "imported") and imported
// clients in studio_clients, which no reminder, nudge or payment code reads.

import type { getServiceSupabase } from "@/app/lib/serverSupabase";
import { BLOCKING_BOOKING_STATUSES, BLOCKING_FRONT_DESK_STATUSES } from "@/app/lib/busyTimes";
import { getStandingHolds } from "@/app/lib/standing";
import { shopNow } from "@/app/lib/bookingTime";
import { cleanText } from "@/app/lib/importBatch";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export const SAVE_CHUNK = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SaveRow = {
  key: string;
  proId: string;
  date: string;
  start: string;
  end: string;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  service: string | null;
  priceCents: number | null;
};

export type ProCounts = { added: number; history: number; clashes: number; already: number };
export type ChunkResult = {
  perPro: Record<string, ProCounts>;
  // mergedIds: clients the shop already had that this chunk matched (the
  // review unions these across chunks so nobody is counted twice).
  clients: { created: number; mergedIds: string[]; possibleDuplicates: string[] };
  skipped: { key: string; proId: string; date: string; start: string; reason: string }[];
};

// Canadian / North American numbers as +1 and ten digits, or null.
export function normPhone(raw: string | null | undefined) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 && /^[2-9]/.test(d) ? `+1${d}` : null;
}

function prettyPhone(norm: string) {
  return `(${norm.slice(2, 5)}) ${norm.slice(5, 8)}-${norm.slice(8)}`;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function readRows(value: unknown): SaveRow[] {
  const list = Array.isArray(value) ? value.slice(0, SAVE_CHUNK) : [];
  const rows: SaveRow[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const date = String(raw?.date || "");
    const start = String(raw?.start || "");
    const end = String(raw?.end || "");
    if (typeof raw?.key !== "string" || typeof raw?.proId !== "string") continue;
    if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || end <= start) continue;
    const email = String(raw.clientEmail || "").trim().toLowerCase();
    const price = Number(raw.priceCents);
    rows.push({
      key: raw.key.slice(0, 80),
      proId: raw.proId,
      date,
      start,
      end,
      clientName: cleanText(raw.clientName, 80),
      clientPhone: cleanText(raw.clientPhone, 30),
      clientEmail: EMAIL.test(email) && email.length <= 254 ? email : null,
      service: cleanText(raw.service, 120),
      priceCents: Number.isFinite(price) && price > 0 && price <= 10_000_000 ? Math.round(price) : null,
    });
  }
  return rows;
}

type ClientRow = { id: string; name: string | null; email: string | null; phone: string | null; phone_norm: string | null; import_batch_id?: string | null };

// Finds or creates the shop's client for each row: phone first, then email,
// then exact name (only when the row has neither). Blanks on an existing
// client are filled; nothing already there is overwritten.
async function mergeClients(supabase: ServiceClient, studioId: string, batchId: string, userId: string, rows: SaveRow[]) {
  const byKey = new Map<string, string>(); // row key -> client id
  const result = { created: 0, mergedIds: [] as string[], possibleDuplicates: [] as string[] };
  const withClient = rows.filter((r) => r.clientName || r.clientPhone || r.clientEmail);
  if (!withClient.length) return { byKey, result };

  const phones = [...new Set(withClient.map((r) => normPhone(r.clientPhone)).filter((p): p is string => !!p))];
  const emails = [...new Set(withClient.map((r) => r.clientEmail).filter((e): e is string => !!e))];
  const names = [...new Set(withClient.filter((r) => r.clientName).map((r) => r.clientName!.toLowerCase()))];

  const existing: ClientRow[] = [];
  const cols = "id, name, email, phone, phone_norm, import_batch_id";
  const lookups = [];
  if (phones.length) lookups.push(supabase.from("studio_clients").select(cols).eq("studio_id", studioId).in("phone_norm", phones));
  if (emails.length) lookups.push(supabase.from("studio_clients").select(cols).eq("studio_id", studioId).in("email", emails));
  if (names.length) lookups.push(supabase.from("studio_clients").select(cols).eq("studio_id", studioId).in("name", [...new Set(withClient.map((r) => r.clientName).filter(Boolean) as string[])]));
  for (const res of await Promise.all(lookups)) {
    if (res.error) throw res.error;
    for (const c of (res.data || []) as ClientRow[]) if (!existing.some((e) => e.id === c.id)) existing.push(c);
  }

  const phoneIdx = new Map<string, ClientRow>();
  const emailIdx = new Map<string, ClientRow>();
  const nameIdx = new Map<string, ClientRow[]>();
  const index = (c: ClientRow) => {
    if (c.phone_norm) phoneIdx.set(c.phone_norm, c);
    if (c.email) emailIdx.set(c.email.toLowerCase(), c);
    if (c.name) nameIdx.set(c.name.toLowerCase(), [...(nameIdx.get(c.name.toLowerCase()) || []), c]);
  };
  existing.forEach(index);

  // New clients this chunk will create, keyed by a temp id.
  const fresh: (ClientRow & { tmp: string })[] = [];
  const fills = new Map<string, Partial<ClientRow>>();
  const touched = new Set<string>();
  const dupes = new Set<string>();

  for (const r of withClient) {
    const phone = normPhone(r.clientPhone);
    const email = r.clientEmail;
    let match = (phone && phoneIdx.get(phone)) || (email && emailIdx.get(email)) || null;
    if (!match && !phone && !email && r.clientName) {
      const same = nameIdx.get(r.clientName.toLowerCase()) || [];
      if (same.length === 1) match = same[0];
    }
    if (match) {
      // Fill blanks only, and never take a phone or email another client has.
      const fill: Partial<ClientRow> = { ...(fills.get(match.id) || {}) };
      if (!match.name && r.clientName) fill.name = match.name = r.clientName;
      if (!match.phone_norm && phone && !phoneIdx.has(phone)) {
        fill.phone_norm = match.phone_norm = phone;
        fill.phone = match.phone = prettyPhone(phone);
        phoneIdx.set(phone, match);
      }
      if (!match.email && email && !emailIdx.has(email)) {
        fill.email = match.email = email;
        emailIdx.set(email, match);
      }
      if (Object.keys(fill).length && !match.id.startsWith("tmp:")) fills.set(match.id, fill);
      // A client an earlier chunk of this same import created isn't a merge.
      if (!match.id.startsWith("tmp:") && match.import_batch_id !== batchId) touched.add(match.id);
      byKey.set(r.key, match.id);
      continue;
    }
    // Same name, different phone or email: keep them apart but say so.
    if (r.clientName && (nameIdx.get(r.clientName.toLowerCase()) || []).length) dupes.add(r.clientName);
    const tmp = `tmp:${fresh.length}`;
    const created = { id: tmp, tmp, name: r.clientName, email, phone: phone ? prettyPhone(phone) : r.clientPhone, phone_norm: phone };
    fresh.push(created);
    index(created);
    byKey.set(r.key, tmp);
  }

  // Create the new ones in one statement.
  if (fresh.length) {
    const { data, error } = await supabase
      .from("studio_clients")
      .insert(
        fresh.map((c) => ({
          studio_id: studioId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          phone_norm: c.phone_norm,
          added_by: userId,
          import_batch_id: batchId,
        }))
      )
      .select("id");
    if (error) throw error;
    const ids = (data || []).map((d) => d.id as string);
    const tmpToId = new Map(fresh.map((c, i) => [c.tmp, ids[i]]));
    for (const [key, id] of byKey) if (id.startsWith("tmp:")) byKey.set(key, tmpToId.get(id)!);
    result.created = ids.length;
  }
  for (const [id, fill] of fills) {
    const { error } = await supabase.from("studio_clients").update({ ...fill, updated_at: new Date().toISOString() }).eq("id", id);
    if (error && error.code !== "23505") throw error; // a clash on a unique phone/email just means: leave it
  }
  result.mergedIds = [...touched];
  result.possibleDuplicates = [...dupes].slice(0, 20);
  return { byKey, result };
}

// Link each client to the pros they've seen (first and last visit, visits).
export async function refreshClientLinks(supabase: ServiceClient, studioId: string, clientIds: string[], batchId: string | null) {
  const ids = [...new Set(clientIds)];
  if (!ids.length) return;
  const { data: appts, error } = await supabase
    .from("shop_appointments")
    .select("studio_client_id, professional_id, appointment_date, status")
    .in("studio_client_id", ids)
    .in("status", ["booked", "completed"]);
  if (error) throw error;
  const stats = new Map<string, { client: string; pro: string; first: string; last: string; visits: number }>();
  for (const a of appts || []) {
    const k = `${a.studio_client_id}|${a.professional_id}`;
    const s = stats.get(k) || { client: a.studio_client_id as string, pro: a.professional_id as string, first: a.appointment_date, last: a.appointment_date, visits: 0 };
    s.first = a.appointment_date < s.first ? a.appointment_date : s.first;
    s.last = a.appointment_date > s.last ? a.appointment_date : s.last;
    s.visits++;
    stats.set(k, s);
  }
  const { data: links } = await supabase.from("studio_client_pros").select("id, client_id, professional_id").in("client_id", ids);
  const have = new Map((links || []).map((l) => [`${l.client_id}|${l.professional_id}`, l.id as string]));
  for (const [k, s] of stats) {
    const values = { first_seen: s.first, last_seen: s.last, visits: s.visits };
    if (have.has(k)) await supabase.from("studio_client_pros").update(values).eq("id", have.get(k)!);
    else {
      const { error: insertError } = await supabase
        .from("studio_client_pros")
        .insert({ client_id: s.client, professional_id: s.pro, studio_id: studioId, import_batch_id: batchId, ...values });
      if (insertError && insertError.code !== "23505") throw insertError;
    }
  }
}

// One chunk of a shop import. Rows that clash with LineUp bookings, walk-ins,
// phone bookings or regulars' visits are skipped, never overwritten.
export async function saveChunk(
  supabase: ServiceClient,
  input: { studioId: string; batchId: string; userId: string; team: Set<string>; rows: SaveRow[] }
): Promise<ChunkResult> {
  const result: ChunkResult = { perPro: {}, clients: { created: 0, mergedIds: [], possibleDuplicates: [] }, skipped: [] };
  const rows = input.rows.filter((r) => input.team.has(r.proId)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  if (!rows.length) return result;
  const count = (pro: string) => (result.perPro[pro] ||= { added: 0, history: 0, clashes: 0, already: 0 });

  const ids = [...new Set(rows.map((r) => r.proId))];
  const from = rows[0].date;
  const to = rows[rows.length - 1].date;
  const [booked, desk, held] = await Promise.all([
    supabase
      .from("bookings")
      .select("professional_id, booking_date, start_time, end_time")
      .in("professional_id", ids)
      .in("status", BLOCKING_BOOKING_STATUSES)
      .gte("booking_date", from)
      .lte("booking_date", to),
    supabase
      .from("shop_appointments")
      .select("professional_id, appointment_date, start_time, end_time, kind")
      .in("professional_id", ids)
      .in("status", BLOCKING_FRONT_DESK_STATUSES)
      .gte("appointment_date", from)
      .lte("appointment_date", to),
    getStandingHolds(ids, from, to),
  ]);
  if (booked.error) throw booked.error;
  if (desk.error) throw desk.error;

  type Busy = { start: number; end: number; what: string; exactImported?: string };
  const busy = new Map<string, Busy[]>();
  const add = (pro: string, date: string, s: string, e: string, what: string, exactImported?: string) => {
    const k = `${pro}|${date}`;
    busy.set(k, [...(busy.get(k) || []), { start: toMin(s), end: toMin(e.slice(0, 5) === "24:00" ? "23:59" : e), what, exactImported }]);
  };
  for (const b of booked.data || []) add(b.professional_id, String(b.booking_date), String(b.start_time).slice(0, 5), String(b.end_time).slice(0, 5), "a LineUp booking");
  for (const d of desk.data || []) {
    const s = String(d.start_time).slice(0, 5);
    const e = String(d.end_time).slice(0, 5);
    add(d.professional_id, d.appointment_date, s, e, d.kind === "imported" ? "an appointment already imported" : "a walk-in or phone booking", d.kind === "imported" ? `${s}-${e}` : undefined);
  }
  for (const h of held) add(h.professional_id, h.booking_date, h.start_time, h.end_time, "a regular client's visit");

  const now = shopNow();
  const accepted: SaveRow[] = [];
  for (const r of rows) {
    const k = `${r.proId}|${r.date}`;
    const s = toMin(r.start);
    const e = toMin(r.end);
    const hits = (busy.get(k) || []).filter((b) => s < b.end && e > b.start);
    if (hits.some((b) => b.exactImported === `${r.start}-${r.end}`)) {
      count(r.proId).already++;
      continue;
    }
    if (hits.length) {
      count(r.proId).clashes++;
      result.skipped.push({ key: r.key, proId: r.proId, date: r.date, start: r.start, reason: `Overlaps ${hits[0].what}` });
      continue;
    }
    accepted.push(r);
    add(r.proId, r.date, r.start, r.end, "another appointment in your files");
  }

  // Clients for every row with client details, even skipped ones: they're
  // still the shop's clients.
  const merged = await mergeClients(supabase, input.studioId, input.batchId, input.userId, rows);
  result.clients = merged.result;

  const isPast = (r: SaveRow) => r.date < now.dateKey || (r.date === now.dateKey && toMin(r.end) <= now.minutes);
  const records = accepted.map((r) => ({
    studio_id: input.studioId,
    professional_id: r.proId,
    created_by: input.userId,
    kind: "imported",
    import_batch_id: input.batchId,
    studio_client_id: merged.byKey.get(r.key) || null,
    client_name: r.clientName || "Client",
    client_phone: r.clientPhone,
    service_name: r.service || "Appointment",
    appointment_date: r.date,
    start_time: r.start,
    end_time: r.end,
    price_cents: r.priceCents,
    // Past visits are client history: done, and they block nothing.
    status: isPast(r) ? "completed" : "booked",
    note: isPast(r) ? "Imported as client history" : "Imported from another booking app",
  }));

  if (records.length) {
    const { error } = await supabase.from("shop_appointments").insert(records);
    if (!error) {
      for (const r of accepted) count(r.proId)[isPast(r) ? "history" : "added"]++;
    } else if (error.code === "23P01" || error.code === "23505") {
      // Something landed on one of these times since we looked: go one by
      // one and skip just the ones that now clash.
      for (let i = 0; i < records.length; i++) {
        const r = accepted[i];
        const one = await supabase.from("shop_appointments").insert(records[i]);
        if (!one.error) count(r.proId)[isPast(r) ? "history" : "added"]++;
        else if (one.error.code === "23505") count(r.proId).already++;
        else if (one.error.code === "23P01") {
          count(r.proId).clashes++;
          result.skipped.push({ key: r.key, proId: r.proId, date: r.date, start: r.start, reason: "Overlaps something just added to the calendar" });
        } else throw one.error;
      }
    } else throw error;
  }

  await refreshClientLinks(supabase, input.studioId, [...new Set([...merged.byKey.values()])], input.batchId);
  return result;
}

// Takes a failed or abandoned batch back out completely.
export async function rollbackBatch(supabase: ServiceClient, batchId: string) {
  await supabase.from("shop_appointments").delete().eq("import_batch_id", batchId).eq("kind", "imported");
  await supabase.from("studio_client_pros").delete().eq("import_batch_id", batchId);
  await supabase.from("studio_clients").delete().eq("import_batch_id", batchId).is("invited_at", null);
  await supabase.from("import_batches").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", batchId);
}
