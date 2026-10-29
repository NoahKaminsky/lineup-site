// Records a paid boost once Stripe confirms the payment (webhook). A new
// boost starts when any current one for the same thing ends, so buying two
// weeks back to back gives two weeks. Server-only.

import { getServiceSupabase } from "./serverSupabase";
import { BOOSTS, type BoostKind } from "./boosts";

export async function recordBoost(session: {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
}) {
  const kind = session.metadata?.boost_kind as BoostKind | undefined;
  const targetId = session.metadata?.target_id;
  if (!kind || !(kind in BOOSTS) || !targetId) return;
  if (session.payment_status !== "paid") return;

  const supabase = getServiceSupabase();

  const { data: already } = await supabase
    .from("boosts")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (already) return;

  const { data: latest } = await supabase
    .from("boosts")
    .select("ends_at")
    .eq("kind", kind)
    .eq("target_id", targetId)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const start = latest && Date.parse(latest.ends_at) > now ? Date.parse(latest.ends_at) : now;
  const end = start + BOOSTS[kind].days * 86_400_000;

  const { error } = await supabase.from("boosts").insert({
    kind,
    target_id: targetId,
    purchased_by: session.metadata?.purchased_by || null,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    amount_cents: session.amount_total ?? BOOSTS[kind].cents,
    stripe_checkout_session_id: session.id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

// Profile ids with a boost running right now.
export async function activeProfileBoostIds() {
  const now = new Date().toISOString();
  const { data, error } = await getServiceSupabase()
    .from("boosts")
    .select("target_id")
    .eq("kind", "profile")
    .lte("starts_at", now)
    .gt("ends_at", now);
  if (error) return []; // table not created yet
  return [...new Set((data || []).map((b) => b.target_id as string))];
}
