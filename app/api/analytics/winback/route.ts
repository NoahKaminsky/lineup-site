import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive, errorMessage } from "@/app/lib/studios";
import { buildAnalytics } from "@/app/lib/analytics";
import { sendPushToUser } from "@/app/lib/push";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { getProfileHref } from "@/app/lib/profileLink";

// POST /api/analytics/winback { scope: "me" | "shop", customerIds: string[] | "all" }
// Sends a "time to come back?" note to overdue clients: a LineUp
// notification, a push, and an email unless they've opted out. The overdue
// list is worked out again here, so only clients who really are overdue (and
// are this pro's or this shop's) can be nudged, at most once every 30 days.

export const maxDuration = 60;
const MAX_PER_CALL = 30;

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const scope = body?.scope === "shop" ? "shop" : "me";
    const wanted: string[] | "all" = body?.customerIds === "all" ? "all" : Array.isArray(body?.customerIds) ? body.customerIds.map(String) : [];
    if (wanted !== "all" && !wanted.length) return NextResponse.json({ error: "Pick who to nudge." }, { status: 400 });

    const supabase = getServiceSupabase();
    let summary;
    if (scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx?.canManage) return NextResponse.json({ error: "Only the owner and managers can do this." }, { status: 403 });
      if (!isStudioLive(ctx.studio)) return NextResponse.json({ error: "This comes with a Studio plan." }, { status: 402 });
      summary = await buildAnalytics(supabase, { scope, userId: user.id, studio: ctx.studio, days: 90, locked: false, name: ctx.studio.name });
    } else {
      const { data: profile } = await supabase.from("profiles").select("subscription_status, subscription_plan").eq("id", user.id).maybeSingle();
      const live = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
      if (!live || !["pro", "master"].includes(profile?.subscription_plan || "")) {
        return NextResponse.json({ error: "Win-back nudges come with Pro and Master." }, { status: 402 });
      }
      summary = await buildAnalytics(supabase, { scope, userId: user.id, days: 90, locked: false, name: null });
    }

    const targets = summary.clients.atRisk
      .filter((c) => c.customerId && c.nudgedDaysAgo === null && (wanted === "all" || wanted.includes(c.customerId)))
      .slice(0, MAX_PER_CALL);
    if (!targets.length) return NextResponse.json({ ok: true, sent: 0, skipped: "Nobody left to nudge: they've had one in the last 30 days or aren't overdue." });

    const site = getSiteUrl("https://www.lineup-aesthetics.ca");
    const ids = [...new Set([...targets.map((t) => t.customerId as string), ...targets.map((t) => t.proId)])];
    const { data: people } = await supabase.from("profiles").select("id, username, full_name, email, unsubscribed_from_marketing").in("id", ids);
    const byId = new Map((people || []).map((p) => [p.id, p]));

    let sent = 0;
    for (const t of targets) {
      const client = byId.get(t.customerId as string);
      const pro = byId.get(t.proId);
      if (!client || !pro) continue;
      // Log first, so a retry or a second tap can't send twice.
      const { error: logError } = await supabase.from("winback_nudges").insert({ professional_id: t.proId, customer_id: client.id, sent_by: user.id });
      if (logError) throw logError;

      const proName = pro.full_name || "your pro";
      const first = proName.split(" ")[0];
      const link = `${site}${getProfileHref(pro)}#availability`;
      await supabase.from("notifications").insert([{ user_id: client.id, is_read: false, type: "rebook_nudge", title: `${proName} has open times. Ready for your next visit?` }]);
      await sendPushToUser(client.id, { title: `Ready for your next visit?`, body: `${proName} has open times this week.`, url: link }).catch(() => {});
      if (client.email && !client.unsubscribed_from_marketing) {
        try {
          await sendEmail({
            to: client.email,
            subject: `${first} has open times for you`,
            html: createEmailLayout({
              title: `Ready for your next visit?`,
              preview: `It's been a while since your last visit with ${proName}.`,
              ctaLabel: `See ${first}'s open times`,
              ctaUrl: link,
              content: `
                <p style="margin:0 0 16px 0;">Hi${client.full_name ? ` ${escapeHtml(client.full_name.split(" ")[0])}` : ""},</p>
                <p style="margin:0 0 16px 0;">It's been a while since your last visit with <strong>${escapeHtml(proName)}</strong>, and there are open times coming up.</p>
                <p style="margin:0;color:#666666;font-size:13px;">You're getting this because you've booked ${escapeHtml(first)} on LineUp before. <a href="${site}/unsubscribe?email=${encodeURIComponent(client.email)}" style="color:#666666;">Stop these emails</a>.</p>
              `,
            }),
          });
        } catch (emailError) {
          console.error(`Win-back email failed for ${client.id}:`, emailError);
        }
      }
      sent++;
    }
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    console.error("POST /api/analytics/winback failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not send the nudges.") }, { status: 500 });
  }
}
