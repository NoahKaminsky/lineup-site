import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";
import { activateGiftCard } from "@/app/lib/giftCardsServer";
import { formatCad } from "@/app/lib/giftCards";

// After Stripe Checkout. Also switches the card on if the webhook hasn't yet,
// so the buyer never lands on a "pending" card.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gift card sent", robots: { index: false } };

export default async function GiftThanksPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sessionId = (await searchParams).session_id || "";
  let card: { amount_cents: number; recipient_name: string | null; recipient_email: string | null; send_to_recipient: boolean; buyer_email: string | null; status: string } | null = null;

  if (/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.gift_card_id) {
        await activateGiftCard(session as unknown as Parameters<typeof activateGiftCard>[0]);
        const { data } = await getServiceSupabase()
          .from("gift_cards")
          .select("amount_cents, recipient_name, recipient_email, send_to_recipient, buyer_email, status")
          .eq("stripe_checkout_session_id", sessionId)
          .maybeSingle();
        card = data;
      }
    } catch (error) {
      console.error("Gift thanks page lookup failed:", error);
    }
  }

  const sentTo = card?.send_to_recipient ? card.recipient_name || card.recipient_email : null;

  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Gift card"
        title={card?.status === "active" ? "Thank you. It's on its way." : "Thanks! We're finishing up."}
        subtitle={
          card?.status === "active"
            ? sentTo
              ? `We've emailed the ${formatCad(card.amount_cents)} gift card to ${sentTo}, and a copy to you.`
              : `We've emailed the ${formatCad(card.amount_cents)} gift card to ${card.buyer_email || "you"}, ready to pass on.`
            : "Your payment went through. The gift card email will arrive in the next few minutes."
        }
      />
      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Link href="/gift/balance" className="text-sm underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
          Check a gift card balance
        </Link>
      </div>
    </PublicLayout>
  );
}
