import { NextResponse } from "next/server";
import { getMailer } from "@/app/lib/mailer";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getMembershipForProfile } from "@/app/lib/studios";
import { shopNow } from "@/app/lib/bookingTime";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { getProfileHref } from "@/app/lib/profileLink";
import { studioInviteEmail } from "@/lib/email/studioClientInvite";
import {
  ImportNotReadyError,
  MAX_APPOINTMENT_ROWS,
  createBatch,
  finishBatch,
  insertImportedAppointments,
  listBatches,
  readSource,
  undoBatch,
} from "@/app/lib/importBatch";

// A pro brings their book over from another app.
//   GET                                           what they've imported so far
//   POST { action: "appointments", rows }          upcoming appointments -> held on their calendar
//   POST { action: "clients", rows, consent }      their client list
//   POST { action: "invite" }                      email each client once: "book me on LineUp"
//   POST { action: "remove-client", id }
//   POST { action: "remove-appointment", id }
// Pros on a paid plan only (or covered by their shop's Studio plan).
//
// Imported appointments sit with the shop's walk-ins and phone-ins (kind
// "imported"), so they block the pro's calendar, booking page and calendar
// feed, and can't overlap each other. Each client gets one invite, ever; the
// pro confirms they're their own clients from the last two years (CASL).

export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function context(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  const { data: me } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, role, subscription_plan, subscription_status, service_modes, formatted_address")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.role !== "professional") {
    return { error: NextResponse.json({ error: "Only pros can import clients and appointments." }, { status: 403 }) };
  }
  const subscribed =
    ["apprentice", "pro", "master"].includes(me.subscription_plan || "") &&
    ["active", "trialing"].includes(me.subscription_status || "");
  const membership = await getMembershipForProfile(supabase, user.id);
  return { user, supabase, me, subscribed, studioId: membership?.studio.id || null };
}

function clean(value: unknown, max: number) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

