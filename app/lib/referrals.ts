// Server only. Pro referrals: "bring a pro, get a free month".
//
// Every pro has a referral code. A pro who signs up through someone's link is
// tied to them (profiles.referred_by). When that new pro starts a paid plan,
// the referrer gets a month of their own plan as credit on their LineUp
// subscription (a Stripe customer balance credit, used on their next bill).
// No subscription yet: the reward waits and is applied when they start one.
// At most 12 free months a year per referrer.

import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { stripe } from "@/app/lib/stripe";

type Service = ReturnType<typeof getServiceSupabase>;

const MAX_REWARDS_PER_YEAR = 12;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export async function getOrCreateReferralCode(supabase: Service, profile: { id: string; username?: string | null; referral_code?: string | null }) {
  if (profile.referral_code) return profile.referral_code;
  const candidates = [profile.username?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)].filter(Boolean) as string[];
  for (let i = 0; i < 4; i++) {
    candidates.push(Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(""));
  }
  for (const code of candidates) {
    if (code.length < 4) continue;
    const { error } = await supabase.from("profiles").update({ referral_code: code }).eq("id", profile.id).is("referral_code", null);
    if (!error) {
      const { data } = await supabase.from("profiles").select("referral_code").eq("id", profile.id).maybeSingle();
      if (data?.referral_code) return data.referral_code;
    }
  }
  throw new Error("Could not create a referral code.");
}

// A month of the referrer's own plan, from their live subscription.
async function monthCreditCents(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const price = sub.items.data[0]?.price;
  if (!price?.unit_amount) return null;
  const months = price.recurring?.interval === "year" ? 12 : price.recurring?.interval_count || 1;
  return Math.round(price.unit_amount / months);
}

// Apply any waiting rewards for this referrer, if they now have a subscription.
export async function applyPendingReferralRewards(referrerId: string) {
  const supabase = getServiceSupabase();
  const { data: referrer } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("id", referrerId)
    .maybeSingle();
  if (!referrer?.stripe_customer_id || !referrer.stripe_subscription_id || !["active", "trialing"].includes(referrer.subscription_status || "")) return;

  const { data: pending } = await supabase.from("referral_rewards").select("id").eq("referrer_id", referrerId).eq("status", "pending");
  if (!pending?.length) return;

  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { count: appliedThisYear } = await supabase
    .from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .eq("status", "applied")
    .gte("applied_at", yearAgo);
  let room = MAX_REWARDS_PER_YEAR - (appliedThisYear || 0);

  const amount = await monthCreditCents(referrer.stripe_subscription_id);
  if (!amount) return;

  for (const reward of pending) {
    if (room <= 0) break;
    // Claim it first so two runs can't credit it twice.
    const { data: claimed } = await supabase
      .from("referral_rewards")
      .update({ status: "applied", applied_at: new Date().toISOString(), amount_cents: amount })
      .eq("id", reward.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;
    try {
      const tx = await stripe.customers.createBalanceTransaction(referrer.stripe_customer_id, {
        amount: -amount,
        currency: "cad",
        description: "LineUp referral: a free month",
      });
      await supabase.from("referral_rewards").update({ stripe_balance_transaction_id: tx.id }).eq("id", reward.id);
      await supabase.from("notifications").insert([
        { user_id: referrerId, is_read: false, type: "referral_reward", title: "A pro you invited joined a paid plan. Your next month is on us." },
      ]);
      room--;
    } catch (error) {
      console.error(`Referral credit failed for reward ${reward.id}:`, error);
      await supabase.from("referral_rewards").update({ status: "pending", applied_at: null }).eq("id", reward.id);
    }
  }
}

// Called when a pro starts a paid plan: reward whoever referred them (once),
// and apply anything waiting for them as a referrer.
export async function onPaidPlanStarted(userId: string) {
  const supabase = getServiceSupabase();
  try {
    const { data: me } = await supabase.from("profiles").select("referred_by").eq("id", userId).maybeSingle();
    if (me?.referred_by && me.referred_by !== userId) {
      await supabase
        .from("referral_rewards")
        .upsert({ referrer_id: me.referred_by, referred_id: userId }, { onConflict: "referred_id", ignoreDuplicates: true });
      await applyPendingReferralRewards(me.referred_by);
    }
    await applyPendingReferralRewards(userId);
  } catch (error) {
    console.error(`Referral handling failed for ${userId}:`, error);
  }
}
