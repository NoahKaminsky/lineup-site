// Client memberships at a studio (see supabase/migrations/20261103_memberships.sql).
// Server-only.

import { getServiceSupabase } from "./serverSupabase";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export const MEMBERSHIP_PLAN_COLUMNS = "id, studio_id, name, description, price_cents, visits_per_period, active, created_at";
export const CLIENT_MEMBERSHIP_COLUMNS =
  "id, plan_id, studio_id, customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_start, current_period_end, created_at";

export type MembershipPlanRow = {
  id: string;
  studio_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  visits_per_period: number | null;
  active: boolean;
  created_at: string;
};

export type ClientMembershipRow = {
  id: string;
  plan_id: string;
  studio_id: string;
  customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
};

// Members who can use their membership right now. (Past due still counts
// for a few days while Stripe retries the card; the shop sees the status.)
export const USABLE_STATUSES = ["active", "trialing", "past_due"];

// Visits used in each membership's current billing period.
export async function visitsThisPeriod(supabase: ServiceClient, memberships: ClientMembershipRow[]) {
  const counts = new Map<string, number>();
  const lastVisit = new Map<string, string>();
  if (!memberships.length) return { counts, lastVisit };

  const earliest = memberships
    .map((m) => m.current_period_start || m.created_at)
    .sort()[0];

  const { data } = await supabase
    .from("membership_visits")
    .select("membership_id, visited_at")
    .in("membership_id", memberships.map((m) => m.id))
    .gte("visited_at", earliest)
    .order("visited_at", { ascending: false });

  const periodStart = new Map(memberships.map((m) => [m.id, m.current_period_start || m.created_at]));
  for (const v of data || []) {
    if (!lastVisit.has(v.membership_id)) lastVisit.set(v.membership_id, v.visited_at);
    if (v.visited_at >= (periodStart.get(v.membership_id) || "")) {
      counts.set(v.membership_id, (counts.get(v.membership_id) || 0) + 1);
    }
  }
  return { counts, lastVisit };
}

type MembershipSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string> | null;
  current_period_start?: number;
  current_period_end?: number;
  items?: { data?: { current_period_start?: number; current_period_end?: number }[] };
};

// Webhook: a membership subscription was started, renewed, changed or ended.
export async function syncMembershipSubscription(subscription: MembershipSubscription, options: { deleted?: boolean } = {}) {
  const planId = subscription.metadata?.membership_plan_id;
  const customerId = subscription.metadata?.membership_customer_id;
  if (!planId || !customerId) return;

  const supabase = getServiceSupabase();
  const { data: plan } = await supabase.from("membership_plans").select("id, studio_id").eq("id", planId).maybeSingle();
  if (!plan) return;

  const item = subscription.items?.data?.[0];
  const start = subscription.current_period_start ?? item?.current_period_start;
  const end = subscription.current_period_end ?? item?.current_period_end;

  const row = {
    plan_id: plan.id,
    studio_id: plan.studio_id,
    customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: options.deleted ? "canceled" : subscription.status,
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
  };

  const { error } = await supabase.from("client_memberships").upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(error.message);
}

export async function markMembershipPastDue(subscriptionId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("client_memberships")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId)
    .select("id");
  return (data || []).length > 0;
}
