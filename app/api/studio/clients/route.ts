import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { studioInviteEmail } from "@/lib/email/studioClientInvite";

// A shop's own client list.
//   GET                                        the list, with who's invited / on LineUp
//   POST { action: "import", rows, consent }   add clients (skips ones already there)
//   POST { action: "invite", ids? }            email the "book with us on LineUp" invite
//   POST { action: "remove", id }              take someone off the list
// Owners and managers only.
//
// Consent (CASL): a shop may email its own clients under implied consent from
// an existing business relationship (a purchase in the last two years). The
// owner confirms that when importing, every email names the shop, its address
// and a working unsubscribe, and each client gets one invite, ever. No
// follow-ups, no reminders.

export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT = 2000; // per upload
const MAX_LIST = 5000; // per shop
const BATCH_SIZE = 100; // Resend's batch limit

type Row = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  invited_at: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
};

async function context(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  const ctx = await getStudioForUser(supabase, user.id);
  if (!ctx?.canManage) {
    return { error: NextResponse.json({ error: "Only the shop's owner or managers can manage clients." }, { status: 403 }) };
  }
  return { user, supabase, ctx };
}

function clean(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

export async function GET(req: Request) {
  try {
    const c = await context(req);
    if ("error" in c) return c.error;
    const { supabase, ctx } = c;

    const { data, error } = await supabase
      .from("studio_clients")
      .select("id, name, email, phone, created_at, invited_at, unsubscribed_at")
      .eq("studio_id", ctx.studio.id)
      .order("created_at", { ascending: false })
      .limit(MAX_LIST);
    if (error) {
      // The table isn't there until the migration runs.
      if (error.code === "42P01") return NextResponse.json({ clients: [], ready: false });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Who already has a LineUp account (by email).
    const emails = (data || []).map((r) => r.email);
    const onLineUp = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const { data: found } = await supabase.from("profiles").select("email").in("email", emails.slice(i, i + 500));
      for (const p of found || []) if (p.email) onLineUp.add(p.email.toLowerCase());
    }

    const studio = ctx.studio;
    return NextResponse.json({
      ready: true,
      canSend: isStudioLive(studio) && !!studio.slug,
      shopUrl: studio.slug ? `${getSiteUrl("https://www.lineup-aesthetics.ca")}/shop/${studio.slug}` : null,
      clients: (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        addedAt: r.created_at,
        invitedAt: r.invited_at,
        unsubscribed: !!r.unsubscribed_at,
        onLineUp: onLineUp.has(r.email),
      })),
    });
  } catch (error) {
    console.error("GET /api/studio/clients failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load your clients.") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const c = await context(req);
    if ("error" in c) return c.error;
    const { user, supabase, ctx } = c;
    const body = await req.json().catch(() => ({}));

    // ── Import ────────────────────────────────────────────────
    if (body?.action === "import") {
      if (body.consent !== true) {
        return NextResponse.json({ error: "Confirm these are your shop's clients first." }, { status: 400 });
      }
      const incoming = Array.isArray(body.rows) ? body.rows : [];
      if (!incoming.length) return NextResponse.json({ error: "There's no one to add." }, { status: 400 });
      if (incoming.length > MAX_IMPORT) {
        return NextResponse.json({ error: `Add up to ${MAX_IMPORT} clients at a time.` }, { status: 400 });
      }

      const seen = new Set<string>();
      const rows = [];
      let skipped = 0;
      for (const raw of incoming) {
        const email = String(raw?.email || "").trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length > 254 || seen.has(email)) {
          skipped++;
          continue;
        }
        seen.add(email);
        rows.push({
          studio_id: ctx.studio.id,
          email,
          name: clean(raw?.name, 120),
          phone: clean(raw?.phone, 40),
          added_by: user.id,
        });
      }

      const { count } = await supabase
        .from("studio_clients")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", ctx.studio.id);
      if ((count || 0) + rows.length > MAX_LIST) {
        return NextResponse.json({ error: `A shop's list can hold up to ${MAX_LIST} clients. Contact LineUp for more.` }, { status: 409 });
      }

      // Existing clients are left exactly as they are (including unsubscribes).
      let added = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await supabase
          .from("studio_clients")
          .upsert(rows.slice(i, i + 500), { onConflict: "studio_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        added += data?.length || 0;
      }
      return NextResponse.json({ ok: true, added, alreadyThere: rows.length - added, skipped });
    }

    // ── Remove ────────────────────────────────────────────────
    if (body?.action === "remove") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Missing client." }, { status: 400 });
      const { error } = await supabase.from("studio_clients").delete().eq("id", body.id).eq("studio_id", ctx.studio.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── Invite ────────────────────────────────────────────────
    if (body?.action === "invite") {
      const studio = ctx.studio;
      if (!isStudioLive(studio) || !studio.slug) {
        return NextResponse.json(
          { error: "Your shop needs an active Studio plan and a booking page before you can invite clients." },
          { status: 409 }
        );
      }
      if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });

      let query = supabase
        .from("studio_clients")
        .select("id, name, email, phone, created_at, invited_at, unsubscribed_at, unsubscribe_token")
        .eq("studio_id", studio.id)
        .is("invited_at", null)
        .is("unsubscribed_at", null);
      if (Array.isArray(body.ids) && body.ids.length) query = query.in("id", body.ids.slice(0, MAX_LIST));
      const { data, error } = await query.limit(MAX_LIST);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const pending = (data || []) as Row[];
      if (!pending.length) return NextResponse.json({ error: "Everyone on your list has already been invited." }, { status: 400 });

      // The page must echo the count it showed, so a stale screen can't
      // email more people than the owner saw.
      if (typeof body.confirmCount === "number" && body.confirmCount !== pending.length) {
        return NextResponse.json({ error: "Your list changed. Refresh and check the count again." }, { status: 409 });
      }

      const site = getSiteUrl("https://www.lineup-aesthetics.ca");
      const fromAddress = (process.env.EMAIL_FROM || "hello@lineup-aesthetics.ca").match(/<([^>]+)>/)?.[1] ||
        process.env.EMAIL_FROM ||
        "hello@lineup-aesthetics.ca";
      const shopName = studio.name.replace(/[<>"\r\n]/g, "").slice(0, 60) || "Your shop";
      const [{ data: owner }, { data: place }] = await Promise.all([
        supabase.from("profiles").select("email").eq("id", studio.owner_id).maybeSingle(),
        supabase.from("studios").select("address").eq("id", studio.id).maybeSingle(),
      ]);
      const resend = new Resend(process.env.RESEND_API_KEY);

      let sent = 0;
      let failed = 0;
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const chunk = pending.slice(i, i + BATCH_SIZE);
        const messages = chunk.map((client) => {
          const unsubscribeUrl = `${site}/api/studio/clients/unsubscribe?t=${client.unsubscribe_token}`;
          const { subject, html } = studioInviteEmail({
            shopName: studio.name,
            shopAddress: place?.address || null,
            bookUrl: `${site}/shop/${studio.slug}`,
            clientName: client.name,
            unsubscribeUrl,
          });
          return {
            from: `${shopName} via LineUp <${fromAddress}>`,
            to: [client.email],
            ...(owner?.email ? { replyTo: owner.email } : {}),
            subject,
            html,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        });
        const { error: sendError } = await resend.batch.send(messages);
        if (sendError) {
          console.error(`Client invite batch ${i / BATCH_SIZE + 1} failed for studio ${studio.id}:`, sendError);
          failed += chunk.length;
          continue;
        }
        sent += chunk.length;
        await supabase
          .from("studio_clients")
          .update({ invited_at: new Date().toISOString(), invite_count: 1 })
          .in(
            "id",
            chunk.map((c) => c.id)
          );
      }

      console.log(`Studio ${studio.id} invited clients: ${sent} sent, ${failed} failed`);
      return NextResponse.json({ ok: failed === 0, sent, failed });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/studio/clients failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Something went wrong.") }, { status: 500 });
  }
}
