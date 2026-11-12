import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser } from "@/app/lib/studios";
import { normalizeGiftCode } from "@/app/lib/giftCards";

// For the pro or shop that sold the cards.
//   GET            every card sold for me (and my shop, if I'm on one)
//   GET ?code=     look one card up, to redeem it
//   POST { action: "redeem", code, amountCents, note? }
// A pro's cards: that pro. A shop's cards: anyone on the shop's team, since
// the holder can book any of them.

type Card = {
  id: string;
  code: string;
  professional_id: string | null;
  studio_id: string | null;
  amount_cents: number;
  balance_cents: number;
  status: string;
  buyer_name: string | null;
  recipient_name: string | null;
  created_at: string;
  activated_at: string | null;
};

const COLUMNS = "id, code, professional_id, studio_id, amount_cents, balance_cents, status, buyer_name, recipient_name, created_at, activated_at";

async function who(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;
  const supabase = getServiceSupabase();
  const studio = await getStudioForUser(supabase, user.id);
  return { user, supabase, studioId: studio?.studio.id || null };
}

function canUse(card: Card, me: { user: { id: string }; studioId: string | null }) {
  return card.professional_id === me.user.id || (!!card.studio_id && card.studio_id === me.studioId);
}

function shape(card: Card) {
  return {
    id: card.id,
    code: card.code,
    forShop: !!card.studio_id,
    amountCents: card.amount_cents,
    balanceCents: card.balance_cents,
    status: card.status,
    from: card.buyer_name,
    to: card.recipient_name,
    soldAt: card.activated_at || card.created_at,
  };
}

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase } = me;

  const raw = new URL(req.url).searchParams.get("code");
  if (raw) {
    const code = normalizeGiftCode(raw);
    if (!code) return NextResponse.json({ error: "That doesn't look like a LineUp gift card code." }, { status: 400 });
    const { data } = await supabase.from("gift_cards").select(COLUMNS).eq("code", code).maybeSingle<Card>();
    if (!data || data.status === "pending" || !canUse(data, me)) {
      return NextResponse.json({ error: "No gift card for you or your shop has that code." }, { status: 404 });
    }
    return NextResponse.json({ card: shape(data) });
  }

  const filters = [`professional_id.eq.${me.user.id}`];
  if (me.studioId) filters.push(`studio_id.eq.${me.studioId}`);
  const { data, error } = await supabase
    .from("gift_cards")
    .select(COLUMNS)
    .or(filters.join(","))
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // The links to share for buying one.
  const [{ data: profile }, { data: studio }] = await Promise.all([
    supabase.from("profiles").select("id, username, role, stripe_charges_enabled").eq("id", me.user.id).maybeSingle(),
    me.studioId ? supabase.from("studios").select("slug, name").eq("id", me.studioId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const links: { label: string; path: string }[] = [];
  if (profile?.role === "professional") links.push({ label: "You", path: `/gift/pro/${profile.username || profile.id}` });
  if (studio?.slug) links.push({ label: studio.name, path: `/gift/shop/${studio.slug}` });

  return NextResponse.json({ cards: ((data || []) as Card[]).map(shape), hasShop: !!me.studioId, links });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const me = await who(req);
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { supabase, user } = me;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "redeem") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const code = normalizeGiftCode(String(body?.code || ""));
  const amountCents = Math.round(Number(body?.amountCents));
  if (!code) return NextResponse.json({ error: "That doesn't look like a LineUp gift card code." }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter the amount to take off." }, { status: 400 });

  const { data: card } = await supabase.from("gift_cards").select(COLUMNS).eq("code", code).maybeSingle<Card>();
  if (!card || card.status === "pending" || !canUse(card, me)) {
    return NextResponse.json({ error: "No gift card for you or your shop has that code." }, { status: 404 });
  }
  if (amountCents > card.balance_cents) {
    return NextResponse.json({ error: "That's more than what's left on the card." }, { status: 409 });
  }

  const note = String(body?.note || "").trim().slice(0, 200) || null;
  const { data: balance, error } = await supabase.rpc("redeem_gift_card", {
    p_card: card.id,
    p_amount: amountCents,
    p_by: user.id,
    p_note: note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (balance === null) return NextResponse.json({ error: "The card's balance just changed. Look it up again." }, { status: 409 });
  return NextResponse.json({ ok: true, balanceCents: balance });
}
