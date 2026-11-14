// Server only. The Monday summary email: last week against the week before,
// who's overdue, what's booked. Each email carries a signed link that turns
// the summary off without signing in.

import { createHmac, timingSafeEqual } from "crypto";
import type { AnalyticsSummary } from "./analytics";
import { createEmailLayout, escapeHtml } from "./email";

function sign(profileId: string) {
  const secret = process.env.CALENDAR_FEED_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret for summary links");
  return createHmac("sha256", secret).update(`weekly-summary:v1:${profileId}`).digest("base64url").slice(0, 32);
}

export function weeklyOptOutPath(profileId: string) {
  return `/api/analytics/weekly?u=${profileId}&k=${sign(profileId)}`;
}

export function verifyWeeklyKey(profileId: string, key: string) {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return false;
  const expected = Buffer.from(sign(profileId));
  const actual = Buffer.from(key);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const cad = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

function change(now: number, prev: number) {
  if (!prev) return now ? "new this week" : "same as the week before";
  const diff = Math.round(((now - prev) / prev) * 100);
  return diff === 0 ? "same as the week before" : `${diff > 0 ? "up" : "down"} ${Math.abs(diff)}% on the week before`;
}

export function weeklySummaryEmail(summary: AnalyticsSummary, opts: { firstName: string | null; site: string; optOutUrl: string }) {
  const shop = summary.scope === "shop";
  const k = summary.kpis;
  const link = `${opts.site}${shop ? "/studio/analytics" : "/analytics"}`;
  const row = (label: string, value: string, note?: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eeeeee;color:#555555;font-size:14px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eeeeee;text-align:right;font-size:14px;"><strong>${value}</strong>${note ? `<br /><span style="color:#888888;font-size:12px;">${note}</span>` : ""}</td>
    </tr>`;
  const rows = [
    row("Sales", cad(k.sales.now), change(k.sales.now, k.sales.prev)),
    row("Appointments", String(k.visits.now), `${k.visits.prev} the week before`),
    row("Booked for the next 7 days", String(summary.onTheBooks.next7Visits)),
    !summary.locked && k.utilization.now !== null ? row("Open time booked", `${k.utilization.now}%`) : "",
    !summary.locked && summary.clients.atRiskCount
      ? row("Clients overdue", String(summary.clients.atRiskCount), `about ${cad(summary.clients.atRiskValue)} if each comes back once`)
      : "",
    summary.goal.cents ? row(`${summary.goal.month} goal`, `${cad(summary.goal.soFar)} of ${cad(summary.goal.cents)}`, `on pace for ${cad(summary.goal.pace)}`) : "",
  ].join("");
  const tip = summary.insights.find((i) => i.tone !== "good") || summary.insights[0];
  const subject = `${shop ? summary.name || "Your shop" : "Your week"}: ${cad(k.sales.now)} from ${k.visits.now} appointment${k.visits.now === 1 ? "" : "s"}`;
  const html = createEmailLayout({
    title: shop ? `${summary.name || "Your shop"}'s week` : "Your week on LineUp",
    preview: `${cad(k.sales.now)} in sales, ${change(k.sales.now, k.sales.prev)}.`,
    ctaLabel: !summary.locked && summary.clients.atRiskCount ? "See who is overdue" : "Open Analytics",
    ctaUrl: link,
    content: `
      <p style="margin:0 0 16px 0;">Hi${opts.firstName ? ` ${escapeHtml(opts.firstName)}` : ""}, here's the last 7 days${shop ? ` at ${escapeHtml(summary.name || "the shop")}` : ""}.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">${rows}</table>
      ${tip ? `<p style="margin:0 0 6px 0;"><strong>${escapeHtml(tip.title)}</strong></p><p style="margin:0 0 16px 0;color:#444444;">${escapeHtml(tip.body)}</p>` : ""}
      <p style="margin:0;color:#888888;font-size:12px;">Sent Mondays. <a href="${opts.optOutUrl}" style="color:#888888;">Turn off the weekly summary</a>.</p>
    `,
  });
  return { subject, html };
}
