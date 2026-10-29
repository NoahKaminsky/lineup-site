// Server-only helpers for studio accounts (shops with a team of pros).
// See supabase/migrations/20261029_studios.sql for the tables.

import { createHash, randomBytes } from "node:crypto";
import type { getServiceSupabase } from "./serverSupabase";
import { STUDIO_MAX_COMMISSION_PERCENT } from "./commission";
import type { StudioPlan } from "./plans";

type ServiceClient = ReturnType<typeof getServiceSupabase>;

export type StudioRow = {
  id: string;
  name: string;
  owner_id: string;
  plan: StudioPlan | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  commission_percent: number | string;
  stripe_account_id: string | null;
  created_at: string;
};

export type StudioMemberRow = {
  id: string;
  studio_id: string;
  profile_id: string | null;
  role: "owner" | "manager" | "member";
  status: "invited" | "active";
  invited_email: string | null;
  invite_expires_at: string | null;
  commission_percent: number | string | null;
  joined_at: string | null;
  created_at: string;
};

export const STUDIO_COLUMNS =
  "id, name, owner_id, plan, subscription_status, subscription_current_period_end, stripe_customer_id, stripe_subscription_id, commission_percent, stripe_account_id, created_at";
export const MEMBER_COLUMNS =
  "id, studio_id, profile_id, role, status, invited_email, invite_expires_at, commission_percent, joined_at, created_at";

const PAID_SOLO_PLANS = ["apprentice", "pro", "master"];
// The plan studio members get while their shop's subscription is live.
const STUDIO_MEMBER_PLAN = "pro";

export const INVITE_TTL_DAYS = 14;

export function isLiveStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export function isStudioLive(studio: Pick<StudioRow, "plan" | "subscription_status"> | null | undefined) {
  return !!studio?.plan && isLiveStatus(studio.subscription_status);
}

// The shop's cut only applies on Studio Plus while it's live.
export function effectiveCutPercent(
  studio: Pick<StudioRow, "plan" | "subscription_status" | "commission_percent">,
  member: Pick<StudioMemberRow, "commission_percent"> | null
) {
  if (!isStudioLive(studio) || studio.plan !== "studio_plus") return 0;
  const raw = member?.commission_percent ?? studio.commission_percent;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), STUDIO_MAX_COMMISSION_PERCENT);
}

export function parseCommissionPercent(value: unknown): number | null | "invalid" {
  if (value === null || value === "" || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > STUDIO_MAX_COMMISSION_PERCENT) return "invalid";
  return Math.round(n * 100) / 100;
}

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// The studio a pro is an active member of, with their membership row.
export async function getMembershipForProfile(supabase: ServiceClient, profileId: string) {
  const { data: member } = await supabase
    .from("studio_members")
    .select(MEMBER_COLUMNS)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle<StudioMemberRow>();

  if (!member) return null;

  const { data: studio } = await supabase
    .from("studios")
    .select(STUDIO_COLUMNS)
    .eq("id", member.studio_id)
    .maybeSingle<StudioRow>();

  if (!studio) return null;
  return { studio, member };
}

// What a booking with this pro looks like from the studio's side: whether
// they're in a live studio (no commission on their own clients) and how big
// the shop's cut is.
export async function getStudioPricingForPro(supabase: ServiceClient, professionalId: string) {
  const membership = await getMembershipForProfile(supabase, professionalId);
  if (!membership) return { studioId: null, inLiveStudio: false, cutPercent: 0 };

  const live = isStudioLive(membership.studio);
  return {
    studioId: live ? membership.studio.id : null,
    inLiveStudio: live,
    cutPercent: effectiveCutPercent(membership.studio, membership.member),
  };
}

// Brings one pro's plan in line with their studio. While the studio is live,
// a member with no paid plan of their own gets Pro features "from the studio";
// when they leave or the studio lapses, only that studio-granted plan is taken
// away. A pro's own paid subscription is never touched.
export async function syncMemberPlan(supabase: ServiceClient, profileId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, subscription_plan, subscription_status, plan_source")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return;

  const membership = await getMembershipForProfile(supabase, profileId);
  const studioLive = membership ? isStudioLive(membership.studio) : false;
  const grantedByStudio = profile.plan_source === "studio";
  const hasOwnLivePlan =
    !grantedByStudio &&
    PAID_SOLO_PLANS.includes(profile.subscription_plan || "") &&
    isLiveStatus(profile.subscription_status);

  const studioId = membership?.studio.id ?? null;

  if (studioLive && !hasOwnLivePlan) {
    await supabase
      .from("profiles")
      .update({
        studio_id: studioId,
        subscription_plan: STUDIO_MEMBER_PLAN,
        subscription_status: "active",
        subscription_current_period_end: membership!.studio.subscription_current_period_end,
        plan_source: "studio",
      })
      .eq("id", profileId);
    return;
  }

  if (grantedByStudio) {
    // The studio's plan no longer covers them (they left, or it lapsed).
    await supabase
      .from("profiles")
      .update({
        studio_id: studioId,
        subscription_plan: null,
        subscription_status: "canceled",
        subscription_current_period_end: null,
        plan_source: null,
      })
      .eq("id", profileId);
    return;
  }

  await supabase.from("profiles").update({ studio_id: studioId }).eq("id", profileId);
}

export async function syncStudioMemberPlans(supabase: ServiceClient, studioId: string) {
  const { data: members } = await supabase
    .from("studio_members")
    .select("profile_id")
    .eq("studio_id", studioId)
    .eq("status", "active");

  for (const member of members || []) {
    if (member.profile_id) await syncMemberPlan(supabase, member.profile_id);
  }
}

// The signed-in user's studio and their role in it, for API routes.
export async function getStudioForUser(supabase: ServiceClient, userId: string) {
  const membership = await getMembershipForProfile(supabase, userId);
  if (!membership) return null;
  const canManage = membership.member.role === "owner" || membership.member.role === "manager";
  return { ...membership, canManage, isOwner: membership.member.role === "owner" };
}

// A readable message from a thrown error (Stripe errors keep theirs on .raw).
export function errorMessage(error: unknown, fallback: string) {
  const e = error as { raw?: { message?: string }; message?: string } | null;
  return e?.raw?.message || e?.message || fallback;
}
