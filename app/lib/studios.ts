// Server-only helpers for studio accounts (shops with a team of pros).
// See supabase/migrations/20261029_studios.sql for the tables.

import { createHash, randomBytes } from "node:crypto";
import type { getServiceSupabase } from "./serverSupabase";
import { STUDIO_MAX_COMMISSION_PERCENT } from "./commission";
import { stripe } from "./stripe";
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
  slug: string | null;
  tagline: string | null;
  created_at: string;
};

// Added by 20261104_shop_accounts.sql; read separately so older databases
// still load.
export type StudioPlaceRow = {
  address: string | null;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  area_label: string | null;
  trades: string[] | null;
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
  arrangement: "commission" | "booth_rent";
  rent_cents: number | null;
  rent_interval: "week" | "month" | null;
  rent_subscription_id: string | null;
  rent_status: string | null;
  rent_current_period_end: string | null;
  joined_at: string | null;
  created_at: string;
  takes_clients?: boolean | null;
  solo_plan_handled?: boolean | null;
};

export const STUDIO_COLUMNS =
  "id, name, owner_id, plan, subscription_status, subscription_current_period_end, stripe_customer_id, stripe_subscription_id, commission_percent, stripe_account_id, slug, tagline, created_at";
export const MEMBER_COLUMNS =
  "id, studio_id, profile_id, role, status, invited_email, invite_expires_at, commission_percent, arrangement, rent_cents, rent_interval, rent_subscription_id, rent_status, rent_current_period_end, joined_at, created_at";

const PAID_SOLO_PLANS = ["apprentice", "pro", "master"];
// The plan studio members get while their shop's subscription is live.
const STUDIO_MEMBER_PLAN = "pro";

export const INVITE_TTL_DAYS = 14;

// A studio's plan only covers its team (Pro features, no commission on
// their own clients) once it has at least this many active pros. Otherwise
// a solo pro could open a "studio" of one to pay less than the Pro plan and
// skip commission.
export const STUDIO_MIN_PROS = 2;

// Pros who take clients. A shop owner who only runs the shop doesn't count.
export async function countActivePros(supabase: ServiceClient, studioId: string) {
  const { data } = await supabase
    .from("studio_members")
    .select("*")
    .eq("studio_id", studioId)
    .eq("status", "active");
  return ((data || []) as StudioMemberRow[]).filter(takesClients).length;
}

// Missing column (migration not run yet) counts as taking clients.
export function takesClients(member: Pick<StudioMemberRow, "takes_clients"> | null | undefined) {
  return member?.takes_clients !== false;
}

// The shop's address and trades, or blanks before the shop-accounts migration.
export async function getStudioPlace(supabase: ServiceClient, studioId: string): Promise<StudioPlaceRow> {
  const { data, error } = await supabase
    .from("studios")
    .select("address, place_id, lat, lng, area_label, trades")
    .eq("id", studioId)
    .maybeSingle<StudioPlaceRow>();
  if (error || !data) return { address: null, place_id: null, lat: null, lng: null, area_label: null, trades: [] };
  return { ...data, trades: data.trades || [] };
}

// Live plan AND enough pros for the team benefits to apply.
export async function studioCoversTeam(
  supabase: ServiceClient,
  studio: Pick<StudioRow, "id" | "plan" | "subscription_status">
) {
  if (!isStudioLive(studio)) return false;
  return (await countActivePros(supabase, studio.id)) >= STUDIO_MIN_PROS;
}

export function isLiveStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

export function isStudioLive(studio: Pick<StudioRow, "plan" | "subscription_status"> | null | undefined) {
  return !!studio?.plan && isLiveStatus(studio.subscription_status);
}

