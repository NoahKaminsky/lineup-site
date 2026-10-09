// Server-only initial data for /discover (Browse) — see
// app/requests/getInitialData.ts for the pattern. This page is public (no
// auth required), so there's no redirect case — only "ok" or "fallback".
//
// Duplicates buildTags() and its helpers from page.tsx rather than sharing
// code with it, same reasoning as elsewhere: a change to one can't silently
// change the other.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";
import { isVerifiedNow } from "@/app/lib/verificationRules";

type ProfileRow = {
  id: string;
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
  bio: string | null;
  instagram_handle: string | null;
  business_name?: string | null;
  service_modes: string[] | string | null;
  specialties: string[] | null;
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  default_appointment_duration: number | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  is_featured: boolean | null;
  verification_status?: string | null;
  verification_track?: string | null;
  verified_until?: string | null;
  is_founding_artist?: boolean | null;
};

type ProfessionalService = {
  id: string;
  professional_id: string;
  service_name: string;
  duration_minutes: number;
  is_active: boolean;
  is_bookable: boolean;
  created_at: string;
};
type ReviewRow = { id: string; professional_id: string; reviewer_id: string; rating: number; comment: string | null; created_at: string };
type PortfolioItem = { id: string; user_id: string; image_url: string; caption: string | null; media_type?: "image" | "video" | null; created_at: string };
type AvailabilityRow = { id: string; professional_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean };
type BookingRow = { id: string; professional_id: string; customer_id: string; booking_date: string; start_time: string; end_time: string; status: string };

export type DiscoverCard = {
  profile: ProfileRow;
  services: ProfessionalService[];
  portfolioPreview: PortfolioItem | null;
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  averageRating: string | null;
  averageRatingNumber: number | null;
  reviewCount: number;
  tagBadges: string[];
  isActive: boolean;
};

function isProfessionalRole(role: string | null | undefined) {
  const normalized = String(role || "").toLowerCase().trim();
  return !!normalized && !normalized.includes("customer");
}

function getPlainServiceModes(value: string[] | string | null) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function hasOpenThisWeek(profile: ProfileRow, availability: AvailabilityRow[], bookings: BookingRow[]) {
  if (!profile.direct_booking_enabled || !profile.public_availability_enabled) return false;

  const activeAvailability = availability.filter((row) => row.is_active);
  if (activeAvailability.length === 0) return false;

  for (let offset = 0; offset < 7; offset += 1) {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    currentDate.setDate(currentDate.getDate() + offset);

    const dateKey = formatDateKey(currentDate);
    const dayOfWeek = currentDate.getDay();

    const matchingWindows = activeAvailability.filter((row) => Number(row.day_of_week) === dayOfWeek);

    for (const window of matchingWindows) {
      const startMinutes = timeToMinutes(window.start_time);
      const endMinutes = timeToMinutes(window.end_time);

      if (endMinutes <= startMinutes || endMinutes - startMinutes < 30) continue;

      const overlappingBookings = bookings.filter(
        (booking) => booking.booking_date === dateKey && booking.status !== "cancelled"
      );

      if (overlappingBookings.length === 0) return true;

      let cursor = startMinutes;
      const sortedBookings = overlappingBookings
        .map((booking) => ({ start: timeToMinutes(booking.start_time), end: timeToMinutes(booking.end_time) }))
        .sort((a, b) => a.start - b.start);

      for (const booking of sortedBookings) {
        if (booking.start - cursor >= 30) return true;
        cursor = Math.max(cursor, booking.end);
      }

      if (endMinutes - cursor >= 30) return true;
    }
  }

  return false;
}

function buildTags(params: {
  profile: ProfileRow;
  reviewCount: number;
  averageRatingNumber: number | null;
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  isActive: boolean;
}) {
  const { profile, reviewCount, averageRatingNumber, availability, bookings, isActive } = params;
  const tags: string[] = [];

  const modes = getPlainServiceModes(profile.service_modes);
  const isOpenThisWeek = hasOpenThisWeek(profile, availability, bookings);

  if (isActive) tags.push("Active");
  if (averageRatingNumber !== null && averageRatingNumber >= 4.5 && reviewCount >= 2) tags.push("Top rated");
  if (isOpenThisWeek) tags.push("Available");
  if (modes.includes("at_home")) tags.push("At home");

  return tags.slice(0, 2);
}

export type DiscoverInitialResult = { kind: "ok"; cards: DiscoverCard[] } | { kind: "fallback" };

