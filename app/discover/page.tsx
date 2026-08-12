"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";
import { getProfileHref } from "@/app/lib/profileLink";
import SwipeStack, { type SwipeCardData } from "@/app/components/discover/SwipeStack";

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

  if (profile.is_founding_artist) {
    badges.push({ label: "🔥 Founding Artist", className: "border border-orange-200 bg-orange-100 text-orange-800" });
  }

  if (profile.is_featured) {
    badges.push({ label: "🔥 LineUp Pick", className: "border border-rose-200 bg-rose-100 text-rose-800" });
  }

  if (profile.subscription_plan === "master") {
    badges.push({ label: "Master", className: "border border-neutral-900 bg-neutral-900 text-white" });
  } else if (profile.subscription_plan === "pro") {
    badges.push({ label: "Pro", className: "border border-neutral-300 bg-white text-neutral-700" });
  }

  return badges;
}

const SERVICE_ACTION_LABELS: Record<string, string> = {
  barber: "Haircut",
  hairstylist: "Hairstyle",
  nail_artist: "Manicure",
  lash_artist: "Lash Set",
  brow_artist: "Brow Service",
  makeup_artist: "Makeup Look",
  wax_technician: "Wax",
  body_sugaring: "Sugaring",
};

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getSpotlightSlogan(card: DiscoverCard) {
  const primaryType = getProfessionalTypes(card.profile)[0] || null;
  const actionLabel = SERVICE_ACTION_LABELS[primaryType || ""] || "Service";
  const ratingPhrase = card.averageRating ? `${card.averageRating}★ rated` : "top-rated";

  const templates = [
    `Get a ${actionLabel} done with this ${ratingPhrase} pro`,
    `Book a ${actionLabel} with a ${ratingPhrase} favorite`,
    `Treat yourself to a ${actionLabel} — ${ratingPhrase} and ready to book`,
  ];

  return templates[hashString(card.profile.id) % templates.length];
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

export default function DiscoverPage() {
  const [loading, setLoading] = useState(() => !getCached<DiscoverCache>("discover-page"));
  const [message, setMessage] = useState("");
  const [cards, setCards] = useState<DiscoverCard[]>(() => getCached<DiscoverCache>("discover-page")?.cards ?? []);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<(typeof categoryOptions)[number]["value"]>("all");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    "idle" | "allowed" | "denied" | "unsupported"
  >("idle");
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(5);
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
    const silent = !!getCached<DiscoverCache>("discover-page");
    async function loadDiscoverPage() {
      try {
        if (!silent) setLoading(true);
        setMessage("");

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, username, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration, subscription_plan, subscription_status, is_featured, is_founding_artist"
          );

        if (profilesError) {
          setMessage(profilesError.message);
          setLoading(false);
          return;
        }

        const professionals = ((profilesData || []) as ProfileRow[]).filter((profile) =>
          isProfessionalRole(profile.role)
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

  // Decorative only — abstracted positions, not real coordinates. Just gives a sense
  // of "activity in the area" at a glance before scrolling the real list below.
  const nearbyDots = useMemo(() => {
    const count = Math.min(nearbyCount ?? 0, 10);
    const dots: { x: number; y: number; size: number }[] = [];

    for (let i = 0; i < count; i++) {
      const seed = i * 137.51; // golden-angle spread so dots don't cluster
      const angle = (seed % 360) * (Math.PI / 180);
      const radiusFraction = 0.35 + ((i * 0.61) % 1) * 0.55;
      const r = radiusFraction * 70;
      dots.push({
        x: 80 + r * Math.cos(angle),
        y: 80 + r * Math.sin(angle),
        size: 3 + (i % 3),
      });
    }

    return dots;
  }, [nearbyCount]);

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

      return matchesCategory && matchesModes && matchesSearch;
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
  }, [cards, search, selectedCategory, selectedModes, userLocation]);

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

  // Admin-curated picks get their own dedicated lane, separate from the tier-based
  // Spotlight section below, so a hand-picked promotion doesn't just blend into the
  // usual Master/Pro sort order.
  const pickedCards = useMemo(() => {
    return [...filteredCards]
      .filter((card) => card.profile.is_featured)
      .sort((a, b) => (b.averageRatingNumber || 0) - (a.averageRatingNumber || 0));
  }, [filteredCards]);


  // All pros sorted: featured/tier first, then active, then by completeness
  const sortedCards = useMemo(() => {
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
  }, [filteredCards]);

  function toggleMode(mode: string) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  function getCardImage(card: DiscoverCard) {
    return card.portfolioPreview?.image_url || card.profile.banner_url || null;
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

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


        <div className="mx-auto max-w-6xl py-8">
          <div className="max-w-3xl">
            <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-neutral-200 md:h-16" />
            <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded-full bg-neutral-100" />
            <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="h-12 w-full animate-pulse rounded-full bg-neutral-100" />

            <div className="mt-3 flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div
                  key={item}
                  className="h-10 w-24 shrink-0 animate-pulse rounded-full bg-neutral-100"
                />
              ))}
            </div>

            <div className="mt-3 flex gap-2 overflow-hidden">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-neutral-100"
                />
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="h-4 w-24 animate-pulse rounded-full bg-neutral-200" />
                <div className="mt-3 h-7 w-48 animate-pulse rounded-xl bg-neutral-200" />
              </div>
              <div className="h-4 w-12 animate-pulse rounded-full bg-neutral-100" />
            </div>

            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-72 w-52 shrink-0 animate-pulse rounded-[1.75rem] bg-neutral-100"
                />
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <div
                key={item}
                className="overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-sm"
              >
                <div className="aspect-[4/5] animate-pulse bg-neutral-100" />

                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="h-4 w-24 animate-pulse rounded-full bg-neutral-200" />
                    <div className="h-4 w-10 animate-pulse rounded-full bg-neutral-100" />
                  </div>

                  <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-white text-neutral-900">


      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
              Browse
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
              Explore services
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
              Browse top professionals, portfolio work, and bookable services in one place.
            </p>
          </div>

          <Link
            href="/requests/new"
            className="inline-flex w-fit rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Post a request
          </Link>
        </div>

        <div className="sticky top-0 z-20 -mx-4 mt-5 border-y border-neutral-100 bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pros, lashes, brows, nails..."
              className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
            />

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categoryOptions.map((category) => {
                const selected = selectedCategory === category.value;

                return (
                  <button
                    key={category.value}
                    type="button"
                    onClick={() => setSelectedCategory(category.value)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {serviceModeOptions.map((mode) => {
                const selected = selectedModes.includes(mode.value);

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => toggleMode(mode.value)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-xs text-neutral-500">
                {userLocation
                  ? "Sorted by distance from you."
                  : locationPermissionStatus === "denied"
                  ? "Allow location access to sort nearby professionals first."
                  : locationPermissionStatus === "unsupported"
                  ? "Location sorting is not supported in this browser."
                  : "Allow location access to see nearby professionals first."}
              </p>

              {userLocation ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNearbyPanelOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path d="M10 18s6-5.2 6-10A6 6 0 0 0 4 8c0 4.8 6 10 6 10Z" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    {nearbyCount === null ? "Nearby" : `${nearbyCount} nearby`}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {sortedCards.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-500">No professionals matched those filters.</p>
            <button
              type="button"
              onClick={() => { setSearch(""); setSelectedCategory("all"); setSelectedModes([]); }}
              className="mt-4 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* LineUp Picks — admin hand-picked professionals, kept separate from the tier-based Spotlight */}
            {pickedCards.length > 0 ? (
              <section className="mt-8">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
                    Hand-picked
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    🔥 LineUp Picks
                  </h2>
                </div>

                <div className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
                  {pickedCards.map((card) => {
                    const image = getCardImage(card);
                    const slogan = getSpotlightSlogan(card);

                    return (
                      <Link
                        key={`picked-${card.profile.id}`}
                        href={getProfileHref(card.profile)}
                        className="group flex w-64 shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-rose-200 bg-gradient-to-b from-rose-50 to-white shadow-sm transition hover:border-rose-300 hover:shadow-md sm:w-72"
                      >
                        <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                          {image ? (
                            <img
                              src={image}
                              alt={card.profile.full_name || "Professional"}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-rose-50 to-rose-100">
                              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-rose-200 bg-white text-3xl font-semibold text-rose-400">
                                {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                              </div>
                            </div>
                          )}

                          <div className="absolute left-2.5 top-2.5">
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-800 shadow-sm">
                              🔥 LineUp Pick
                            </span>
                          </div>

                          {card.averageRating ? (
                            <div className="absolute right-2.5 top-2.5">
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-900 shadow-sm">
                                ★ {card.averageRating}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                          <p className="truncate text-sm font-semibold leading-tight text-neutral-900">
                            {card.profile.full_name || "Professional"}
                          </p>
                          <p className="text-xs leading-5 text-rose-700">
                            {slogan}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Spotlight — subscribed professionals (Master first, then Pro) */}
            {spotlightCards.length > 0 ? (
              <section className="mt-8">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      Spotlight
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">
                      Top-rated professionals
                    </h2>
                  </div>
                </div>

                <div className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
                  {spotlightCards.map((card) => {
                    const image = getCardImage(card);
                    const roles = getProfessionalTypes(card.profile);
                    const badges = getBadges(card.profile);
                    const distanceLabel = formatDistanceLabel(getCardDistanceKm(card, userLocation));

                    return (
                      <Link
                        key={`spotlight-${card.profile.id}`}
                        href={getProfileHref(card.profile)}
                        className="group flex w-52 shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 hover:shadow-md sm:w-64"
                      >
                        <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                          {image ? (
                            <img
                              src={image}
                              alt={card.profile.full_name || "Professional"}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-neutral-50 to-neutral-100">
                              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-neutral-200 bg-white text-3xl font-semibold text-neutral-400">
                                {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                              </div>
                            </div>
                          )}

                          {badges.length > 0 ? (
                            <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                              {badges.map((badge) => (
                                <span key={badge.label} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${badge.className}`}>
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {card.averageRating ? (
                            <div className="absolute right-2.5 top-2.5">
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-900 shadow-sm">
                                ★ {card.averageRating}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-2 p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                              {card.profile.avatar_url ? (
                                <img src={card.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-400">
                                  {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold leading-tight text-neutral-900">
                                {card.profile.full_name || "Professional"}
                              </p>
                              <p className="truncate text-xs text-neutral-500">
                                {card.profile.business_name?.trim()
                                  ? `${card.profile.business_name} · ${roles.map(formatLabel).join(" · ")}`
                                  : roles.map(formatLabel).join(" · ")}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                            {card.isActive ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            ) : null}
                            {distanceLabel ? <span className="truncate">{distanceLabel}</span> : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* All professionals */}
            <section className="mt-8">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Explore
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {sortedCards.length} professional{sortedCards.length === 1 ? "" : "s"}
                  </h2>
                </div>
              </div>

              <div className="sm:hidden">
                <SwipeStack cards={swipeCards} />
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-4">
                {sortedCards.map((card) => {
                  const image = getCardImage(card);
                  const roles = getProfessionalTypes(card.profile);
                  const primaryRole = roles[0] ? formatLabel(roles[0]) : "Professional";
                  const badges = getBadges(card.profile);
                  const distanceKm = getCardDistanceKm(card, userLocation);
                  const distanceLabel = formatDistanceLabel(distanceKm);
                  const secondaryTags = card.tagBadges.filter((tag) => tag !== "Active").slice(0, 1);

                  return (
                    <Link
                      key={card.profile.id}
                      href={getProfileHref(card.profile)}
                      className="group flex flex-col overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 hover:shadow-md active:scale-[0.98]"
                    >
                      {/* image */}
                      <div className="relative aspect-square overflow-hidden bg-neutral-100 sm:aspect-[4/5]">
                        {image ? (
                          <img
                            src={image}
                            alt={card.profile.full_name || "Professional"}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-neutral-50 to-neutral-100">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-white text-lg font-semibold text-neutral-400">
                              {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                            </div>
                          </div>
                        )}

                        {badges.length > 0 ? (
                          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                            {badges.map((badge) => (
                              <span key={badge.label} className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold shadow-sm ${badge.className}`}>
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {card.averageRating ? (
                          <span className="absolute right-2 top-2 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-900 shadow-sm">
                            ★ {card.averageRating}
                          </span>
                        ) : null}
                      </div>

                      {/* info */}
                      <div className="flex flex-1 flex-col gap-1 p-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                            {card.profile.avatar_url ? (
                              <img src={card.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[8px] font-bold text-neutral-400">
                                {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                              </div>
                            )}
                          </div>
                          <p className="truncate text-[12px] font-semibold leading-tight text-neutral-900">
                            {card.profile.full_name || "Professional"}
                          </p>
                        </div>
                        <p className="truncate text-[11px] text-neutral-500">
                          {card.profile.business_name?.trim() || primaryRole}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-neutral-400">
                          {card.isActive ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : null}
                          {distanceLabel ? <span className="truncate">{distanceLabel}</span> : null}
                          {!distanceLabel && secondaryTags.length > 0 ? (
                            <span className="truncate">{secondaryTags[0]}</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>

    {nearbyPanelOpen ? (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onClick={() => setNearbyPanelOpen(false)}
      >
        <div
          className="w-full max-w-sm rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              Professionals near you
            </p>
            <button
              type="button"
              onClick={() => setNearbyPanelOpen(false)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              Close
            </button>
          </div>

          {nearbyAreaLabel ? (
            <p className="text-center text-xs font-medium text-neutral-500">{nearbyAreaLabel}</p>
          ) : null}

          <div className="mx-auto mt-2 flex items-center justify-center">
            <svg viewBox="0 0 160 160" className="h-48 w-48">
              <defs>
                <radialGradient id="lu-map-bg" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fafafa" />
                  <stop offset="100%" stopColor="#eeeeee" />
                </radialGradient>
              </defs>

              <circle cx="80" cy="80" r="70" fill="url(#lu-map-bg)" />

              {[5, 10, 25, 50].map((km, i) => {
                const tierRadius = [20, 36, 52, 70][i];
                const isActive = nearbyRadiusKm === km;
                return (
                  <circle
                    key={km}
                    cx="80"
                    cy="80"
                    r={tierRadius}
                    fill={isActive ? "#000000" : "none"}
                    fillOpacity={isActive ? 0.05 : 0}
                    stroke={isActive ? "#000000" : "#d4d4d4"}
                    strokeWidth={isActive ? 1.4 : 1}
                    strokeDasharray={isActive ? undefined : "2 3"}
                    style={{ transition: "r 0.35s cubic-bezier(0.4,0,0.2,1), fill-opacity 0.35s ease, stroke 0.35s ease" }}
                  />
                );
              })}

              <text x="80" y="13" textAnchor="middle" className="fill-neutral-500" style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>
                {nearbyRadiusKm} KM
              </text>

              {nearbyDots.map((dot, i) => (
                <circle
                  key={i}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.size}
                  fill="#111111"
                  opacity={0.55}
                />
              ))}

              <circle cx="80" cy="80" r="11" fill="none" stroke="#000000" strokeWidth="1" opacity="0.25">
                <animate attributeName="r" values="9;15;9" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="80" cy="80" r="6" fill="#000000" />
              <circle cx="80" cy="80" r="2.5" fill="#ffffff" />
              <text x="80" y="98" textAnchor="middle" className="fill-neutral-900" style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.3 }}>
                YOU
              </text>
            </svg>
          </div>

          <p className="mt-1 text-center text-3xl font-semibold tracking-tight text-neutral-900">
            {nearbyCount ?? "—"}
          </p>
          <p className="text-center text-xs text-neutral-500">
            professional{nearbyCount === 1 ? "" : "s"} within {nearbyRadiusKm} km
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[5, 10, 25, 50].map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setNearbyRadiusKm(km)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  nearbyRadiusKm === km
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-400"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>

          {nearbyProfessionals.length > 0 ? (
            <div className="mt-5 max-h-56 space-y-1.5 overflow-y-auto border-t border-neutral-100 pt-4">
              {nearbyProfessionals.map(({ card, distance }) => {
                const roles = getProfessionalTypes(card.profile);
                const primaryRole = roles[0] ? formatLabel(roles[0]) : "Professional";

                return (
                  <Link
                    key={card.profile.id}
                    href={getProfileHref(card.profile)}
                    onClick={() => setNearbyPanelOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-neutral-50"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                      {card.profile.avatar_url ? (
                        <img src={card.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-500">
                          {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {card.profile.full_name || "Professional"}
                      </p>
                      <p className="truncate text-xs text-neutral-500">{primaryRole}</p>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">
                      {formatDistanceLabel(distance)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <p className="mt-4 text-center text-[11px] leading-4 text-neutral-400">
            This is a quick snapshot of who's nearby — full details show once you open a profile.
          </p>
        </div>
      </div>
    ) : null}
    </>
  );
}