export async function GET(req: Request) {
  const c = await context(req);
  if ("error" in c) return c.error;
  const { supabase, user, subscribed } = c;
  const today = shopNow().dateKey;

  const [{ data: appointments }, { data: clients, error: clientsError }, batches] = await Promise.all([
    supabase
      .from("shop_appointments")
      .select("id, client_name, service_name, appointment_date, start_time, end_time, status")
      .eq("professional_id", user.id)
      .eq("kind", "imported")
      .eq("status", "booked")
      .gte("appointment_date", today)
      .order("appointment_date")
      .order("start_time")
      .limit(1000),
    supabase
      .from("studio_clients")
      .select("id, name, email, phone, invited_at, unsubscribed_at")
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5000),
    listBatches(supabase, { professionalId: user.id }).catch(() => null),
  ]);

  return NextResponse.json({
    subscribed,
    ready: !clientsError,
    batches: batches || [],
    appointments: (appointments || []).map((a) => ({
      id: a.id,
      client: a.client_name,
      service: a.service_name,
      date: a.appointment_date,
      start: String(a.start_time).slice(0, 5),
      end: String(a.end_time).slice(0, 5),
    })),
    clients: (clients || []).map((cl) => ({
      id: cl.id,
      name: cl.name,
      email: cl.email,
      phone: cl.phone,
      invited: !!cl.invited_at,
      unsubscribed: !!cl.unsubscribed_at,
    })),
  });
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const c = await context(req);
    if ("error" in c) return c.error;
    const { supabase, user, me, subscribed, studioId } = c;
    const body = await req.json().catch(() => ({}));

    if (!subscribed) {
      return NextResponse.json({ error: "Importing your book is part of the paid plans. Upgrade under Subscription." }, { status: 402 });
    }

    // ── Appointments ─────────────────────────────────────────
    if (body?.action === "appointments") {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_APPOINTMENT_ROWS) : [];
      if (!rows.length) return NextResponse.json({ error: "There are no appointments to add." }, { status: 400 });
      const source = readSource(body);
      const batchId = await createBatch(supabase, {
        kind: "appointments",
        studioId,
        professionalId: user.id,
        createdBy: user.id,
        ...source,
        rowCount: rows.length,
      });
      const result = await insertImportedAppointments(supabase, { batchId, studioId, professionalId: user.id, createdBy: user.id, rows });
      return NextResponse.json({ ok: true, batchId, ...result });
    }

    // Undo one whole import of the pro's own.
    if (body?.action === "undo-batch") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Missing import." }, { status: 400 });
      const { data: batch } = await supabase
        .from("import_batches")
        .select("id, undone_at")
        .eq("id", body.id)
        .eq("professional_id", user.id)
        .eq("created_by", user.id)
        .maybeSingle();
      if (!batch) return NextResponse.json({ error: "That import wasn't found." }, { status: 404 });
      if (batch.undone_at) return NextResponse.json({ error: "That import was already undone." }, { status: 409 });
      return NextResponse.json({ ok: true, ...(await undoBatch(supabase, batch.id, user.id)) });
    }

    if (body?.action === "remove-appointment") {
      await supabase
        .from("shop_appointments")
        .update({ status: "cancelled" })
        .eq("id", body.id)
        .eq("professional_id", user.id)
        .eq("kind", "imported");
      return NextResponse.json({ ok: true });
    }

    // ── Clients ──────────────────────────────────────────────
    if (body?.action === "clients") {
      if (body.consent !== true) return NextResponse.json({ error: "Confirm these are your own clients first." }, { status: 400 });
      const incoming = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      const seen = new Set<string>();
      const rows: { professional_id: string; email: string; name: string | null; phone: string | null; added_by: string; import_batch_id?: string }[] = [];
      for (const raw of incoming) {
        const email = String(raw?.email || "").trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254 || seen.has(email)) continue;
        seen.add(email);
        rows.push({ professional_id: user.id, email, name: clean(raw?.name, 120), phone: clean(raw?.phone, 40), added_by: user.id });
      }
      if (!rows.length) return NextResponse.json({ error: "No clients with an email address were found." }, { status: 400 });
      const batchId = await createBatch(supabase, {
        kind: "clients",
        studioId: null,
        professionalId: user.id,
        createdBy: user.id,
        ...readSource(body),
        rowCount: incoming.length,
      });
      for (const r of rows) r.import_batch_id = batchId;
      let added = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await supabase
          .from("studio_clients")
          .upsert(rows.slice(i, i + 500), { onConflict: "professional_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) {
          if (error.code === "23502" || error.code === "42703" || error.code === "42P10") {
            return NextResponse.json({ error: "Importing clients is still being switched on. Try again soon." }, { status: 503 });
          }
          throw error;
        }
        added += data?.length || 0;
      }
      await finishBatch(supabase, batchId, { added, problems: incoming.length - rows.length });
      return NextResponse.json({ ok: true, added, alreadyThere: rows.length - added });
    }

    if (body?.action === "remove-client") {
      await supabase.from("studio_clients").delete().eq("id", body.id).eq("professional_id", user.id);
      return NextResponse.json({ ok: true });
    }

    if (body?.action === "invite") {
      if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
      const { data: pending } = await supabase
        .from("studio_clients")
        .select("id, name, email, unsubscribe_token")
        .eq("professional_id", user.id)
        .is("invited_at", null)
        .is("unsubscribed_at", null)
        .not("email", "is", null)
        .limit(5000);
      if (!pending?.length) return NextResponse.json({ error: "Everyone on your list has already been invited." }, { status: 400 });
      if (typeof body.confirmCount === "number" && body.confirmCount !== pending.length) {
        return NextResponse.json({ error: "Your list changed. Refresh and check the count again." }, { status: 409 });
      }

      const site = getSiteUrl("https://www.lineup-aesthetics.ca");
      const name = me.full_name || "Your pro";
      const fromAddress =
        (process.env.EMAIL_FROM || "").match(/<([^>]+)>/)?.[1] || process.env.EMAIL_FROM || "hello@lineup-aesthetics.ca";
      const modes: string[] = Array.isArray(me.service_modes) ? me.service_modes : [];
      // A shop address is fine to show; a home studio's isn't.
      const address = modes.includes("in_shop") ? me.formatted_address : null;
      const resend = getMailer();

      let sent = 0;
      let failed = 0;
      for (let i = 0; i < pending.length; i += 100) {
        const chunk = pending.slice(i, i + 100);
        const { error } = await resend.batch.send(
          chunk.map((cl) => {
            const unsubscribeUrl = `${site}/api/studio/clients/unsubscribe?t=${cl.unsubscribe_token}`;
            const { subject, html } = studioInviteEmail({
              kind: "pro",
              shopName: name,
              shopAddress: address,
              bookUrl: `${site}${getProfileHref(me)}`,
              clientName: cl.name,
              unsubscribeUrl,
            });
            return {
              from: `${name.replace(/[<>"\r\n]/g, "").slice(0, 60)} via LineUp <${fromAddress}>`,
              to: [cl.email],
              ...(me.email ? { replyTo: me.email } : {}),
              subject,
              html,
              headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
            };
          })
        );
        if (error) {
          failed += chunk.length;
          continue;
        }
        sent += chunk.length;
        await supabase
          .from("studio_clients")
          .update({ invited_at: new Date().toISOString(), invite_count: 1 })
          .in(
            "id",
            chunk.map((x) => x.id)
          );
      }
      return NextResponse.json({ ok: failed === 0, sent, failed });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof ImportNotReadyError) {
      return NextResponse.json({ error: "Importing is still being switched on. Try again soon." }, { status: 503 });
    }
    console.error("POST /api/pro/import failed:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
