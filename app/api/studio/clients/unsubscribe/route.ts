import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

// Unsubscribe from one shop's emails (the link in a client invite).
// GET: someone clicked the link. POST: their mail app's one-click button.
// Either way that shop never emails them through LineUp again.

const TOKEN = /^[a-f0-9]{36}$/;

async function unsubscribe(token: string | null) {
  if (!token || !TOKEN.test(token)) return null;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("studio_clients")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("studio_id, professional_id")
    .maybeSingle();
  if (!data) return null;
  if (!data.studio_id && data.professional_id) {
    const { data: pro } = await supabase.from("profiles").select("full_name").eq("id", data.professional_id).maybeSingle();
    return pro?.full_name || "this pro";
  }
  const { data: studio } = await supabase.from("studios").select("name").eq("id", data.studio_id).maybeSingle();
  return studio?.name || "this shop";
}

function page(message: string) {
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#111">
<div style="max-width:440px;margin:15vh auto;padding:32px;background:#fff;border-radius:24px;border:1px solid #e5e5e5;text-align:center">
<p style="font-size:20px;font-weight:600;margin:0 0 8px">${safe}</p>
<p style="color:#666;margin:0">You can close this page.</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: Request) {
  const name = await unsubscribe(new URL(req.url).searchParams.get("t"));
  return page(name ? `You won't get any more emails from ${name}.` : "That link has already been used or isn't valid.");
}

export async function POST(req: Request) {
  await unsubscribe(new URL(req.url).searchParams.get("t"));
  return NextResponse.json({ ok: true });
}
