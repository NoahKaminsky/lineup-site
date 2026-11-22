// Server only: imported from API routes, never from a page.
import type { getServiceSupabase } from "@/app/lib/serverSupabase";
import { hasOnlineBookingClash } from "@/app/lib/busyTimes";
import { shopNow } from "@/app/lib/bookingTime";
import { SOURCE_APPS, SOURCE_APP_LABELS, type SourceApp } from "@/app/lib/importSources";

// Imports from another booking app, shared by a pro's own import
// (/api/pro/import) and a shop owner importing for their team
// (/api/studio/import). Every upload is one import batch; each appointment
// and client it creates points back to it, so the whole thing can be undone.
//
// Imported appointments are shop_appointments with kind "imported". That
// keeps them out of everything that acts on real bookings: no reminders,
// nudges, auto-complete, reviews, payments, payouts or plan limits (all of
// those read `bookings`), and analytics and earnings leave them out too.
// They still block the pro's time like a walk-in or phone booking does.

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export { SOURCE_APPS, SOURCE_APP_LABELS, type SourceApp };

export const MAX_APPOINTMENT_ROWS = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// Thrown when the import tables or columns aren't in the database yet.
export class ImportNotReadyError extends Error {}

function isMissingSchema(code: string | undefined) {
  // 42P01 table missing, 42703 column missing, 23502/23514 old constraints.
  return code === "42P01" || code === "42703" || code === "23502" || code === "23514";
}

export function cleanText(value: unknown, max: number) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

export function readSource(body: { sourceApp?: unknown; sourceType?: unknown; fileName?: unknown }) {
  const app = String(body.sourceApp || "other").toLowerCase();
  const fileName = cleanText(body.fileName, 200);
  return {
    sourceApp: (SOURCE_APPS as readonly string[]).includes(app) ? (app as SourceApp) : "other",
    sourceType: body.sourceType === "ics" ? ("ics" as const) : ("csv" as const),
    fileNames: fileName ? [fileName] : [],
  };
}

export async function createBatch(
  supabase: ServiceClient,
  input: {
    kind: "appointments" | "clients";
    studioId: string | null;
    professionalId: string | null;
    createdBy: string;
    sourceApp: SourceApp;
    sourceType: "csv" | "ics";
    fileNames: string[];
    rowCount: number;
  }
) {
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      kind: input.kind,
      studio_id: input.studioId,
      professional_id: input.professionalId,
      created_by: input.createdBy,
      source_app: input.sourceApp,
      source_type: input.sourceType,
      file_names: input.fileNames.slice(0, 20),
      row_count: input.rowCount,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchema(error.code)) throw new ImportNotReadyError(error.message);
    throw error;
  }
  return data.id as string;
}

export async function finishBatch(
  supabase: ServiceClient,
  batchId: string,
  counts: { added: number; skippedPast?: number; clashes?: number; problems?: number }
) {
  await supabase
    .from("import_batches")
    .update({
      added_count: counts.added,
      skipped_past: counts.skippedPast || 0,
      clash_count: counts.clashes || 0,
      problem_count: counts.problems || 0,
    })
    .eq("id", batchId);
}

// Hold each upcoming appointment on the pro's calendar. Past rows, rows that
// can't be read, and rows that overlap something already booked are skipped.
// Nothing is sent to anyone and nothing is charged.
export async function insertImportedAppointments(
  supabase: ServiceClient,
  input: { batchId: string; studioId: string | null; professionalId: string; createdBy: string; rows: unknown[] }
) {
  const today = shopNow().dateKey;
  let added = 0;
  let past = 0;
  let problems = 0;
  const clashes: string[] = [];

  for (const value of input.rows.slice(0, MAX_APPOINTMENT_ROWS)) {
    const raw = (value || {}) as Record<string, unknown>;
    const date = String(raw.date || "");
    const start = String(raw.start || "");
    const end = String(raw.end || "");
    if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || end <= start) {
      problems++;
      continue;
    }
    if (date < today) {
      past++;
      continue;
    }
    if (await hasOnlineBookingClash(input.professionalId, date, start, end)) {
      clashes.push(`${date} ${start}`);
      continue;
    }
    const price = Number(raw.priceCents);
    const { error } = await supabase.from("shop_appointments").insert({
      studio_id: input.studioId,
      professional_id: input.professionalId,
      created_by: input.createdBy,
      kind: "imported",
      import_batch_id: input.batchId,
      client_name: cleanText(raw.clientName, 80) || "Client",
      client_phone: cleanText(raw.clientPhone, 30),
      service_name: cleanText(raw.service, 120) || "Appointment",
      appointment_date: date,
      start_time: start,
      end_time: end,
      price_cents: Number.isFinite(price) && price > 0 && price <= 10_000_000 ? Math.round(price) : null,
      status: "booked",
      note: "Imported from another booking app",
    });
    if (!error) added++;
    // 23P01: overlaps something already on the calendar (or imported twice).
    else if (error.code === "23P01") clashes.push(`${date} ${start}`);
    else if (isMissingSchema(error.code)) throw new ImportNotReadyError(error.message);
    else throw error;
  }

  await finishBatch(supabase, input.batchId, { added, skippedPast: past, clashes: clashes.length, problems });
  return { added, past, problems, clashes: clashes.slice(0, 50), clashCount: clashes.length };
}