// The shop's cut only applies on Studio Plus while it's live.
export function effectiveCutPercent(
  studio: Pick<StudioRow, "plan" | "subscription_status" | "commission_percent">,
  member: Pick<StudioMemberRow, "commission_percent" | "arrangement"> | null
) {
  if (!isStudioLive(studio) || studio.plan !== "studio_plus") return 0;
  // Booth renters pay the shop rent instead of a cut.
  if (member?.arrangement === "booth_rent") return 0;
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
  // select("*") so takes_clients comes along once the migration has run.
  const { data: member } = await supabase
    .from("studio_members")
    .select("*")
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

// Where an appointment happens decides whose work it is. "in_shop" is the
// shop's: the shop's cut applies and it shows on the shop's books. Mobile
// ("at_home") and the pro's own home studio are their independent work.
export function isShopWork(mode: string | null | undefined) {
  return !mode || mode === "in_shop";
}

// What a booking with this pro looks like from the studio's side: whether
// they're in a live studio (no commission on their own clients) and how big
// the shop's cut is. Independent work (see isShopWork) is billed like a solo
// pro's: no shop cut, nothing goes to the shop, and the pro's own plan sets
// LineUp's fee.
export async function getStudioPricingForPro(supabase: ServiceClient, professionalId: string, mode?: string | null) {
  if (!isShopWork(mode)) return { studioId: null, inLiveStudio: false, cutPercent: 0 };
  const membership = await getMembershipForProfile(supabase, professionalId);
  if (!membership) return { studioId: null, inLiveStudio: false, cutPercent: 0 };

  const live = await studioCoversTeam(supabase, membership.studio);
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
  // Best effort: needs 20261105_shop_location.sql.
  await syncMemberLocation(supabase, profileId).catch((error) => console.error("Location sync failed:", error));

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, subscription_plan, subscription_status, plan_source, stripe_subscription_id, subscription_current_period_end")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return;

  const membership = await getMembershipForProfile(supabase, profileId);
  // Only people who take clients get pro features from the studio; an owner
  // who just runs the shop has the Studio page and nothing to "upgrade".
  const bookable =
    !!membership && takesClients(membership.member) && !!profile.role && !["shop", "customer"].includes(profile.role);
  const studioLive = membership && bookable ? await studioCoversTeam(supabase, membership.studio) : false;
  const grantedByStudio = profile.plan_source === "studio";
  const hasOwnLivePlan =
    !grantedByStudio &&
    PAID_SOLO_PLANS.includes(profile.subscription_plan || "") &&
    isLiveStatus(profile.subscription_status);

  const studioId = membership?.studio.id ?? null;

  if (studioLive && hasOwnLivePlan) {
    await stopSoloPlanRenewing(supabase, profile, membership!);
  }

  if (studioLive && !hasOwnLivePlan) {
    // Coming onto the studio's plan turns instant booking and public hours
    // on, same as buying a plan (the subscription trigger does this too; this
    // covers databases without it). Already covered: leave their choice alone.
    const switchingOn = !(grantedByStudio && isLiveStatus(profile.subscription_status));
    await supabase
      .from("profiles")
      .update({
        studio_id: studioId,
        subscription_plan: STUDIO_MEMBER_PLAN,
        subscription_status: "active",
        subscription_current_period_end: membership!.studio.subscription_current_period_end,
        plan_source: "studio",
        ...(switchingOn ? { direct_booking_enabled: true, public_availability_enabled: true } : {}),
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

// A pro paying for Apprentice or Pro whose studio now covers them shouldn't
// pay twice: their own plan stops renewing and they keep it until the end of
// the period they've paid for, then the studio's plan takes over (the
// subscription-deleted webhook re-runs syncMemberPlan). Master is left alone:
// it has perks the studio plan doesn't. Done once per membership, so a pro
// who turns their own plan back on isn't overruled.
async function stopSoloPlanRenewing(
  supabase: ServiceClient,
  profile: { id: string; subscription_plan: string | null; stripe_subscription_id?: string | null; subscription_current_period_end?: string | null },
  membership: { studio: StudioRow; member: StudioMemberRow }
) {
  if (membership.member.solo_plan_handled) return;
  if (profile.subscription_plan === "master") return;

  const { error: markError } = await supabase
    .from("studio_members")
    .update({ solo_plan_handled: true })
    .eq("id", membership.member.id)
    .eq("solo_plan_handled", false);
  if (markError) return; // migration not run yet

  if (!profile.stripe_subscription_id) return;
  try {
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    if (sub.status === "canceled" || sub.cancel_at_period_end) return;
    await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true });
  } catch (error) {
    console.error(`Could not stop solo plan ${profile.stripe_subscription_id} renewing:`, error);
    return;
  }

  const until = profile.subscription_current_period_end
    ? new Date(profile.subscription_current_period_end).toLocaleDateString("en-CA", { month: "long", day: "numeric" })
    : null;
  await supabase.from("notifications").insert({
    user_id: profile.id,
    request_id: null,
    is_read: false,
    type: "studio_plan",
    title: `${membership.studio.name} now covers your Pro features. Your own plan won't renew${until ? ` after ${until}` : ""}, so you won't be charged twice.`,
  });
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

// Stops a pro's booth rent. Immediately when they leave the studio; at the
// end of the paid period when the shop switches them to commission.
export async function cancelRent(
  supabase: ServiceClient,
  member: Pick<StudioMemberRow, "id" | "rent_subscription_id">,
  options: { immediately: boolean }
) {
  if (!member.rent_subscription_id) return;
  try {
    if (options.immediately) {
      await stripe.subscriptions.cancel(member.rent_subscription_id);
    } else {
      await stripe.subscriptions.update(member.rent_subscription_id, { cancel_at_period_end: true });
    }
  } catch (error) {
    console.error(`Could not cancel rent subscription ${member.rent_subscription_id}:`, error);
    return;
  }
  if (options.immediately) {
    await supabase
      .from("studio_members")
      .update({ rent_subscription_id: null, rent_status: "canceled" })
      .eq("id", member.id);
  }
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34)
    .replace(/-+$/g, "");
}

// A free booking-page link for a new studio: its name, or its name plus a
// number when that's taken.
export async function uniqueStudioSlug(supabase: ServiceClient, name: string) {
  let base = slugify(name);
  if (base.length < 3) base = `${base || "studio"}-shop`.replace(/^-/, "");
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase.from("studios").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

// A pro on a shop's team shows the shop's address: on their profile, in
// Browse, and as where in-shop bookings happen. Their own address from before
// is kept privately and put back if they leave (or stop taking clients).
// Needs 20261105_shop_location.sql; before it runs this does nothing.
export async function syncMemberLocation(supabase: ServiceClient, profileId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, formatted_address, location_lat, location_lng, location_place_id, location_source")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !profile) return;

  const membership = await getMembershipForProfile(supabase, profileId);
  const place = membership && takesClients(membership.member) ? await getStudioPlace(supabase, membership.studio.id) : null;
  const shopHasAddress = !!place && place.lat !== null && place.lng !== null && !!place.address;
  const onShop = profile.location_source === "studio";

  if (shopHasAddress) {
    if (!onShop) {
      // Keep what they had, to put back later.
      const { error: saveError } = await supabase.from("professional_home_base").upsert(
        {
          profile_id: profileId,
          own_address: profile.formatted_address,
          own_place_id: profile.location_place_id,
          own_lat: profile.location_lat,
          own_lng: profile.location_lng,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );
      if (saveError) return;
    }
    if (
      onShop &&
      profile.formatted_address === place!.address &&
      profile.location_lat === place!.lat &&
      profile.location_lng === place!.lng
    ) {
      return;
    }
    await supabase
      .from("profiles")
      .update({
        formatted_address: place!.address,
        location_place_id: place!.place_id,
        location_lat: place!.lat,
        location_lng: place!.lng,
        location_source: "studio",
      })
      .eq("id", profileId);
    return;
  }

  if (onShop) {
    const { data: saved } = await supabase
      .from("professional_home_base")
      .select("own_address, own_place_id, own_lat, own_lng")
      .eq("profile_id", profileId)
      .maybeSingle();
    await supabase
      .from("profiles")
      .update({
        formatted_address: saved?.own_address ?? null,
        location_place_id: saved?.own_place_id ?? null,
        location_lat: saved?.own_lat ?? null,
        location_lng: saved?.own_lng ?? null,
        location_source: null,
      })
      .eq("id", profileId);
  }
}
