// Server-only initial data for /account — see app/requests/getInitialData.ts
// for the pattern. Deliberately leaves out the Stripe account-status refresh
// (refreshStripeAccountStatus) -- that's its own client effect hitting a
// separate API route, not part of the page's own data-fetch chain.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";

type Profile = {
  id: string;
  email: string | null;
  email_request_notifications?: boolean | null;
  email_offer_notifications?: boolean | null;
  full_name: string | null;
  username: string | null;
  role: string | null;
  professional_type: string | null;
  professional_types?: string[] | null;
  location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  business_name?: string | null;
  specialties: string[] | null;
  stripe_account_id?: string | null;
  stripe_onboarding_complete?: boolean | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
};

type PortfolioItem = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  media_type?: "image" | "video" | null;
  created_at: string;
};

type EnrichedReview = {
  id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
};

function isProfessionalRole(role: string | null | undefined) {
  const normalized = role?.toLowerCase().trim() || "";
  return !normalized.includes("customer") && !!normalized;
}

export type AccountInitialData = {
  profile: Profile;
  portfolioItems: PortfolioItem[];
  reviews: EnrichedReview[];
  customerRating: { average: number; count: number } | null;
};

export type AccountInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: AccountInitialData }
  | { kind: "fallback" };

export async function getInitialAccountData(): Promise<AccountInitialResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "redirect", to: "/login" };

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, username, role, professional_type, professional_types, location, avatar_url, banner_url, bio, instagram_handle, business_name, specialties, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, subscription_status, subscription_plan, email_request_notifications, email_offer_notifications"
      )
      .eq("id", user.id)
      .single();

    if (profileError || !profile) return { kind: "fallback" };

    const [portfolioResult, reviewResult] = await Promise.all([
      supabase
        .from("professional_portfolio")
        .select("id, user_id, image_url, caption, media_type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("professional_reviews")
        .select("id, professional_id, reviewer_id, rating, comment, created_at")
        .eq("professional_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const portfolioItems = (portfolioResult.error ? [] : portfolioResult.data) as PortfolioItem[];

    let reviews: EnrichedReview[] = [];
    if (!reviewResult.error && reviewResult.data) {
      const reviewerIds = [...new Set(reviewResult.data.map((r) => r.reviewer_id))];
      let reviewerMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();

      if (reviewerIds.length > 0) {
        const { data: reviewerProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", reviewerIds);

        if (reviewerProfiles) {
          reviewerMap = new Map(
            reviewerProfiles.map((r) => [r.id, { full_name: r.full_name ?? null, avatar_url: r.avatar_url ?? null }])
          );
        }
      }

      reviews = reviewResult.data.map((review) => {
        const reviewer = reviewerMap.get(review.reviewer_id);
        return { ...review, reviewer_name: reviewer?.full_name ?? null, reviewer_avatar_url: reviewer?.avatar_url ?? null };
      });
    }

    const customerRating = !isProfessionalRole(profile.role)
      ? await getCustomerRatingServer(supabase, user.id)
      : null;

    return {
      kind: "ok",
      data: { profile: profile as Profile, portfolioItems, reviews, customerRating },
    };
  } catch (error) {
    console.error("getInitialAccountData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}

// Server-side equivalent of app/lib/customerRatings.ts's getCustomerRatingsMap
// for a single customer -- that helper hardcodes the browser Supabase
// client, so it can't be called directly from a Server Component.
async function getCustomerRatingServer(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  customerId: string
): Promise<{ average: number; count: number } | null> {
  const { data, error } = await supabase.from("customer_reviews").select("rating").eq("customer_id", customerId);
  if (error || !data || data.length === 0) return null;

  const sum = data.reduce((total: number, row: { rating: number }) => total + row.rating, 0);
  return { average: sum / data.length, count: data.length };
}
