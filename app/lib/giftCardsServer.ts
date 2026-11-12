// Server only (service key, Stripe, email). Gift card sellers, activation
// after payment, and the emails that go with it.

import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { isStudioLive } from "@/app/lib/studios";
import { getProfileHref } from "@/app/lib/profileLink";
import { getSiteUrl } from "@/app/lib/siteUrl";
import { sendEmail, escapeHtml } from "@/app/lib/email";
import { formatCad } from "@/app/lib/giftCards";

type Service = ReturnType<typeof getServiceSupabase>;

export type GiftSeller = {
  kind: "pro" | "shop";
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  href: string;
  stripeAccountId: string | null;
  // Can take a gift card payment right now.
  ready: boolean;
  // Who to tell when one sells.
  notifyIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadGiftSeller(supabase: Service, kind: string, slug: string): Promise<GiftSeller | null> {
  if (kind === "shop") {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
    const { data: studio } = await supabase
      .from("studios")
      .select("id, slug, name, owner_id, plan, subscription_status, stripe_account_id")
      .eq("slug", slug)
      .maybeSingle();
    if (!studio?.slug) return null;
    const { data: managers } = await supabase
      .from("studio_members")
      .select("profile_id, role")
      .eq("studio_id", studio.id)
      .eq("status", "active")
      .in("role", ["owner", "manager"]);
    return {
      kind: "shop",
      id: studio.id,
      slug: studio.slug,
      name: studio.name,
      avatarUrl: null,
      href: `/shop/${studio.slug}`,
      stripeAccountId: studio.stripe_account_id,
      ready: isStudioLive(studio) && !!studio.stripe_account_id,
      notifyIds: Array.from(new Set([studio.owner_id, ...(managers || []).map((m) => m.profile_id).filter(Boolean)])),
    };
  }

  if (kind !== "pro") return null;
  const column = UUID.test(slug) ? "id" : "username";
  const { data: pro } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, role, stripe_account_id, stripe_charges_enabled, verification_status, verified_until")
    .eq(column, slug)
    .maybeSingle();
  if (!pro || pro.role !== "professional") return null;
  return {
    kind: "pro",
    id: pro.id,
    slug: pro.username || pro.id,
    name: pro.full_name || "LineUp pro",
    avatarUrl: pro.avatar_url,
    href: getProfileHref(pro),
    stripeAccountId: pro.stripe_account_id,
    ready: isVerifiedNow(pro) && !!pro.stripe_account_id && !!pro.stripe_charges_enabled,
    notifyIds: [pro.id],
  };
}

export function cardEmail({
  sellerName,
  sellerUrl,
  amount,
  code,
  balanceUrl,
  fromName,
  toName,
  message,
}: {
  sellerName: string;
  sellerUrl: string;
  amount: string;
  code: string;
  balanceUrl: string;
  fromName: string | null;
  toName: string | null;
  message: string | null;
}) {
  const seller = escapeHtml(sellerName);
  const hi = toName ? `Hi ${escapeHtml(toName.split(/\s+/)[0])},` : "Hi there,";
  const from = fromName ? escapeHtml(fromName) : "Someone";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>A gift card for ${seller}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
<div style="display:none;max-height:0;overflow:hidden;color:#f5f5f5;">${from} sent you a ${escapeHtml(amount)} gift card for ${seller}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:28px;">
<tr><td style="padding:40px 36px 8px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8a8a;">LineUp gift card</td></tr>
<tr><td style="padding:0 36px 20px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:30px;line-height:36px;font-weight:700;letter-spacing:-0.5px;color:#111111;">${escapeHtml(amount)} at ${seller}</td></tr>
<tr><td style="padding:0 36px 24px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:26px;color:#333333;">${hi}<br /><br />${from} sent you a gift card for ${seller}.${
    message ? `<br /><br /><span style="display:block;border-left:3px solid #111111;padding-left:14px;color:#111111;font-style:italic;">${escapeHtml(message).replace(/\n/g, "<br />")}</span>` : ""
  }</td></tr>
<tr><td style="padding:0 36px 24px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111111;border-radius:20px;"><tr><td style="padding:26px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#ffffff;">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a3a3a3;">Your code</div>
<div style="margin-top:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:24px;letter-spacing:2px;font-weight:700;">${escapeHtml(code)}</div>
<div style="margin-top:8px;font-size:14px;color:#d4d4d4;">Worth ${escapeHtml(amount)}. Never expires.</div>
</td></tr></table></td></tr>
<tr><td style="padding:0 36px 32px 36px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:999px;background:#111111;">
<a href="${sellerUrl}" style="display:inline-block;padding:15px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Book with ${seller}</a>
</td></tr></table></td></tr>
<tr><td style="padding:0 36px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:22px;color:#666666;">
<strong style="color:#111111;">How to use it:</strong> message ${seller} to book and mention your gift card, then show this code at your appointment. They&rsquo;ll take it off what you owe, and you can use it over more than one visit.<br /><br />
It can only be used with ${seller}. It never expires and there are no fees. <a href="${balanceUrl}" style="color:#111111;">Check your balance</a> any time.
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:19px;color:#8a8a8a;">Sent by LineUp on behalf of ${from}. Questions? Reply to this email.</p>
</td></tr></table></body></html>`;
}

// After Stripe confirms payment: switch the card on, send it, tell the seller.
// Safe to run twice (only a pending card is activated).
export async function activateGiftCard(session: {
  id: string;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
  payment_status?: string | null;
}) {
  const giftCardId = session.metadata?.gift_card_id;
  if (!giftCardId || session.payment_status !== "paid") return;
  const supabase = getServiceSupabase();

  const buyerEmail = session.customer_details?.email?.toLowerCase() || null;
  const { data: card } = await supabase
    .from("gift_cards")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
      ...(buyerEmail ? { buyer_email: buyerEmail } : {}),
    })
    .eq("id", giftCardId)
    .eq("stripe_checkout_session_id", session.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!card) return; // already active, or not ours

  const seller = card.studio_id
    ? await supabase.from("studios").select("slug").eq("id", card.studio_id).maybeSingle().then((r) => r.data && loadGiftSeller(supabase, "shop", r.data.slug))
    : await loadGiftSeller(supabase, "pro", card.professional_id);
  if (!seller) return;

  const site = getSiteUrl("https://www.lineup-aesthetics.ca");
  const amount = formatCad(card.amount_cents);
  const html = cardEmail({
    sellerName: seller.name,
    sellerUrl: `${site}${seller.href}`,
    amount,
    code: card.code,
    balanceUrl: `${site}/gift/balance?code=${encodeURIComponent(card.code)}`,
    fromName: card.buyer_name,
    toName: card.recipient_name,
    message: card.message,
  });

  const toRecipient = card.send_to_recipient && card.recipient_email;
  try {
    if (toRecipient) {
      await sendEmail({ to: card.recipient_email, subject: `${card.buyer_name || "Someone"} sent you a ${amount} gift card for ${seller.name}`, html });
    }
    if (card.buyer_email) {
      await sendEmail({
        to: card.buyer_email,
        subject: toRecipient ? `Your gift card for ${seller.name} was sent` : `Your ${amount} gift card for ${seller.name}`,
        html: toRecipient
          ? html.replace(
              "LineUp gift card</td>",
              `LineUp gift card &middot; your copy (we sent this to ${escapeHtml(card.recipient_name || card.recipient_email)})</td>`
            )
          : html,
      });
    }
  } catch (error) {
    console.error(`Gift card ${card.id} emails failed:`, error);
  }

  if (seller.notifyIds.length) {
    await supabase.from("notifications").insert(
      seller.notifyIds.map((id) => ({
        user_id: id,
        request_id: null,
        is_read: false,
        type: "gift_card_sold",
        title: `${card.buyer_name || "Someone"} bought a ${amount} gift card for ${seller.kind === "shop" ? seller.name : "you"}`,
      }))
    );
  }
}