export async function getInitialDiscoverData(): Promise<DiscoverInitialResult> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, username, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration, subscription_plan, subscription_status, is_featured, is_founding_artist, verification_status, verification_track, verified_until"
      );

    if (profilesError) throw new Error(profilesError.message);

    const professionals = ((profilesData || []) as ProfileRow[]).filter(
      (profile) => isProfessionalRole(profile.role) && isVerifiedNow(profile)
    );

    if (professionals.length === 0) return { kind: "ok", cards: [] };

    const professionalIds = professionals.map((p) => p.id);

    const [servicesResult, reviewsResult, portfolioResult, availabilityResult, bookingsResult] = await Promise.all([
      supabase
        .from("professional_services")
        .select("id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at")
        .in("professional_id", professionalIds)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("professional_reviews")
        .select("id, professional_id, reviewer_id, rating, comment, created_at")
        .in("professional_id", professionalIds),
      supabase
        .from("professional_portfolio")
        .select("id, user_id, image_url, caption, media_type, created_at")
        .in("user_id", professionalIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("professional_availability")
        .select("id, professional_id, day_of_week, start_time, end_time, is_active")
        .in("professional_id", professionalIds),
      supabase
        .from("bookings")
        .select("id, professional_id, customer_id, booking_date, start_time, end_time, status")
        .in("professional_id", professionalIds)
        .in("status", ["confirmed", "completion_requested", "completed"]),
    ]);

    if (servicesResult.error) throw new Error(servicesResult.error.message);
    if (reviewsResult.error) throw new Error(reviewsResult.error.message);
    if (portfolioResult.error) throw new Error(portfolioResult.error.message);
    if (availabilityResult.error) throw new Error(availabilityResult.error.message);
    if (bookingsResult.error) throw new Error(bookingsResult.error.message);

    const servicesData = (servicesResult.data || []) as ProfessionalService[];
    const reviewsData = (reviewsResult.data || []) as ReviewRow[];
    const portfolioData = (portfolioResult.data || []) as PortfolioItem[];
    const availabilityData = (availabilityResult.data || []) as AvailabilityRow[];
    const bookingsData = (bookingsResult.data || []) as BookingRow[];

    const servicesByProfessional = new Map<string, ProfessionalService[]>();
    const reviewsByProfessional = new Map<string, ReviewRow[]>();
    const portfolioByProfessional = new Map<string, PortfolioItem[]>();
    const availabilityByProfessional = new Map<string, AvailabilityRow[]>();
    const bookingsByProfessional = new Map<string, BookingRow[]>();

    servicesData.forEach((s) => {
      if (!servicesByProfessional.has(s.professional_id)) servicesByProfessional.set(s.professional_id, []);
      servicesByProfessional.get(s.professional_id)!.push(s);
    });
    reviewsData.forEach((r) => {
      if (!reviewsByProfessional.has(r.professional_id)) reviewsByProfessional.set(r.professional_id, []);
      reviewsByProfessional.get(r.professional_id)!.push(r);
    });
    portfolioData.forEach((p) => {
      if (!portfolioByProfessional.has(p.user_id)) portfolioByProfessional.set(p.user_id, []);
      portfolioByProfessional.get(p.user_id)!.push(p);
    });
    availabilityData.forEach((row) => {
      if (!availabilityByProfessional.has(row.professional_id)) availabilityByProfessional.set(row.professional_id, []);
      availabilityByProfessional
        .get(row.professional_id)!
        .push({ ...row, start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time).slice(0, 5) });
    });
    bookingsData.forEach((booking) => {
      if (!bookingsByProfessional.has(booking.professional_id)) bookingsByProfessional.set(booking.professional_id, []);
      bookingsByProfessional
        .get(booking.professional_id)!
        .push({ ...booking, start_time: String(booking.start_time).slice(0, 5), end_time: String(booking.end_time).slice(0, 5) });
    });

    const cards: DiscoverCard[] = professionals.map((profile) => {
      const proServices = servicesByProfessional.get(profile.id) || [];
      const proReviews = reviewsByProfessional.get(profile.id) || [];
      const proPortfolio = (portfolioByProfessional.get(profile.id) || []).filter((item) => item.media_type !== "video");
      const proAvailability = availabilityByProfessional.get(profile.id) || [];
      const proBookings = bookingsByProfessional.get(profile.id) || [];

      const averageRatingNumber =
        proReviews.length > 0
          ? proReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / proReviews.length
          : null;
      const averageRating = averageRatingNumber !== null ? averageRatingNumber.toFixed(1) : null;
      const isActive = proBookings.some((b) => b.status === "completed");

      const tagBadges = buildTags({
        profile,
        reviewCount: proReviews.length,
        averageRatingNumber,
        availability: proAvailability,
        bookings: proBookings,
        isActive,
      });

      return {
        profile,
        services: proServices,
        portfolioPreview: proPortfolio[0] || null,
        availability: proAvailability,
        bookings: proBookings,
        averageRating,
        averageRatingNumber,
        reviewCount: proReviews.length,
        tagBadges,
        isActive,
      };
    });

    return { kind: "ok", cards };
  } catch (error) {
    console.error("getInitialDiscoverData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}
