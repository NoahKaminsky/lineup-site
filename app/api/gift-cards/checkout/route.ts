import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { loadGiftSeller } from "@/app/lib/giftCardsServer";
import { GIFT_CARD_MAX_CENTS, GIFT_CARD_MIN_CENTS, giftCardFeeCents, newGiftCode, formatCad } from "@/app/lib/giftCards";

// POST: start buying a gift card. Saves the card as pending, then sends the
// buyer to Stripe Checkout. The webhook switches it on and emails it once
// paid. Signing in is optional: guests can buy one too.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number) {
  const t = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const supabase = getServiceSupabase();

    const seller = await loadGiftSeller(supabase, String(body?.kind || ""), String(body?.slug || ""));
    if (!seller) return NextResponse.json({ error: "We couldn't find who this gift card is for." }, { status: 404 });
    if (!seller.ready || !seller.stripeAccountId) {
      return NextResponse.json({ error: `${seller.name} isn't selling gift cards right now.` }, { status: 409 });
    }

    const amountCents = Math.round(Number(body?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < GIFT_CARD_MIN_CENTS || amountCents > GIFT_CARD_MAX_CENTS) {
      return NextResponse.json(
        { error: `Pick an amount between ${formatCad(GIFT_CARD_MIN_CENTS)} and ${formatCad(GIFT_CARD_MAX_CENTS)}.` },
        { status: 400 }
      );
    }

    const sendToRecipient = body?.sendToRecipient !== false;
    const recipientEmail = text(body?.recipientEmail, 254)?.toLowerCase() || null;
    if (sendToRecipient && (!recipientEmail || !EMAIL_RE.test(recipientEmail))) {
      return NextResponse.json({ error: "Add the email address to send the gift card to." }, { status: 400 });
    }
    const recipientName = text(body?.recipientName, 80);
    const buyerName = text(body?.buyerName, 80);
    if (!buyerName) return NextResponse.json({ error: "Add your name so they know who it's from." }, { status: 400 });
    const message = text(body?.message, 300);

    const user = await getAuthenticatedUser(req).catch(() => null);

    // A fresh code; retry on the (very unlikely) clash.
    let card: { id: string } | null = null;
    for (let i = 0; i < 3 && !card; i++) {
      const { data, error } = await supabase
        .from("gift_cards")
        .insert({
          code: newGiftCode(),
          professional_id: seller.kind === "pro" ? seller.id : null,
          studio_id: seller.kind === "shop" ? seller.id : null,
          amount_cents: amountCents,
          balance_cents: amountCents,
          buyer_id: user?.id || null,
          buyer_name: buyerName,
          buyer_email: user?.email?.toLowerCase() || null,
          recipient_name: recipientName,
          recipient_email: sendToRecipient ? recipientEmail : null,
          message,
          send_to_recipient: sendToRecipient,
        })
        .select("id")
        .single();
      if (!error) card = data;
      else if (error.code !== "23505") throw error;
    }
    if (!card) throw new Error("Could not create a gift card code.");

    const site = getSiteUrl("https://www.lineup-aesthetics.ca");
    const name = `${formatCad(amountCents)} gift card for ${seller.name}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(user?.email ? { customer_email: user.email } : {}),
      line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: amountCents, product_data: { name } } }],
      payment_intent_data: {
        // Straight to the pro or shop. Processing and LineUp's flat fee come
        // off their side; the buyer pays the card's value only.
        transfer_data: { destination: seller.stripeAccountId },
        application_fee_amount: giftCardFeeCents(amountCents),
        description: name,
        metadata: { gift_card_id: card.id },
      },
      metadata: { gift_card_id: card.id },
      success_url: `${site}/gift/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/gift/${seller.kind}/${seller.slug}`,
    });

    await supabase.from("gift_cards").update({ stripe_checkout_session_id: session.id }).eq("id", card.id);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("POST /api/gift-cards/checkout failed:", error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
