// Server-only initial data for /profile/[id] — see
// app/requests/getInitialData.ts for the pattern. Public page (viewable
// logged out), but also personalizes for the signed-in viewer (whether
// they're a customer, and whether they've booked this professional before),
// which is why it still reads the cookie session.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";
import { BOOKING_WINDOW_DAYS } from "@/app/lib/bookingTime";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Profile = {
  id: string;
  verification_status?: string | null;
  verification_track?: string | null;
  verified_until?: string | null;
  created_at?: string | null;
  full_name: string | null;
  username?: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  role: string | null;
  professional_type: string | null;
  professional_types?: string[] | null;
  location: string | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  bio: string | null;
  instagram_handle: string | null;
  business_name?: string | null;
  service_modes: string | string[] | null;
  specialties: string[] | null;
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  default_appointment_duration: number | null;
};

type PortfolioItem = { id: string; user_id: string; image_url: string; caption: string | null; media_type?: "image" | "video" | null; created_at: string };
type EnrichedReview = { id: string; professional_id: string; reviewer_id: string; rating: number; comment: string | null; created_at: string; reviewer_name: string | null; reviewer_avatar_url: string | null };
type AvailabilityRow = { id: string; professional_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean };
type BookingRow = { id: string; professional_id: string; customer_id: string; booking_date: string; start_time: string; end_time: string; status: string; service_id?: string | null; service_name?: string | null; duration_minutes?: number | null; service_price?: number | null; service_mode?: string | null; source?: string | null; formatted_address?: string | null; location_lat?: number | null; location_lng?: number | null; location_place_id?: string | null };
type ProfessionalService = { id: string; professional_id: string; service_name: string; duration_minutes: number; price: number | null; description: string | null; is_active: boolean; is_bookable: boolean; created_at: string };

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ProfileDetailInitialData = {
  profile: Profile;
  services: ProfessionalService[];
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  portfolioItems: PortfolioItem[];
  reviews: EnrichedReview[];
  viewerUserId: string | null;
  viewerIsCustomer: boolean;
  hasBookedBefore: boolean;
};

export type ProfileDetailInitialResult = { kind: "ok"; data: ProfileDetailInitialData } | { kind: "fallback" };

export async function getInitialProfileDetailData(profileIdOrUsername: string): Promise<ProfileDetailInitialResult> {
  const supabase = await createSupabaseServerClient();

  try {
    const isUuid = UUID_REGEX.test(profileIdOrUsername);
    const profileSelect =
      "id, full_name, username, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, location_place_id, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration, verification_status, verification_track, verified_until, created_at";

    const { data: profileData, error: profileError } = isUuid
      ? await supabase.from("profiles").select(profileSelect).eq("id", profileIdOrUsername).single()
      : await supabase.from("profiles").select(profileSelect).ilike("username", profileIdOrUsername).single();

    if (profileError || !profileData) return { kind: "fallback" };

    const profile = profileData as Profile;
    const resolvedId = profile.id;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + BOOKING_WINDOW_DAYS);
    const todayString = formatDateKey(today);
    const endString = formatDateKey(end);

    // Everything below only depends on resolvedId (or, for the viewer-history
    // checks, on `user`) -- none of these depend on each other's results, so
    // they all run in one batch. The two prior-booking-history queries fire
    // even for a professional viewer (where the result goes unused below,
    // since the original only ran them for a customer viewer) -- cheaper to
    // accept that than to split this into two sequential batches just to
    // skip two queries that cost nothing extra running in parallel anyway.
    const [servicesResult, availabilityResult, bookingsResult, portfolioResult, reviewResult, viewerProfileResult, priorRequestResult, priorBookingResult] =
      await Promise.all([
        supabase
          .from("professional_services")
          .select("id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at")
          .eq("professional_id", resolvedId)
          .eq("is_active", true)
          .eq("is_bookable", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("professional_availability")
          .select("id, professional_id, day_of_week, start_time, end_time, is_active")
          .eq("professional_id", resolvedId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("bookings")
          .select(
            "id, professional_id, customer_id, booking_date, start_time, end_time, status, service_id, service_name, duration_minutes, service_price, service_mode, source, formatted_address, location_lat, location_lng, location_place_id"
          )
          .eq("professional_id", resolvedId)
          .in("status", ["confirmed", "completion_requested", "completed"])
          .gte("booking_date", todayString)
          .lte("booking_date", endString)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("professional_portfolio")
          .select("id, user_id, image_url, caption, media_type, created_at")
          .eq("user_id", resolvedId)
          .order("created_at", { ascending: false }),
        supabase
          .from("professional_reviews")
          .select("id, professional_id, reviewer_id, rating, comment, created_at")
          .eq("professional_id", resolvedId)
          .order("created_at", { ascending: false }),
        user ? supabase.from("profiles").select("role").eq("id", user.id).single() : Promise.resolve({ data: null, error: null }),
        user
          ? supabase
              .from("service_requests")
              .select("id")
              .eq("client_id", user.id)
              .eq("accepted_professional_id", resolvedId)
              .eq("status", "completed")
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        user
          ? supabase
              .from("bookings")
              .select("id")
              .eq("customer_id", user.id)
              .eq("professional_id", resolvedId)
              .eq("status", "completed")
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    const services = (servicesResult.error ? [] : servicesResult.data) as ProfessionalService[];

    const availability = (
      availabilityResult.error ? [] : availabilityResult.data || []
    ).map((row: AvailabilityRow) => ({
      ...row,
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
    }));

    const bookings = (
      bookingsResult.error ? [] : bookingsResult.data || []
    ).map((row: BookingRow) => ({
      ...row,
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
    }));

    const portfolioItems = (portfolioResult.error ? [] : portfolioResult.data) as PortfolioItem[];

    let reviews: EnrichedReview[] = [];
    if (!reviewResult.error && reviewResult.data) {
      const reviewerIds = [...new Set(reviewResult.data.map((r) => r.reviewer_id))];
      let reviewerMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();

      if (reviewerIds.length > 0) {
        const { data: reviewerProfiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", reviewerIds);
        if (reviewerProfiles) {
          reviewerMap = new Map(reviewerProfiles.map((r) => [r.id, { full_name: r.full_name ?? null, avatar_url: r.avatar_url ?? null }]));
        }
      }

      reviews = reviewResult.data.map((review) => {
        const reviewer = reviewerMap.get(review.reviewer_id);
        return { ...review, reviewer_name: reviewer?.full_name ?? null, reviewer_avatar_url: reviewer?.avatar_url ?? null };
      });
    }

    const viewerIsCustomer = user
      ? viewerProfileResult.data?.role === "customer" || viewerProfileResult.data?.role === "I am a customer"
      : false;

    const hasBookedBefore = user && viewerIsCustomer ? !!priorRequestResult.data || !!priorBookingResult.data : false;

    return {
      kind: "ok",
      data: {
        profile,
        services,
        availability,
        bookings,
        portfolioItems,
        reviews,
        viewerUserId: user?.id ?? null,
        viewerIsCustomer,
        hasBookedBefore,
      },
    };
  } catch (error) {
    console.error("getInitialProfileDetailData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}
