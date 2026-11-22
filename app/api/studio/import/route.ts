import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
import { BLOCKING_BOOKING_STATUSES, BLOCKING_FRONT_DESK_STATUSES, getTimeOffDays } from "@/app/lib/busyTimes";
import { getStandingHolds } from "@/app/lib/standing";
import { readRows, rollbackBatch, saveChunk } from "@/app/lib/importSave";
import {
  ImportNotReadyError,
  MAX_APPOINTMENT_ROWS,
  createBatch,
  insertImportedAppointments,
  listBatches,
  readSource,
  undoBatch,
} from "@/app/lib/importBatch";

// A shop moves its calendar over from another booking app.
//   GET                                                   the shop's imports, newest first
//   POST { action: "appointments", professionalId, rows } hold one pro's upcoming appointments
//   POST { action: "undo-batch", id }                     undo a whole import
//   POST { action: "check-clashes", items }               preview only: which rows clash
//                                                         with what's already on LineUp
//   POST { action: "save-start", sourceApp, fileNames, rowCount }   -> { batchId }
//   POST { action: "save-chunk", batchId, rows }          save up to 200 reviewed rows
//   POST { action: "save-finish", batchId, summary }      mark the import done
//   POST { action: "save-rollback", batchId }             take a failed import back out
// The shop's owner and managers only, and only for active members of their
// own shop. Imported appointments block that pro's time; nobody is messaged
// or charged, and they stay out of analytics, earnings and plan limits.
// (The shop's client list is imported under /api/studio/clients.)

export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_CLASH_ITEMS = 5000;
type ClashItem = { key: string; proId: string; date: string; start: string; end: string };

async function context(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  const ctx = await getStudioForUser(supabase, user.id);
  if (!ctx?.canManage) {
    return { error: NextResponse.json({ error: "Only the shop's owner or managers can import." }, { status: 403 }) };
  }
  return { user, supabase, ctx };
}

