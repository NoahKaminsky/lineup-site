import { NextResponse } from "next/server";
import { getServiceSupabase, isCronAuthorized } from "@/app/lib/serverSupabase";
import { getStudioForUser, isStudioLive } from "@/app/lib/studios";
import { buildAnalytics } from "@/app/lib/analytics";
import { sendEmail } from "@/app/lib/email";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { weeklyOptOutPath, weeklySummaryEmail } from "@/app/lib/weeklySummary";

// Mondays (vercel.json). Emails each pro on a plan their last 7 days: sales
// against the week before, who's overdue, what's booked. Owners and managers
// of a shop on a plan get the shop's numbers instead. Skipped for anyone who
// turned it off, and for anyone with nothing in the last two weeks and
// nothing booked.

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceSupabase();
  const started = Date.now();
  const site = getSiteUrl("https://www.lineup-aesthetics.ca");

  const { data: pros, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_plan")
    .in("subscription_status", ["active", "trialing"])
    .eq("weekly_summary_opt_out", false)
    .not("email", "is", null)
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  for (const pro of pros || []) {
    if (Date.now() - started > 270_000) break; // leave time to answer
    try {
      const ctx = await getStudioForUser(supabase, pro.id);
      const shop = ctx?.canManage && isStudioLive(ctx.studio) ? ctx.studio : null;
      let goalCents: number | null = null;
      if (shop) {
        goalCents = (await supabase.from("studios").select("sales_goal_cents").eq("id", shop.id).maybeSingle()).data?.sales_goal_cents ?? null;
      } else {
        goalCents = (await supabase.from("profiles").select("sales_goal_cents").eq("id", pro.id).maybeSingle()).data?.sales_goal_cents ?? null;
      }
      const summary = await buildAnalytics(supabase, {
        scope: shop ? "shop" : "me",
        userId: pro.id,
        studio: shop,
        days: 7,
        locked: shop ? false : !["pro", "master"].includes(pro.subscription_plan || ""),
        name: shop ? shop.name : pro.full_name,
        goalCents,
      });
      if (summary.kpis.visits.now + summary.kpis.visits.prev + summary.onTheBooks.visits === 0) {
        skipped++;
        continue;
      }
      const { subject, html } = weeklySummaryEmail(summary, {
        firstName: pro.full_name ? pro.full_name.split(" ")[0] : null,
        site,
        optOutUrl: `${site}${weeklyOptOutPath(pro.id)}`,
      });
      await sendEmail({ to: pro.email as string, subject, html });
      sent++;
    } catch (e) {
      console.error(`Weekly summary failed for ${pro.id}:`, e);
    }
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
