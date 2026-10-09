// Server-only initial data for /requests/[id] — see
// app/requests/getInitialData.ts for the pattern. The most sequential of the
// pages converted this session (request → offers → offer enrichment → chat
// all genuinely depend on each other in a chain), so this batches what it
// can at each level rather than one flat Promise.all.
//
// Deliberately NOT replicated here: the client's loadRequestLive() also
// marks unread offers as viewed (an UPDATE, not just a read) as a side
// effect of loading. Doing a write from a Server Component data-fetch is
// avoidable risk (double-invocation in dev, prefetching) for something the
// client's own background refresh already does immediately after hydration
// anyway — so that mutation stays client-only, and the initial unread state
// server-renders correctly either way.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  categories?: string[] | null;
  service_detail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  service_mode: string | null;
  service_modes: string[] | null;
  budget: string | null;
  status: string;
  target_professions: string[] | null;
  accepted_professional_id: string | null;
  created_at: string;
  reference_photos: string[] | null;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  preferred_end_time?: string | null;
  timing_flexibility?: string | null;
  scheduled_date?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
};

type RequestOffer = {
  id: string;
  request_id: string;
  professional_id: string;
  message: string | null;
  proposed_price: string | null;
  status: string;
  created_at: string;
  viewed_by_customer?: boolean | null;
  professional_name: string | null;
  professional_avatar_url: string | null;
  professional_type: string | null;
  professional_formatted_address?: string | null;
  average_rating?: number | null;
  review_count?: number;
  [key: string]: unknown;
};

type RequestOwnerProfile = { full_name: string | null; avatar_url: string | null; role: string | null };
type ExistingReview = { id: string; request_id: string; professional_id: string; reviewer_id: string; rating: number; comment: string | null };
type ChatMessage = { id: string; booking_id: string; sender_id: string; message: string; created_at: string };
type ChatParticipantProfile = { id: string; full_name: string | null; avatar_url: string | null };

export type RequestDetailInitialData = {
  currentUserId: string;
  role: string | null;
  viewerLat: number | null;
  viewerLng: number | null;
  request: ServiceRequest;
  requestOwner: RequestOwnerProfile | null;
  requestOwnerRating: { average: number; count: number } | null;
  offers: RequestOffer[];
  hasSubmittedOffer: boolean;
  unreadOfferIds: string[];
  existingReview: ExistingReview | null;
  chatBookingId: string | null;
  chatMessages: ChatMessage[];
  chatProfiles: Record<string, ChatParticipantProfile>;
};

export type RequestDetailInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: RequestDetailInitialData }
  | { kind: "fallback" };