export async function GET(req: Request) {
  try {
    const c = await context(req);
    if ("error" in c) return c.error;
    const { supabase, ctx } = c;
    const batches = await listBatches(supabase, { studioId: ctx.studio.id });
    return NextResponse.json({ ready: batches !== null, live: isStudioLive(ctx.studio), batches: batches || [] });
  } catch (error) {
    console.error("GET /api/studio/import failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load your imports.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const c = await context(req);
    if ("error" in c) return c.error;
    const { user, supabase, ctx } = c;
    const body = await req.json().catch(() => ({}));

    if (body?.action === "appointments") {
      if (!isStudioLive(ctx.studio)) {
        return NextResponse.json({ error: "Importing is part of the Studio plans. Start a plan under Settings." }, { status: 402 });
      }
      const professionalId = typeof body.professionalId === "string" ? body.professionalId : "";
      // Only an active member of this shop: never another shop's pro.
      const { data: member } = await supabase
        .from("studio_members")
        .select("profile_id")
        .eq("studio_id", ctx.studio.id)
        .eq("profile_id", professionalId)
        .eq("status", "active")
        .maybeSingle();
      if (!member) return NextResponse.json({ error: "Pick someone on your team." }, { status: 400 });

      const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_APPOINTMENT_ROWS) : [];
      if (!rows.length) return NextResponse.json({ error: "There are no appointments to add." }, { status: 400 });

      const batchId = await createBatch(supabase, {
        kind: "appointments",
        studioId: ctx.studio.id,
        professionalId,
        createdBy: user.id,
        ...readSource(body),
        rowCount: rows.length,
      });
      const result = await insertImportedAppointments(supabase, {
        batchId,
        studioId: ctx.studio.id,
        professionalId,
        createdBy: user.id,
        rows,
      });
      return NextResponse.json({ ok: true, batchId, ...result });
    }

    // Preview: nothing is written. Each item is one appointment from the
    // owner's files; we say which ones land on time that's already taken.
    if (body?.action === "check-clashes") {
      const items = (Array.isArray(body.items) ? body.items.slice(0, MAX_CLASH_ITEMS) : []).filter(
        (i: ClashItem) =>
          i && typeof i.key === "string" && typeof i.proId === "string" && DATE.test(i.date) && TIME.test(i.start) && TIME.test(i.end)
      ) as ClashItem[];
      if (!items.length) return NextResponse.json({ clashes: {} });

      // Only this shop's own team.
      const { data: members } = await supabase
        .from("studio_members")
        .select("profile_id")
        .eq("studio_id", ctx.studio.id)
        .eq("status", "active");
      const team = new Set((members || []).map((m) => m.profile_id as string));
      const mine = items.filter((i) => team.has(i.proId));
      if (!mine.length) return NextResponse.json({ clashes: {} });

      const ids = [...new Set(mine.map((i) => i.proId))];
      const dates = mine.map((i) => i.date).sort();
      const from = dates[0];
      const to = dates[dates.length - 1];
      const [{ data: booked, error }, frontDesk, offDays, held] = await Promise.all([
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
          .lte("appointment_date", to)
          .then((r) => r.data || []),
        getTimeOffDays(ids, from, to),
        getStandingHolds(ids, from, to),
      ]);
      if (error) throw error;

      type Busy = { pro: string; date: string; start: string; end: string; what: string };
      const busy: Busy[] = [
        ...(booked || []).map((b) => ({ pro: b.professional_id, date: String(b.booking_date), start: String(b.start_time).slice(0, 5), end: String(b.end_time).slice(0, 5), what: "a LineUp booking" })),
        ...frontDesk.map((b) => ({
          pro: b.professional_id as string,
          date: String(b.appointment_date),
          start: String(b.start_time).slice(0, 5),
          end: String(b.end_time).slice(0, 5),
          what: b.kind === "imported" ? "imported" : "something already on their calendar",
        })),
        ...offDays.map((d) => ({ pro: d.professional_id, date: d.date, start: "00:00", end: "24:00", what: "their time off" })),
        ...held.map((b) => ({ pro: b.professional_id, date: b.booking_date, start: b.start_time, end: b.end_time, what: "a regular client's visit" })),
      ];
      const byDay = new Map<string, Busy[]>();
      for (const b of busy) byDay.set(`${b.pro}|${b.date}`, [...(byDay.get(`${b.pro}|${b.date}`) || []), b]);

      // Exactly the same as something already imported: it's simply there
      // already, and saving will leave it alone.
      const clashes: Record<string, string> = {};
      const already: string[] = [];
      for (const i of mine) {
        const hits = (byDay.get(`${i.proId}|${i.date}`) || []).filter((b) => i.start < b.end && i.end > b.start);
        if (hits.some((b) => b.what === "imported" && b.start === i.start && b.end === i.end)) already.push(i.key);
        else if (hits.length) clashes[i.key] = hits[0].what === "imported" ? "an appointment already imported" : hits[0].what;
      }
      return NextResponse.json({ clashes, already });
    }

    // ── Saving a reviewed import, in chunks ──────────────────
    if (body?.action === "save-start") {
      if (!isStudioLive(ctx.studio)) {
        return NextResponse.json({ error: "Importing is part of the Studio plans. Start a plan under Settings." }, { status: 402 });
      }
      // A save left half-done (closed tab, lost connection) is taken back
      // out before a new one starts.
      const { data: stale } = await supabase
        .from("import_batches")
        .select("id")
        .eq("studio_id", ctx.studio.id)
        .eq("status", "saving")
        .lt("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
      for (const b of stale || []) await rollbackBatch(supabase, b.id);

      const names = Array.isArray(body.fileNames) ? body.fileNames.map((n: unknown) => String(n).slice(0, 200)).slice(0, 20) : [];
      const { data, error } = await supabase
        .from("import_batches")
        .insert({
          studio_id: ctx.studio.id,
          professional_id: null,
          created_by: user.id,
          kind: "appointments",
          status: "saving",
          source_type: body.sourceType === "ics" ? "ics" : "csv",
          source_app: readSource(body).sourceApp,
          file_names: names,
          row_count: Math.max(0, Math.min(Number(body.rowCount) || 0, 100000)),
        })
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ batchId: data.id });
    }

    if (body?.action === "save-chunk" || body?.action === "save-finish" || body?.action === "save-rollback") {
      const { data: batch } = await supabase
        .from("import_batches")
        .select("id, status")
        .eq("id", String(body.batchId || ""))
        .eq("studio_id", ctx.studio.id)
        .maybeSingle();
      if (!batch) return NextResponse.json({ error: "That import wasn't found." }, { status: 404 });

      if (body.action === "save-rollback") {
        if (batch.status !== "done") await rollbackBatch(supabase, batch.id);
        return NextResponse.json({ ok: true });
      }
      if (batch.status !== "saving") return NextResponse.json({ error: "That import has already finished." }, { status: 409 });

      if (body.action === "save-chunk") {
        const { data: members } = await supabase
          .from("studio_members")
          .select("profile_id")
          .eq("studio_id", ctx.studio.id)
          .eq("status", "active");
        const team = new Set((members || []).map((m) => m.profile_id as string));
        const result = await saveChunk(supabase, { studioId: ctx.studio.id, batchId: batch.id, userId: user.id, team, rows: readRows(body.rows) });
        return NextResponse.json(result);
      }

      // save-finish: counts come from what's actually saved.
      const [{ count: added }, { count: history }, { count: clientsCreated }] = await Promise.all([
        supabase.from("shop_appointments").select("id", { count: "exact", head: true }).eq("import_batch_id", batch.id).eq("status", "booked"),
        supabase.from("shop_appointments").select("id", { count: "exact", head: true }).eq("import_batch_id", batch.id).eq("status", "completed"),
        supabase.from("studio_clients").select("id", { count: "exact", head: true }).eq("import_batch_id", batch.id),
      ]);
      const summary = typeof body.summary === "object" && body.summary && JSON.stringify(body.summary).length < 50_000 ? body.summary : {};
      const { error } = await supabase
        .from("import_batches")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          added_count: added || 0,
          skipped_past: 0,
          clash_count: Math.max(0, Number(summary.clashes) || 0),
          summary: { ...summary, added: added || 0, history: history || 0, clientsCreated: clientsCreated || 0 },
        })
        .eq("id", batch.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, added: added || 0, history: history || 0, clientsCreated: clientsCreated || 0 });
    }

    if (body?.action === "undo-batch") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Missing import." }, { status: 400 });
      const { data: batch } = await supabase
        .from("import_batches")
        .select("id, undone_at")
        .eq("id", body.id)
        .eq("studio_id", ctx.studio.id)
        .maybeSingle();
      if (!batch) return NextResponse.json({ error: "That import wasn't found." }, { status: 404 });
      if (batch.undone_at) return NextResponse.json({ error: "That import was already undone." }, { status: 409 });
      return NextResponse.json({ ok: true, ...(await undoBatch(supabase, batch.id, user.id)) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ImportNotReadyError) {
      return NextResponse.json({ error: "Importing is still being switched on. Try again soon." }, { status: 503 });
    }
    console.error("POST /api/studio/import failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Something went wrong. Please try again.") }, { status: 500 });
  }
}
