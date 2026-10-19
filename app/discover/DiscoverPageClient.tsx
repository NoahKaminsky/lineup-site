"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { getCached, setCached } from "@/app/lib/pageCache";
import { getProfileHref } from "@/app/lib/profileLink";
import type { DiscoverCard as InitialDiscoverCard } from "./getInitialData";
import SwipeStack, { type SwipeCardData } from "@/app/components/discover/SwipeStack";
import { BadgeCheck, LayoutGrid, Layers, MapPin, Search, Star, X } from "lucide-react";

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

type ReviewRow = {
  id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type PortfolioItem = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  media_type?: "image" | "video" | null;
  created_at: string;
};

type AvailabilityRow = {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
};

type DiscoverCard = {
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

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Barber", value: "barber" },
  { label: "Hair", value: "hairstylist" },
  { label: "Nails", value: "nail_artist" },
  { label: "Lashes", value: "lash_artist" },
  { label: "Brows", value: "brow_artist" },
  { label: "Makeup", value: "makeup_artist" },
  { label: "Waxing", value: "wax_technician" },
  { label: "Sugaring", value: "body_sugaring" },
] as const;

const serviceModeOptions = [
  { label: "At home", value: "at_home" },
  { label: "In shop", value: "in_shop" },
  { label: "Studio", value: "home_studio" },
] as const;

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim();
}

function isProfessionalRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return !!normalized && !normalized.includes("customer");
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Professional";
  if (value === "nail_tech") return "Nail Artist";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}


function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(distanceKm: number | null) {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return "<1 km away";
  return `${distanceKm.toFixed(1)} km away`;
}

function getBadges(profile: ProfileRow): { label: string; className: string }[] {
  const badges: { label: string; className: string }[] = [];

  if (profile.verification_track === "student") {
    badges.push({ label: "Student", className: "border border-sky-200 bg-sky-100 text-sky-800" });
  }

  if (profile.is_founding_artist) {
    badges.push({ label: "Founding Artist", className: "border border-neutral-300 bg-white text-ink" });
  }

  if (profile.is_featured) {
    badges.push({ label: "LineUp Pick", className: "border border-ink bg-ink text-white" });
  }

  if (profile.subscription_plan === "master") {
    badges.push({ label: "Master", className: "border border-neutral-900 bg-neutral-900 text-white" });
  } else if (profile.subscription_plan === "pro") {
    badges.push({ label: "Pro", className: "border border-neutral-300 bg-white text-neutral-700" });
  }

  return badges;
}

// Cards carry at most one badge on the photo — the one that matters most —
// so the work itself stays the focus. Full badges still show on the profile.
function getPrimaryBadge(profile: ProfileRow): { label: string; tone: "ink" | "light" } | null {
  if (profile.is_featured) return { label: "LineUp Pick", tone: "ink" };
  if (profile.subscription_plan === "master") return { label: "Master", tone: "ink" };
  if (profile.is_founding_artist) return { label: "Founding Artist", tone: "light" };
  if (profile.subscription_plan === "pro") return { label: "Pro", tone: "light" };
  if (profile.verification_track === "student") return { label: "Student", tone: "light" };
  return null;
}

type ProCardProps = {
  href: string;
  name: string;
  role: string;
  place: string | null;
  services: string | null;
  image: string | null;
  badge: { label: string; tone: "ink" | "light" } | null;
  rating: string | null;
  reviewCount: number;
  openThisWeek: boolean;
  verified: boolean;
  size?: "rail" | "grid";
};