export async function getInitialRequestDetailData(requestId: string): Promise<RequestDetailInitialResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "redirect", to: "/login" };

  try {
    const [{ data: profile, error: profileError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.from("profiles").select("role, professional_type, location_lat, location_lng").eq("id", user.id).single(),
      supabase.from("service_requests").select("*").eq("id", requestId).single(),
    ]);

    if (profileError || !profile) return { kind: "fallback" };
    if (requestError || !requestData) return { kind: "fallback" };

    const request = requestData as ServiceRequest;
    const normalizedRole = profile.role?.toLowerCase().trim() || "";
    const isCustomer = normalizedRole.includes("customer");
    const isProfessional = !!normalizedRole && !normalizedRole.includes("customer");

    const canAccessChatNow =
      !!request.accepted_professional_id && (user.id === request.client_id || user.id === request.accepted_professional_id);

    const baseOffersQuery = supabase.from("request_offers").select("*").eq("request_id", requestId).order("created_at", { ascending: false });
    const offersQuery = isProfessional ? baseOffersQuery.eq("professional_id", user.id) : baseOffersQuery;

    const [{ data: ownerProfile }, ratingResult, { data: offersData, error: offersError }, bookingResult] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url, role").eq("id", request.client_id).single(),
      isProfessional && request.client_id
        ? supabase.from("customer_reviews").select("rating").eq("customer_id", request.client_id)
        : Promise.resolve({ data: null, error: null }),
      offersQuery,
      canAccessChatNow
        ? supabase.from("bookings").select("id").eq("request_id", requestId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const requestOwner = (ownerProfile as RequestOwnerProfile) ?? null;

    let requestOwnerRating: { average: number; count: number } | null = null;
    if (isProfessional && ratingResult.data && ratingResult.data.length > 0) {
      const sum = ratingResult.data.reduce((total: number, row: { rating: number }) => total + row.rating, 0);
      requestOwnerRating = { average: sum / ratingResult.data.length, count: ratingResult.data.length };
    }

    let offers: RequestOffer[] = [];
    let hasSubmittedOffer = false;
    let unreadOfferIds: string[] = [];

    if (!offersError && offersData) {
      hasSubmittedOffer = offersData.some(
        (offer) => offer.professional_id === user.id && (offer.status === "pending" || offer.status === "accepted") && offer.status !== "withdrawn"
      );

      const professionalIds = [...new Set(offersData.map((o) => o.professional_id))];

      type OfferProfileRow = { id: string; full_name: string | null; avatar_url: string | null; professional_type: string | null; formatted_address: string | null };
      type OfferReviewRow = { professional_id: string; rating: number };

      const [profileResult, reviewsResult] =
        professionalIds.length > 0
          ? await Promise.all([
              supabase.from("profiles").select("id, full_name, avatar_url, professional_type, formatted_address").in("id", professionalIds),
              supabase.from("professional_reviews").select("professional_id, rating").in("professional_id", professionalIds),
            ])
          : [{ data: [] as OfferProfileRow[] }, { data: [] as OfferReviewRow[] }];

      const profilesMap = new Map(
        ((profileResult.data || []) as OfferProfileRow[]).map((p) => [
          p.id,
          { full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null, professional_type: p.professional_type ?? null, formatted_address: p.formatted_address ?? null },
        ])
      );

      const grouped = new Map<string, number[]>();
      (reviewsResult.data || []).forEach((review: { professional_id: string; rating: number }) => {
        const existing = grouped.get(review.professional_id) ?? [];
        existing.push(Number(review.rating));
        grouped.set(review.professional_id, existing);
      });
      const ratingsMap = new Map(
        Array.from(grouped.entries()).map(([id, ratings]) => [
          id,
          { average_rating: ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null, review_count: ratings.length },
        ])
      );

      offers = offersData
        .filter((o) => o.status !== "withdrawn")
        .map((offer) => {
          const pro = profilesMap.get(offer.professional_id);
          const ratingData = ratingsMap.get(offer.professional_id);
          return {
            ...offer,
            professional_name: pro?.full_name ?? null,
            professional_avatar_url: pro?.avatar_url ?? null,
            professional_type: pro?.professional_type ?? null,
            professional_formatted_address: pro?.formatted_address ?? null,
            average_rating: ratingData?.average_rating ?? null,
            review_count: ratingData?.review_count ?? 0,
          };
        });

      if (isCustomer) {
        unreadOfferIds = offersData.filter((o) => !o.viewed_by_customer).map((o) => o.id);
      }
    }

    const acceptedOffer = offers.find((o) => o.status === "accepted");

    const [existingReviewResult, messagesResult] = await Promise.all([
      request.status === "completed" && isCustomer && acceptedOffer
        ? supabase
            .from("professional_reviews")
            .select("id, request_id, professional_id, reviewer_id, rating, comment")
            .eq("request_id", request.id)
            .eq("reviewer_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      bookingResult.data?.id
        ? supabase.from("booking_messages").select("id, booking_id, sender_id, message, created_at").eq("booking_id", bookingResult.data.id).order("created_at", { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const existingReview = (existingReviewResult.data as ExistingReview | null) ?? null;
    const chatBookingId = bookingResult.data?.id ?? null;
    const chatMessages = (messagesResult.data as ChatMessage[] | null) ?? [];

    const chatProfiles: Record<string, ChatParticipantProfile> = {};
    if (chatMessages.length > 0) {
      const senderIds = [...new Set(chatMessages.map((m) => m.sender_id))];
      const { data: senderProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", senderIds);
      (senderProfiles || []).forEach((p) => {
        chatProfiles[p.id] = { id: p.id, full_name: p.full_name ?? null, avatar_url: p.avatar_url ?? null };
      });
    }

    return {
      kind: "ok",
      data: {
        currentUserId: user.id,
        role: profile.role,
        viewerLat: typeof profile.location_lat === "number" ? profile.location_lat : null,
        viewerLng: typeof profile.location_lng === "number" ? profile.location_lng : null,
        request,
        requestOwner,
        requestOwnerRating,
        offers,
        hasSubmittedOffer,
        unreadOfferIds,
        existingReview,
        chatBookingId,
        chatMessages,
        chatProfiles,
      },
    };
  } catch (error) {
    console.error("getInitialRequestDetailData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}
