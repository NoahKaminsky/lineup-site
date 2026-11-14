import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { verifyWeeklyKey } from "@/app/lib/weeklySummary";

// GET /api/analytics/weekly?u=<profile id>&k=<signature>[&on=1]
// The "turn off the weekly summary" link in the Monday email. Signed, so it
// works without signing in; &on=1 turns it back on.

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f3;color:#0a0a0a;margin:0;padding:48px 20px;">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;">
<h1 style="font-size:20px;margin:0 0 8px;">${title}</h1><p style="margin:0;color:#555;line-height:1.5;">${body}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("u") || "";
  const key = url.searchParams.get("k") || "";
  if (!verifyWeeklyKey(id, key)) return page("That link didn't work", "Open the link from your latest weekly summary email.");
  const on = url.searchParams.get("on") === "1";
  const { error } = await getServiceSupabase().from("profiles").update({ weekly_summary_opt_out: !on }).eq("id", id);
  if (error) return page("Something went wrong", "Please try the link again in a minute.");
  const back = `${url.pathname}?u=${id}&k=${key}${on ? "" : "&on=1"}`;
  return on
    ? page("Weekly summary is back on", `You'll get it on Mondays. <a href="${back}" style="color:#0a0a0a;">Turn it off</a>.`)
    : page("Weekly summary turned off", `You won't get the Monday email any more. <a href="${back}" style="color:#0a0a0a;">Turn it back on</a>.`);
}
