import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
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
// The shop's owner and managers only, and only for active members of their
// own shop. Imported appointments block that pro's time; nobody is messaged
// or charged, and they stay out of analytics, earnings and plan limits.
// (The shop's client list is imported under /api/studio/clients.)

export const maxDuration = 300;

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
