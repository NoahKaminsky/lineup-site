import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getMembershipForProfile } from "@/app/lib/studios";
import { hasOnlineBookingClash } from "@/app/lib/busyTimes";
import { shopNow } from "@/app/lib/bookingTime";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { getProfileHref } from "@/app/lib/profileLink";
import { studioInviteEmail } from "@/lib/email/studioClientInvite";

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
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_ROWS = 1000;

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

  const [{ data: appointments }, { data: clients, error: clientsError }] = await Promise.all([
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
  ]);

  return NextResponse.json({
    subscribed,
    ready: !clientsError,
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
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
      if (!rows.length) return NextResponse.json({ error: "There are no appointments to add." }, { status: 400 });
      const today = shopNow().dateKey;

      let added = 0;
      let past = 0;
      const clashes: string[] = [];
      for (const raw of rows) {
        const date = String(raw?.date || "");
        const start = String(raw?.start || "");
        const end = String(raw?.end || "");
        if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || end <= start) continue;
        if (date < today) {
          past++;
          continue;
        }
        if (await hasOnlineBookingClash(user.id, date, start, end)) {
          clashes.push(`${date} ${start}`);
          continue;
        }
        const price = Number(raw?.priceCents);
        const { error } = await supabase.from("shop_appointments").insert({
          studio_id: studioId,
          professional_id: user.id,
          created_by: user.id,
          kind: "imported",
          client_name: clean(raw?.clientName, 80) || "Client",
          client_phone: clean(raw?.clientPhone, 30),
          service_name: clean(raw?.service, 120) || "Appointment",
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
        else if (error.code === "23514" || error.code === "23502") {
          return NextResponse.json({ error: "Importing appointments is still being switched on. Try again soon." }, { status: 503 });
        } else throw error;
      }
      return NextResponse.json({ ok: true, added, past, clashes: clashes.slice(0, 50), clashCount: clashes.length });
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
      const rows = [];
      for (const raw of incoming) {
        const email = String(raw?.email || "").trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254 || seen.has(email)) continue;
        seen.add(email);
        rows.push({ professional_id: user.id, email, name: clean(raw?.name, 120), phone: clean(raw?.phone, 40), added_by: user.id });
      }
      if (!rows.length) return NextResponse.json({ error: "No clients with an email address were found." }, { status: 400 });
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
      const resend = new Resend(process.env.RESEND_API_KEY);

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
    console.error("POST /api/pro/import failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