export type BatchSummary = {
  id: string;
  kind: "appointments" | "clients";
  professionalId: string | null;
  createdBy: string | null;
  createdAt: string;
  sourceApp: SourceApp;
  sourceType: "csv" | "ics";
  fileNames: string[];
  rowCount: number;
  addedCount: number;
  skippedPast: number;
  clashCount: number;
  problemCount: number;
  undoneAt: string | null;
  keptCount: number;
  // Rows from this batch that undo would still remove right now.
  removable: number;
  status: "saving" | "done" | "failed";
  summary: Record<string, unknown>;
};

type BatchRow = {
  id: string;
  kind: "appointments" | "clients";
  professional_id: string | null;
  created_by: string | null;
  created_at: string;
  source_app: SourceApp;
  source_type: "csv" | "ics";
  file_names: string[] | null;
  row_count: number;
  added_count: number;
  skipped_past: number;
  clash_count: number;
  problem_count: number;
  undone_at: string | null;
  kept_count: number;
  status?: "saving" | "done" | "failed";
  summary?: Record<string, unknown>;
};

// The batches for a shop, or the ones a pro ran for themselves, newest first.
export async function listBatches(supabase: ServiceClient, scope: { studioId: string } | { professionalId: string }) {
  let q = supabase.from("import_batches").select("*").neq("status", "failed").order("created_at", { ascending: false }).limit(50);
  q = "studioId" in scope ? q.eq("studio_id", scope.studioId) : q.eq("professional_id", scope.professionalId).eq("created_by", scope.professionalId);
  const { data, error } = await q;
  if (error) {
    if (isMissingSchema(error.code)) return null;
    throw error;
  }
  const rows = (data || []) as BatchRow[];
  const open = rows.filter((b) => !b.undone_at).map((b) => b.id);
  const removable = new Map<string, number>();
  if (open.length) {
    const [{ data: appts }, { data: clients }] = await Promise.all([
      supabase.from("shop_appointments").select("import_batch_id").in("import_batch_id", open).eq("kind", "imported").in("status", ["booked", "completed", "cancelled"]).is("paid_with", null),
      supabase.from("studio_clients").select("import_batch_id").in("import_batch_id", open).is("invited_at", null),
    ]);
    for (const r of [...(appts || []), ...(clients || [])]) {
      const id = r.import_batch_id as string;
      removable.set(id, (removable.get(id) || 0) + 1);
    }
  }
  return rows.map(
    (b): BatchSummary => ({
      id: b.id,
      kind: b.kind,
      professionalId: b.professional_id,
      createdBy: b.created_by,
      createdAt: b.created_at,
      sourceApp: b.source_app,
      sourceType: b.source_type,
      fileNames: b.file_names || [],
      rowCount: b.row_count,
      addedCount: b.added_count,
      skippedPast: b.skipped_past,
      clashCount: b.clash_count,
      problemCount: b.problem_count,
      undoneAt: b.undone_at,
      keptCount: b.kept_count,
      removable: removable.get(b.id) || 0,
      status: b.status || "done",
      summary: b.summary || {},
    })
  );
}

