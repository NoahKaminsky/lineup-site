import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { normalizeGiftCode } from "@/app/lib/giftCards";

// GET ?code=  Public balance check for whoever holds a card (Manitoba requires
// telling holders how to check their balance). Shows only the balance and
// who it's for, never who bought it or any message.
export async function GET(req: Request) {
  const code = normalizeGiftCode(new URL(req.url).searchParams.get("code") || "");
  if (!code) return NextResponse.json({ error: "Enter the 12-character code from your gift card." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: card } = await supabase
    .from("gift_cards")
    .select("amount_cents, balance_cents, status, professional_id, studio_id")
    .eq("code", code)
    .maybeSingle();
  if (!card || card.status === "pending") return NextResponse.json({ error: "We couldn't find a gift card with that code." }, { status: 404 });

  let forName = "LineUp";
  let href: string | null = null;
  if (card.studio_id) {
    const { data } = await supabase.from("studios").select("name, slug").eq("id", card.studio_id).maybeSingle();
    if (data) {
      forName = data.name;
      href = data.slug ? `/shop/${data.slug}` : null;
    }
  } else if (card.professional_id) {
    const { data } = await supabase.from("profiles").select("full_name, username, id").eq("id", card.professional_id).maybeSingle();
    if (data) {
      forName = data.full_name || "your pro";
      href = `/profile/${data.username || data.id}`;
    }
  }

  return NextResponse.json({
    code,
    forName,
    href,
    amountCents: card.amount_cents,
    balanceCents: card.status === "void" ? 0 : card.balance_cents,
    void: card.status === "void",
  });
}
