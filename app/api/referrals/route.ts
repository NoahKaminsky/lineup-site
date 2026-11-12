import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getOrCreateReferralCode } from "@/app/lib/referrals";
import { getSiteUrl } from "@/app/lib/siteUrl";

// GET                       a pro's referral link and how it's doing
// POST { action: "claim", code }   a pro who just signed up through a link
//                                   is tied to the pro who shared it (once)

const CLAIM_WINDOW_DAYS = 30;

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  const { data: me } = await supabase.from("profiles").select("id, username, role, referral_code").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "professional") return NextResponse.json({ error: "Referrals are for pros." }, { status: 403 });

  const code = await getOrCreateReferralCode(supabase, me);
  const [{ count: joined }, { data: rewards }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", me.id),
    supabase.from("referral_rewards").select("status").eq("referrer_id", me.id),
  ]);
  return NextResponse.json({
    link: `${getSiteUrl("https://www.lineup-aesthetics.ca")}/?ref=${code}`,
    joined: joined || 0,
    earned: (rewards || []).filter((r) => r.status === "applied").length,
    waiting: (rewards || []).filter((r) => r.status === "pending").length,
  });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "claim") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const code = String(body?.code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  if (!code) return NextResponse.json({ ok: false });

  const supabase = getServiceSupabase();
  const [{ data: me }, { data: referrer }] = await Promise.all([
    supabase.from("profiles").select("id, role, referred_by, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, role").eq("referral_code", code).maybeSingle(),
  ]);
  // Only a new pro, once, and never yourself.
  const isNew = me?.created_at && Date.now() - Date.parse(me.created_at) < CLAIM_WINDOW_DAYS * 86_400_000;
  if (!me || !referrer || me.role !== "professional" || referrer.role !== "professional" || me.referred_by || referrer.id === me.id || !isNew) {
    return NextResponse.json({ ok: false });
  }
  await supabase.from("profiles").update({ referred_by: referrer.id }).eq("id", me.id).is("referred_by", null);
  await supabase.from("notifications").insert([
    { user_id: referrer.id, is_read: false, type: "referral_joined", title: "A pro joined LineUp with your link. You'll get a free month when they start a paid plan." },
  ]);
  return NextResponse.json({ ok: true });
}