// A short, human location for cards: the profile's own location text, or the
// locality part of their formatted address. Never invented.
function getShortLocation(profile: ProfileRow) {
  if (profile.location?.trim()) return profile.location.trim();
  const parts = (profile.formatted_address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  return parts[0] || null;
}

// The single card used everywhere on Browse: the work leads, then a tight,
// three-line typographic summary. No box, no stacked pills.
function ProCard({ href, name, role, place, services, image, badge, rating, reviewCount, openThisWeek, verified, size = "grid" }: ProCardProps) {
  const initial = name.charAt(0).toUpperCase() || "P";
  const ratingText = rating ? `rated ${rating} from ${reviewCount} review${reviewCount === 1 ? "" : "s"}` : "no reviews yet";
  return (
    <Link
      href={href}
      aria-label={`${name}, ${role}${place ? `, ${place}` : ""}, ${ratingText}`}
      className={`group block rounded-2xl outline-offset-4 ${size === "rail" ? "w-[70vw] max-w-[16rem] shrink-0 snap-start" : ""}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#ecebe7]">
        {image ? (
          <img
            loading="lazy"
            src={image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-premium group-hover:scale-[1.035]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <span className="text-6xl font-semibold tracking-[-0.05em] text-neutral-300">{initial}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">{role}</span>
          </div>
        )}

        {/* Hairline inner edge keeps light photos from bleeding into the page. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/[0.06]" />

        {badge ? (
          <span
            className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-semibold tracking-[0.02em] ${
              badge.tone === "ink" ? "bg-ink text-white" : "bg-white/90 text-ink backdrop-blur"
            }`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <div className="mt-3.5 px-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
            <span className="truncate underline-offset-4 decoration-ink/30 group-hover:underline">{name}</span>
            {verified ? (
              <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0 fill-ink text-paper" strokeWidth={2} />
            ) : null}
          </p>
          {rating ? (
            <span className="flex shrink-0 items-center gap-1 text-[13px] tabular-nums text-ink" aria-hidden="true">
              <Star className="h-3 w-3 fill-current" strokeWidth={0} />
              {rating}
              <span className="hidden text-neutral-400 sm:inline">({reviewCount})</span>
            </span>
          ) : (
            <span className="hidden shrink-0 text-[12px] text-neutral-400 sm:inline" aria-hidden="true">New</span>
          )}
        </div>

        <p className="mt-0.5 truncate text-sm text-neutral-600">
          {role}
          {place ? <span className="text-neutral-400"> · {place}</span> : null}
        </p>

        {openThisWeek || services ? (
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
            {openThisWeek ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-ink">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink" />
                Open this week
              </span>
            ) : null}
            {openThisWeek && services ? <span aria-hidden="true" className="text-neutral-300">·</span> : null}
            {services ? <span className="truncate">{services}</span> : null}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function getCardDistanceKm(
  card: DiscoverCard,
  userLocation: { lat: number; lng: number } | null
) {
  if (
    !userLocation ||
    typeof card.profile.location_lat !== "number" ||
    typeof card.profile.location_lng !== "number"
  ) {
    return null;
  }

  return getDistanceKm(
    userLocation.lat,
    userLocation.lng,
    card.profile.location_lat,
    card.profile.location_lng
  );
}

function getProfessionalTypes(profile: ProfileRow) {
  const multi = Array.isArray(profile.professional_types)
    ? profile.professional_types.filter(Boolean)
    : [];

  if (multi.length > 0) return multi;

  return profile.professional_type ? [profile.professional_type] : [];
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

    const matchingWindows = activeAvailability.filter(
      (row) => Number(row.day_of_week) === dayOfWeek
    );

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
        .map((booking) => ({
          start: timeToMinutes(booking.start_time),
          end: timeToMinutes(booking.end_time),
        }))
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
  services: ProfessionalService[];
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

type DiscoverCache = { cards: DiscoverCard[] };

type DiscoverPageClientProps = {
  // Fetched server-side (app/discover/page.tsx + getInitialData.ts). This
  // page is public, so there's no redirect case here — null just means the
  // server fetch failed and the client does its normal cold load instead.
  initialCards: InitialDiscoverCard[] | null;
};

export default function DiscoverPageClient({ initialCards }: DiscoverPageClientProps) {
  const seed = getCached<DiscoverCache>("discover-page")?.cards ?? (initialCards as unknown as DiscoverCard[] | null);

  const [loading, setLoading] = useState(() => !seed);
  const [message, setMessage] = useState("");
  const [cards, setCards] = useState<DiscoverCard[]>(() => seed ?? []);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<(typeof categoryOptions)[number]["value"]>("all");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [openThisWeekOnly, setOpenThisWeekOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"recommended" | "nearest" | "rating">("recommended");
  const [mobileView, setMobileView] = useState<"grid" | "swipe">("grid");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    "idle" | "allowed" | "denied" | "unsupported"
  >("idle");
  // Distance: the panel edits a draft radius; "Show N pros" applies it to
  // the grid as maxDistanceKm (null = any distance).
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(10);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [nearbyPanelOpen, setNearbyPanelOpen] = useState(false);
  const [nearbyAreaLabel, setNearbyAreaLabel] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationPermissionStatus("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setUserLocation({ lat, lng });
        setLocationPermissionStatus("allowed");

        fetch("/api/places/reverse-geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        })
          .then((res) => res.json())
          .then((json) => {
            if (json.label) setNearbyAreaLabel(json.label);
          })
          .catch(() => {});
      },
      (error) => {
        const reason =
          error.code === error.PERMISSION_DENIED
            ? "PERMISSION_DENIED"
            : error.code === error.POSITION_UNAVAILABLE
            ? "POSITION_UNAVAILABLE"
            : error.code === error.TIMEOUT
            ? "TIMEOUT"
            : "UNKNOWN";
        console.error(`Geolocation failed: ${reason} — ${error.message}`);
        setLocationPermissionStatus("denied");
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 1000 * 60 * 10,
      }
    );
  }, []);

  useEffect(() => {
    const silent = !!seed;
    async function loadDiscoverPage() {
      try {
        if (!silent) setLoading(true);
        setMessage("");

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, username, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration, subscription_plan, subscription_status, is_featured, is_founding_artist, verification_status, verification_track, verified_until"
          );

        if (profilesError) {
          setMessage(profilesError.message);
          setLoading(false);
          return;
        }

        // Only credential-verified professionals are listed — anyone unverified,
        // pending, rejected, or past their expiry stays out of Browse.
        const professionals = ((profilesData || []) as ProfileRow[]).filter(
          (profile) => isProfessionalRole(profile.role) && isVerifiedNow(profile)
        );

        const professionalIds = professionals.map((profile) => profile.id);

        if (professionalIds.length === 0) {
          setCards([]);
          setLoading(false);
          return;
        }

        const [servicesResult, reviewsResult, portfolioResult, availabilityResult, bookingsResult] =
          await Promise.all([
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

        servicesData.forEach((service) => {
          if (!servicesByProfessional.has(service.professional_id)) {
            servicesByProfessional.set(service.professional_id, []);
          }
          servicesByProfessional.get(service.professional_id)!.push(service);
        });

        reviewsData.forEach((review) => {
          if (!reviewsByProfessional.has(review.professional_id)) {
            reviewsByProfessional.set(review.professional_id, []);
          }
          reviewsByProfessional.get(review.professional_id)!.push(review);
        });

        portfolioData.forEach((item) => {
          if (!portfolioByProfessional.has(item.user_id)) {
            portfolioByProfessional.set(item.user_id, []);
          }
          portfolioByProfessional.get(item.user_id)!.push(item);
        });

        availabilityData.forEach((row) => {
          if (!availabilityByProfessional.has(row.professional_id)) {
            availabilityByProfessional.set(row.professional_id, []);
          }
          availabilityByProfessional.get(row.professional_id)!.push({
            ...row,
            start_time: String(row.start_time).slice(0, 5),
            end_time: String(row.end_time).slice(0, 5),
          });
        });

        bookingsData.forEach((booking) => {
          if (!bookingsByProfessional.has(booking.professional_id)) {
            bookingsByProfessional.set(booking.professional_id, []);
          }
          bookingsByProfessional.get(booking.professional_id)!.push({
            ...booking,
            start_time: String(booking.start_time).slice(0, 5),
            end_time: String(booking.end_time).slice(0, 5),
          });
        });

        const builtCards: DiscoverCard[] = professionals.map((profile) => {
          const proServices = servicesByProfessional.get(profile.id) || [];
          const proReviews = reviewsByProfessional.get(profile.id) || [];
          const proPortfolio = (portfolioByProfessional.get(profile.id) || []).filter(
            (item) => item.media_type !== "video"
          );
          const proAvailability = availabilityByProfessional.get(profile.id) || [];
          const proBookings = bookingsByProfessional.get(profile.id) || [];

          const averageRatingNumber =
            proReviews.length > 0
              ? proReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
                proReviews.length
              : null;

          const averageRating =
            averageRatingNumber !== null ? averageRatingNumber.toFixed(1) : null;

          const isActive = proBookings.some((b) => b.status === "completed");

          const tagBadges = buildTags({
            profile,
            services: proServices,
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

        setCards(builtCards);
        setCached<DiscoverCache>("discover-page", { cards: builtCards });
        setLoading(false);
      } catch (error) {
        console.error(error);
        setMessage("Something went wrong loading professionals.");
        setLoading(false);
      }
    }

    loadDiscoverPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nearbyCount = useMemo(() => {
    if (!userLocation) return null;

    return cards.filter((card) => {
      const distance = getCardDistanceKm(card, userLocation);
      return distance !== null && distance <= nearbyRadiusKm;
    }).length;
  }, [cards, userLocation, nearbyRadiusKm]);

  const nearbyProfessionals = useMemo(() => {
    if (!userLocation) return [];

    return cards
      .map((card) => ({ card, distance: getCardDistanceKm(card, userLocation) }))
      .filter((entry) => entry.distance !== null && entry.distance <= nearbyRadiusKm)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 6);
  }, [cards, userLocation, nearbyRadiusKm]);

  // Each pro plotted at their real bearing and distance from you, scaled so
  // the edge of the map is the chosen radius.
  const nearbyPoints = useMemo(() => {
    if (!userLocation) return [];
    const kmPerDegLat = 110.57;
    const kmPerDegLng = 111.32 * Math.cos((userLocation.lat * Math.PI) / 180);
    return cards
      .map((card) => {
        const { location_lat: lat, location_lng: lng } = card.profile;
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        const dxKm = (lng - userLocation.lng) * kmPerDegLng;
        const dyKm = (lat - userLocation.lat) * kmPerDegLat;
        const distance = Math.hypot(dxKm, dyKm);
        if (distance > nearbyRadiusKm) return null;
        return {
          card,
          distance,
          x: 100 + (dxKm / nearbyRadiusKm) * 88,
          y: 100 - (dyKm / nearbyRadiusKm) * 88,
        };
      })
      .filter(Boolean) as { card: DiscoverCard; distance: number; x: number; y: number }[];
  }, [cards, userLocation, nearbyRadiusKm]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = cards.filter((card) => {
      const { profile, services, tagBadges } = card;
      const roles = getProfessionalTypes(profile);

      const matchesCategory = selectedCategory === "all" || roles.includes(selectedCategory);

      const plainModes = getPlainServiceModes(profile.service_modes);
      const matchesModes =
        selectedModes.length === 0 || selectedModes.every((mode) => plainModes.includes(mode));

      const searchableText = [
        profile.full_name || "",
        ...roles,
        profile.formatted_address || "",
        profile.location || "",
        profile.bio || "",
        ...(profile.specialties || []),
        ...plainModes,
        ...services.map((service) => service.service_name),
        ...tagBadges,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);
      const matchesOpen = !openThisWeekOnly || hasOpenThisWeek(profile, card.availability, card.bookings);

      // With a distance set, only pros we can place within it.
      const cardDistance = maxDistanceKm === null ? null : getCardDistanceKm(card, userLocation);
      const matchesDistance = maxDistanceKm === null || (cardDistance !== null && cardDistance <= maxDistanceKm);

      return matchesCategory && matchesModes && matchesSearch && matchesOpen && matchesDistance;
    });

    if (!userLocation) return filtered;

    return [...filtered].sort((a, b) => {
      const distanceA = getCardDistanceKm(a, userLocation);
      const distanceB = getCardDistanceKm(b, userLocation);

      if (distanceA === null && distanceB === null) return 0;
      if (distanceA === null) return 1;
      if (distanceB === null) return -1;

      return distanceA - distanceB;
    });
  }, [cards, search, selectedCategory, selectedModes, openThisWeekOnly, userLocation, maxDistanceKm]);

  // Subscription tier is the primary ranking signal everywhere on this page —
  // paying for Master/Pro should reliably outrank free accounts, not just get
  // a small nudge that an unusually active free profile could overtake.
  const tierScore = (card: DiscoverCard) => {
    const isSubscribed =
      card.profile.subscription_status === "active" || card.profile.subscription_status === "trialing";
    if (!isSubscribed) return 0;
    if (card.profile.subscription_plan === "master") return 300;
    if (card.profile.subscription_plan === "pro") return 200;
    if (card.profile.subscription_plan === "apprentice") return 100;
    return 0;
  };

  // Admin-curated override for one-off promotion (launch pushes, VIP signups) —
  // deliberately worth more than any tier/quality score so it always wins.
  const featuredScore = (card: DiscoverCard) => (card.profile.is_featured ? 1000 : 0);

  // Spotlight: featured first, then Master tier, then Pro — sorted within each by score
  const spotlightCards = useMemo(() => {
    const isSubscribed = (card: DiscoverCard) =>
      (card.profile.subscription_plan === "master" || card.profile.subscription_plan === "pro") &&
      (card.profile.subscription_status === "active" || card.profile.subscription_status === "trialing");

    return [...filteredCards]
      .filter((card) => isSubscribed(card) || card.profile.is_featured)
      .sort((a, b) => {
        const score = (card: DiscoverCard) => {
          const ratingScore = card.averageRatingNumber ? card.averageRatingNumber * 8 : 0;
          const reviewScore = Math.min(card.reviewCount, 15);
          const imageScore = card.portfolioPreview?.image_url || card.profile.banner_url ? 5 : 0;
          const activeScore = card.isActive ? 10 : 0;
          return featuredScore(card) + tierScore(card) + ratingScore + reviewScore + imageScore + activeScore;
        };
        return score(b) - score(a);
      });
  }, [filteredCards]);



  // All pros, in the order the visitor picked. "Recommended" keeps the
  // business ranking (featured/tier first, then active, then completeness);
  // "Nearest" and "Top rated" sort purely on real distance / review data.
  const sortedCards = useMemo(() => {
    if (sortBy === "nearest" && userLocation) {
      return [...filteredCards].sort((a, b) => {
        const da = getCardDistanceKm(a, userLocation);
        const db = getCardDistanceKm(b, userLocation);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }
    if (sortBy === "rating") {
      return [...filteredCards].sort(
        (a, b) => (b.averageRatingNumber || 0) - (a.averageRatingNumber || 0) || b.reviewCount - a.reviewCount
      );
    }
    return [...filteredCards].sort((a, b) => {
      const score = (card: DiscoverCard) => {
        const activeScore = card.isActive ? 50 : 0;
        const ratingScore = card.averageRatingNumber ? card.averageRatingNumber * 8 : 0;
        const reviewScore = Math.min(card.reviewCount, 20);
        const imageScore = card.portfolioPreview?.image_url || card.profile.banner_url ? 6 : 0;
        const openScore = hasOpenThisWeek(card.profile, card.availability, card.bookings) ? 4 : 0;
        return featuredScore(card) + tierScore(card) + activeScore + ratingScore + reviewScore + imageScore + openScore;
      };
      return score(b) - score(a);
    });
  }, [filteredCards, sortBy, userLocation]);

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedCategory !== "all" ||
    selectedModes.length > 0 ||
    openThisWeekOnly ||
    maxDistanceKm !== null;

  function clearFilters() {
    setSearch("");
    setSelectedCategory("all");
    setSelectedModes([]);
    setOpenThisWeekOnly(false);
    setMaxDistanceKm(null);
  }

  function toggleMode(mode: string) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  function getCardImage(card: DiscoverCard) {
    return card.portfolioPreview?.image_url || card.profile.banner_url || card.profile.avatar_url || null;
  }

  function getCardProps(card: DiscoverCard): ProCardProps {
    const roles = getProfessionalTypes(card.profile);
    const roleLabel = roles.slice(0, 2).map(formatLabel).join(" & ") || "Professional";
    const serviceNames = Array.from(
      new Set(card.services.filter((service) => service.is_active).map((service) => service.service_name.trim()).filter(Boolean))
    );
    return {
      href: getProfileHref(card.profile),
      name: card.profile.full_name || "Professional",
      role: roleLabel,
      place: formatDistanceLabel(getCardDistanceKm(card, userLocation)) ?? getShortLocation(card.profile),
      services:
        serviceNames.length === 0
          ? null
          : serviceNames.length <= 2
          ? serviceNames.join(", ")
          : `${serviceNames.slice(0, 2).join(", ")} +${serviceNames.length - 2}`,
      image: getCardImage(card),
      badge: getPrimaryBadge(card.profile),
      rating: card.averageRating,
      reviewCount: card.reviewCount,
      openThisWeek: hasOpenThisWeek(card.profile, card.availability, card.bookings),
      verified: isVerifiedNow(card.profile),
    };
  }

  const swipeCards = useMemo<SwipeCardData[]>(() => {
    return sortedCards.map((card) => {
      const roles = getProfessionalTypes(card.profile);
      const primaryRole = roles[0] ? formatLabel(roles[0]) : "Professional";
      const distanceKm = getCardDistanceKm(card, userLocation);

      return {
        key: card.profile.id,
        href: getProfileHref(card.profile),
        image: getCardImage(card),
        name: card.profile.full_name || "Professional",
        primaryRole,
        badges: getBadges(card.profile),
        rating: card.averageRating,
        distanceLabel: formatDistanceLabel(distanceKm),
      };
    });
  }, [sortedCards, userLocation]);

  const sectionLabel = "font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500";

  if (loading) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8" aria-busy="true">
        <div className="mx-auto max-w-6xl py-8">
          <div className="h-3 w-16 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-4 h-9 w-72 animate-pulse rounded-lg bg-neutral-200" />
          <div className="mt-4 h-4 w-full max-w-md animate-pulse rounded-full bg-neutral-200/70" />

          <div className="mt-10 h-12 w-full animate-pulse rounded-full bg-neutral-200/70" />
          <div className="mt-5 flex gap-7 border-b border-hairline pb-3.5">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-4 w-14 shrink-0 animate-pulse rounded-full bg-neutral-200/70" />
            ))}
          </div>

          <div className="mt-12 h-3 w-20 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <div key={item}>
                <div className="aspect-[4/5] animate-pulse rounded-2xl bg-neutral-200/60" />
                <div className="mt-3 h-4 w-2/3 animate-pulse rounded-full bg-neutral-200/70" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-neutral-200/50" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const isSearching = search.trim() !== "";
  const showFeatured =
    spotlightCards.length > 0 && !isSearching && selectedCategory === "all" && !openThisWeekOnly && maxDistanceKm === null;
  const categoryLabel = categoryOptions.find((c) => c.value === selectedCategory)?.label;

  return (
    <>
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl py-6 sm:py-8">
        {/* Intro — compact, so real professionals start above the fold. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={sectionLabel}>Browse</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              Find your professional.
            </h1>
            <p className="mt-2.5 max-w-xl text-base leading-7 text-neutral-600">
              Discover independent beauty and personal-care professionals, see their work, and book directly
              — or post a request and let offers come to you.
            </p>
          </div>

          <Link
            href="/requests/new"
            className="inline-flex w-fit shrink-0 items-center rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Post a request instead
          </Link>
        </div>

        {/* Search + filters. Kept in normal flow on phones — pinning all of this
            would eat a third of a small screen. */}
        <div className="mt-7 sm:mt-8">
          <div className="relative">
            <label htmlFor="browse-search" className="sr-only">
              Search professionals by name, service, or area
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" strokeWidth={2} />
            <input
              id="browse-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && search) {
                  e.preventDefault();
                  setSearch("");
                }
              }}
              placeholder="Search name, service, or area"
              autoComplete="off"
              className="h-14 w-full rounded-full border border-neutral-200 bg-surface pl-[3.25rem] pr-12 text-[15px] outline-none transition-colors placeholder:text-neutral-400 focus:border-ink [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-ink"
              >
                <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : null}
          </div>

          <div
            role="group"
            aria-label="Category"
            className="-mx-4 mt-5 flex gap-6 overflow-x-auto border-b border-hairline px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:gap-7 sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {categoryOptions.map((category) => {
              const selected = selectedCategory === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedCategory(category.value)}
                  className={`relative shrink-0 pb-3.5 pt-1 text-sm transition-colors ${
                    selected ? "font-medium text-ink" : "text-neutral-500 hover:text-ink"
                  }`}
                >
                  {category.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-[1.5px] bg-ink transition-transform duration-300 ease-premium ${
                      selected ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Refinements: where it happens, availability, ordering. */}
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {serviceModeOptions.map((mode) => {
              const selected = selectedModes.includes(mode.value);
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleMode(mode.value)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    selected ? "bg-ink text-white" : "bg-surface text-neutral-700 ring-1 ring-inset ring-ink/10 hover:ring-ink/30"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}

            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-ink/10" />

            <button
              type="button"
              aria-pressed={openThisWeekOnly}
              onClick={() => setOpenThisWeekOnly((prev) => !prev)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                openThisWeekOnly ? "bg-ink text-white" : "bg-surface text-neutral-700 ring-1 ring-inset ring-ink/10 hover:ring-ink/30"
              }`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${openThisWeekOnly ? "bg-white" : "bg-ink"}`} />
              Open this week
            </button>

            <button
              type="button"
              aria-pressed={maxDistanceKm !== null}
              onClick={() => {
                setNearbyRadiusKm(maxDistanceKm ?? nearbyRadiusKm);
                setNearbyPanelOpen(true);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                maxDistanceKm !== null ? "bg-ink text-white" : "bg-surface text-neutral-700 ring-1 ring-inset ring-ink/10 hover:ring-ink/30"
              }`}
            >
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              {maxDistanceKm !== null ? `Within ${maxDistanceKm} km` : "Distance"}
            </button>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 rounded px-2 py-1.5 text-[13px] text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {message ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {sortedCards.length === 0 ? (
          <div className="mt-10 rounded-panel border border-dashed border-neutral-300 px-6 py-16 text-center">
            <p className="font-medium text-ink">
              {isSearching ? `No professionals match “${search.trim()}”` : "No professionals match those filters"}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-neutral-500">
              Try another category or a broader search — or post a request and let nearby professionals send you offers.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
              >
                Clear filters
              </button>
              <Link
                href="/requests/new"
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
              >
                Post a request
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Featured: LineUp Picks first, then Master and Pro members.
                Hidden while searching/filtering so results come first. */}
            {showFeatured ? (
              <section aria-labelledby="featured-heading" className="mt-8">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id="featured-heading" className="text-lg font-semibold tracking-[-0.02em]">
                    Featured on LineUp
                  </h2>
                  <p className="hidden text-xs text-neutral-500 sm:block">Hand-picked and top-tier members</p>
                </div>

                {/* Phones: a swipeable rail. Tablet/desktop: one aligned row on the same
                    grid as the results, so a short list never leaves a ragged gap. */}
                <div className="-mx-4 mt-4 flex snap-x snap-proximity scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
                  {spotlightCards.map((card) => (
                    <ProCard key={`featured-${card.profile.id}`} {...getCardProps(card)} size="rail" />
                  ))}
                </div>
                <div className="mt-5 hidden gap-x-5 gap-y-10 sm:grid sm:grid-cols-3 lg:grid-cols-4">
                  {spotlightCards.slice(0, 4).map((card, index) => (
                    <div key={`featured-grid-${card.profile.id}`} className={index === 3 ? "hidden lg:block" : undefined}>
                      <ProCard {...getCardProps(card)} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-labelledby="all-heading" className={showFeatured ? "mt-12 border-t border-hairline pt-8" : "mt-6"}>
              {/* Results toolbar: count on the left, ordering (and view on phones) on the right. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="all-heading" className="text-lg font-semibold tracking-[-0.02em]" aria-live="polite">
                  {sortedCards.length} {sortedCards.length === 1 ? "professional" : "professionals"}
                  {categoryLabel && selectedCategory !== "all" ? (
                    <span className="text-neutral-400"> · {categoryLabel}</span>
                  ) : null}
                </h2>

                <div className="flex items-center gap-2">
                  <label className="relative flex items-center">
                    <span className="sr-only">Sort professionals</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="h-9 appearance-none rounded-full bg-surface pl-3.5 pr-8 text-[13px] font-medium text-ink outline-none ring-1 ring-inset ring-ink/10 transition-shadow hover:ring-ink/30 focus:ring-ink"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="rating">Top rated</option>
                      <option value="nearest" disabled={!userLocation}>
                        {userLocation ? "Nearest" : "Nearest (allow location)"}
                      </option>
                    </select>
                    <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3 h-3 w-3 text-neutral-500" fill="none">
                      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </label>

                  <div role="group" aria-label="View" className="flex rounded-full bg-surface p-0.5 ring-1 ring-inset ring-ink/10 sm:hidden">
                    {[
                      { value: "grid" as const, label: "Grid view", Icon: LayoutGrid },
                      { value: "swipe" as const, label: "Swipe view", Icon: Layers },
                    ].map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={label}
                        aria-pressed={mobileView === value}
                        onClick={() => setMobileView(value)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                          mobileView === value ? "bg-ink text-white" : "text-neutral-500"
                        }`}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
                {userLocation ? (
                  <>
                    Distances are from your current location.
                    <button
                      type="button"
                      onClick={() => setNearbyPanelOpen(true)}
                      className="inline-flex items-center gap-1 rounded font-medium text-ink underline decoration-ink/20 underline-offset-4 transition-colors hover:decoration-ink"
                    >
                      <MapPin aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                      {nearbyCount === null ? "See who's nearby" : `${nearbyCount} nearby`}
                    </button>
                  </>
                ) : locationPermissionStatus === "unsupported" ? (
                  "Location isn't available in this browser."
                ) : (
                  "Allow location access to see distances and sort by nearest."
                )}
              </p>

              {mobileView === "swipe" ? (
                <div className="mt-6 sm:hidden">
                  <SwipeStack cards={swipeCards} />
                </div>
              ) : null}

              <div
                className={`mt-6 grid-cols-2 gap-x-3 gap-y-8 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4 ${
                  mobileView === "swipe" ? "hidden" : "grid"
                }`}
              >
                {sortedCards.map((card) => (
                  <ProCard key={card.profile.id} {...getCardProps(card)} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>

    {nearbyPanelOpen ? (
      <div
        className="lu-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={() => setNearbyPanelOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="distance-title"
          className="lu-sheet-in max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:p-7"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="distance-title" className="text-xl font-semibold tracking-[-0.03em] text-ink">
                Distance
              </h2>
              <p className="mt-0.5 text-sm text-neutral-500">{nearbyAreaLabel ? `From ${nearbyAreaLabel}` : "From your location"}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setNearbyPanelOpen(false)}
              className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {!userLocation ? (
            <div className="mt-6 rounded-2xl bg-paper p-5 text-sm leading-6 text-neutral-600 ring-1 ring-ink/[0.05]">
              {locationPermissionStatus === "unsupported"
                ? "Location isn't available in this browser, so distances can't be measured."
                : "Allow location access for this site in your browser settings, then reopen Browse to filter by distance."}
            </div>
          ) : (
            <>
              {/* Live map: every pro at their real bearing and distance. */}
              <div className="relative mx-auto mt-5 aspect-square w-full max-w-[19rem]">
                <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
                  <defs>
                    <radialGradient id="lu-radar-bg" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#f1f1ef" />
                    </radialGradient>
                  </defs>
                  <circle cx="100" cy="100" r="88" fill="url(#lu-radar-bg)" stroke="#0a0a0a" strokeOpacity="0.12" />
                  {[0.25, 0.5, 0.75].map((f) => (
                    <circle key={f} cx="100" cy="100" r={88 * f} fill="none" stroke="#0a0a0a" strokeOpacity="0.08" strokeDasharray="2 3" />
                  ))}
                  <line x1="12" y1="100" x2="188" y2="100" stroke="#0a0a0a" strokeOpacity="0.05" />
                  <line x1="100" y1="12" x2="100" y2="188" stroke="#0a0a0a" strokeOpacity="0.05" />
                  {[0.5, 1].map((f) => (
                    <text key={f} x={100 + 88 * f * 0.707 + 3} y={100 - 88 * f * 0.707 - 2} className="fill-neutral-400" style={{ fontSize: 7, fontWeight: 600 }}>
                      {Math.round(nearbyRadiusKm * f * 10) / 10} km
                    </text>
                  ))}
                  <circle cx="100" cy="100" r="12" fill="none" stroke="#0a0a0a" strokeOpacity="0.25">
                    <animate attributeName="r" values="8;16;8" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="100" cy="100" r="5" fill="#0a0a0a" />
                  <circle cx="100" cy="100" r="2" fill="#ffffff" />
                </svg>

                {nearbyPoints.map(({ card, distance, x, y }) => (
                  <Link
                    key={card.profile.id}
                    href={getProfileHref(card.profile)}
                    onClick={() => setNearbyPanelOpen(false)}
                    title={`${card.profile.full_name || "Professional"} · ${formatDistanceLabel(distance)}`}
                    className="lu-lift-in absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.45)] transition-transform hover:z-10 hover:scale-125"
                    style={{ left: `${x / 2}%`, top: `${y / 2}%` }}
                  >
                    {card.profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-neutral-600">
                        {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              <div className="mt-5 text-center">
                <p className="text-4xl font-semibold tabular-nums tracking-[-0.04em] text-ink">{nearbyCount ?? 0}</p>
                <p className="text-sm text-neutral-500">
                  professional{nearbyCount === 1 ? "" : "s"} within{" "}
                  <span className="font-semibold tabular-nums text-ink">{nearbyRadiusKm} km</span>
                </p>
              </div>

              {/* Exact distance, with quick presets. */}
              <div className="mt-5">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={nearbyRadiusKm}
                  onChange={(e) => setNearbyRadiusKm(Number(e.target.value))}
                  aria-label="Maximum distance in kilometres"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-ink"
                  style={{
                    background: `linear-gradient(to right, #0a0a0a ${nearbyRadiusKm}%, #e5e5e5 ${nearbyRadiusKm}%)`,
                  }}
                />
                <div className="mt-3 flex justify-between gap-2">
                  {[5, 10, 25, 50].map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setNearbyRadiusKm(km)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        nearbyRadiusKm === km ? "bg-ink text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>

              {nearbyProfessionals.length > 0 ? (
                <ul className="lu-lineup mt-5 space-y-1 border-t border-ink/[0.06] pt-4">
                  {nearbyProfessionals.map(({ card, distance }) => {
                    const roles = getProfessionalTypes(card.profile);
                    const primaryRole = roles[0] ? formatLabel(roles[0]) : "Professional";
                    return (
                      <li key={card.profile.id}>
                        <Link
                          href={getProfileHref(card.profile)}
                          onClick={() => setNearbyPanelOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-neutral-50"
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                            {card.profile.avatar_url ? (
                              <img loading="lazy" src={card.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-500">
                                {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{card.profile.full_name || "Professional"}</p>
                            <p className="truncate text-xs text-neutral-500">{primaryRole}</p>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatDistanceLabel(distance)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMaxDistanceKm(nearbyRadiusKm);
                    setNearbyPanelOpen(false);
                  }}
                  className="rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Show {nearbyCount ?? 0} pro{nearbyCount === 1 ? "" : "s"} within {nearbyRadiusKm} km
                </button>
                {maxDistanceKm !== null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMaxDistanceKm(null);
                      setNearbyPanelOpen(false);
                    }}
                    className="rounded-full px-5 py-2.5 text-sm font-medium text-neutral-500 transition hover:text-ink"
                  >
                    Any distance
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    ) : null}
    </>
  );
}