// Undo a whole import, and nothing else:
//   appointments: the batch's own, unless someone has since recorded a
//     payment on one (marked done and paid at the front desk) or it's a
//     no-show; their times open up again
//   clients: only ones this batch created that haven't since been invited
//     (messaged), edited, unsubscribed, or booked (a LineUp booking or a
//     walk-in with the same email or phone after the import)
//   links between clients and pros that this batch made
// Blanks the batch filled in on clients the shop already had stay filled.
//
// The caller has already checked the batch belongs to this shop or pro.
export async function undoBatch(supabase: ServiceClient, batchId: string, userId: string) {
  const { data: batch } = await supabase.from("import_batches").select("id, studio_id, created_at").eq("id", batchId).maybeSingle();
  if (!batch) throw new Error("Import not found");

  // Clients whose visit counts change once this batch's appointments go.
  const { data: touched } = await supabase
    .from("shop_appointments")
    .select("studio_client_id")
    .eq("import_batch_id", batchId)
    .not("studio_client_id", "is", null);

  const { data: appts, error: apptError } = await supabase
    .from("shop_appointments")
    .delete()
    .eq("import_batch_id", batchId)
    .eq("kind", "imported")
    .in("status", ["booked", "completed", "cancelled"])
    .is("paid_with", null)
    .select("id");
  if (apptError) throw apptError;

  // Clients this batch created that nobody has used since.
  const { data: candidates, error: candError } = await supabase
    .from("studio_clients")
    .select("id, email, phone_norm")
    .eq("import_batch_id", batchId)
    .is("invited_at", null)
    .is("edited_at", null)
    .is("unsubscribed_at", null);
  if (candError) throw candError;
  const used = new Set<string>();
  if (candidates?.length) {
    const ids = candidates.map((c) => c.id as string);
    // Still linked to an appointment that stays (paid, no-show, or a walk-in).
    const { data: stillLinked } = await supabase.from("shop_appointments").select("studio_client_id").in("studio_client_id", ids);
    for (const a of stillLinked || []) used.add(a.studio_client_id as string);
    // Walked in or phoned since, at this shop, by phone number.
    if (batch.studio_id) {
      const { data: walkIns } = await supabase
        .from("shop_appointments")
        .select("client_phone")
        .eq("studio_id", batch.studio_id)
        .neq("kind", "imported")
        .gte("created_at", batch.created_at);
      const phones = new Set((walkIns || []).map((w) => normalisePhone(w.client_phone)).filter(Boolean));
      for (const c of candidates) if (c.phone_norm && phones.has(c.phone_norm)) used.add(c.id as string);
    }
    // Booked on LineUp since, by email.
    const emails = candidates.map((c) => c.email).filter((e): e is string => !!e);
    if (emails.length) {
      const { data: people } = await supabase.from("profiles").select("id, email").in("email", emails);
      const byId = new Map((people || []).map((p) => [p.id as string, String(p.email).toLowerCase()]));
      if (byId.size) {
        const { data: booked } = await supabase
          .from("bookings")
          .select("customer_id")
          .in("customer_id", [...byId.keys()])
          .gte("created_at", batch.created_at);
        const bookedEmails = new Set((booked || []).map((b) => byId.get(b.customer_id as string)));
        for (const c of candidates) if (c.email && bookedEmails.has(c.email.toLowerCase())) used.add(c.id as string);
      }
    }
  }
  const removable = (candidates || []).map((c) => c.id as string).filter((id) => !used.has(id));
  let clientsRemoved = 0;
  for (let i = 0; i < removable.length; i += 500) {
    const { data, error } = await supabase.from("studio_clients").delete().in("id", removable.slice(i, i + 500)).select("id");
    if (error) throw error;
    clientsRemoved += data?.length || 0;
  }
  await supabase.from("studio_client_pros").delete().eq("import_batch_id", batchId);

  // Recount visits for clients the shop keeps.
  const keptClients = [...new Set((touched || []).map((t) => t.studio_client_id as string))].filter((id) => !removable.includes(id));
  if (batch.studio_id && keptClients.length) {
    const { refreshClientLinks } = await import("@/app/lib/importSave");
    await refreshClientLinks(supabase, batch.studio_id, keptClients, null);
  }

  const [{ count: keptAppts }, { count: keptClientCount }] = await Promise.all([
    supabase.from("shop_appointments").select("id", { count: "exact", head: true }).eq("import_batch_id", batchId),
    supabase.from("studio_clients").select("id", { count: "exact", head: true }).eq("import_batch_id", batchId),
  ]);
  const kept = (keptAppts || 0) + (keptClientCount || 0);
  await supabase
    .from("import_batches")
    .update({ undone_at: new Date().toISOString(), undone_by: userId, kept_count: kept })
    .eq("id", batchId);
  return { removed: (appts?.length || 0) + clientsRemoved, appointmentsRemoved: appts?.length || 0, clientsRemoved, kept };
}

function normalisePhone(raw: string | null | undefined) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : null;
}
