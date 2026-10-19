"use client";

import Link from "next/link";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  MapPin,
  Sparkles,
  ChevronRight,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import PaymentModal from "@/app/components/payments/PaymentModal";
import { getCached, setCached } from "@/app/lib/pageCache";
import DayZoomArea from "@/app/components/DayZoom";
import type { ProfileDetailInitialData } from "./getInitialData";
import { BookedSheet, MaskLine, MomentOverlay } from "@/app/components/moments/Moments";
import { formatCancellationDeadline } from "@/app/lib/bookingTime";
import { useHashTarget } from "@/app/lib/useHashTarget";
import { loginHref, rememberReturnTo } from "@/app/lib/returnTo";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Profile = {
  id: string;
  verification_status?: string | null;
  verification_track?: string | null;
  verified_until?: string | null;
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

type PortfolioItem = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  media_type?: "image" | "video" | null;
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

type EnrichedReview = ReviewRow & {
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
};

type AvailabilityRow = {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "completion_requested"
  | "completed";

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  service_id?: string | null;
  service_name?: string | null;
  duration_minutes?: number | null;
  service_price?: number | null;
  service_mode?: string | null;
  source?: string | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
};

type ProfessionalService = {
  id: string;
  professional_id: string;
  service_name: string;
  duration_minutes: number;
  price: number | null;
  description: string | null;
  is_active: boolean;
  is_bookable: boolean;
  created_at: string;
};

type GeneratedSlot = {
  key: string;
  date: string;
  dayLabel: string;
  dateLabel: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
};

type PendingBookingChoice = {
  service: ProfessionalService;
  slot: GeneratedSlot;
  mode: string;
  address: string | null;
};

const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Suggestion = {
  placeId: string;
  text: string;
};

type SelectedLocation = {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  name?: string | null;
};

function LocationAutocomplete({
  label = "Location",
  placeholder = "Start typing an address...",
  value = "",
  onSelect,
  onInputChange,
}: {
  label?: string;
  placeholder?: string;
  value?: string;
  onSelect: (location: SelectedLocation) => void;
  onInputChange?: (value: string) => void;
}) {
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!input || input.length < 2) {
        setSuggestions([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });

        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [input]);

  async function handleSelect(suggestion: Suggestion) {
    setInput(suggestion.text);
    setSuggestions([]);

    const res = await fetch("/api/places/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: suggestion.placeId }),
    });

    const data = await res.json();

    onSelect({
      placeId: data.placeId,
      formattedAddress: data.formattedAddress,
      lat: data.lat,
      lng: data.lng,
      name: data.name,
    });
  }

  return (
    <div className="relative w-full">
      <label className="mb-2 block text-sm font-medium text-neutral-900">
        {label}
      </label>

      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm outline-none transition focus:border-neutral-900"
      />

      {loading ? <p className="mt-2 text-xs text-neutral-500">Searching...</p> : null}

      {suggestions.length > 0 ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="block w-full px-4 py-3 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              {suggestion.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getDistanceKm(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null
) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

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

function formatDistance(km: number | null) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return "<1 km away";
  return `${km.toFixed(1)} km away`;
}

function formatDisplayAddress(address: string | null | undefined) {
  if (!address?.trim()) return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return parts.slice(0, 2).join(", ");
  return address;
}


function getPlainServiceModes(value: string | string[] | null | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

// Booking-flow wording: says where the appointment physically happens.
function formatModeLabel(mode: string) {
  if (mode === "in_shop") return "At their shop";
  if (mode === "home_studio") return "At their home studio";
  if (mode === "at_home") return "At your place";
  return mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return null;

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

// One editorial section: a hairline on top, the heading in a narrow left
// column on desktop (or above the content when `wide`), content on the right.
function ProfileSection({
  id,
  title,
  subtitle,
  summary,
  wide = false,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  summary?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const heading = (
    <div className="min-w-0">
      {subtitle ? <p className="text-xs font-medium text-neutral-500">{subtitle}</p> : null}
      <h2 className="mt-1.5 text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[2rem]">
        {title}
      </h2>
      {summary ? <p className="mt-2 text-sm leading-6 text-neutral-500">{summary}</p> : null}
    </div>
  );

  return (
    <section
      id={id}
      data-profile-section=""
      className="scroll-mt-[var(--profile-offset,8rem)] border-t border-ink/[0.08] py-10 md:py-14"
    >
      {wide ? (
        <>
          {heading}
          <div className="mt-8">{children}</div>
        </>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-14">
          {heading}
          <div className="min-w-0">{children}</div>
        </div>
      )}
    </section>
  );
}

function getGoogleMapsUrl(lat?: number | null, lng?: number | null, address?: string | null) {
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return null;
}

type ProfileDetailCache = {
  profile: Profile;
  services: ProfessionalService[];
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  portfolioItems: PortfolioItem[];
  reviews: EnrichedReview[];
};

type ProfilePageClientProps = {
  // Fetched server-side (page.tsx + getInitialData.ts) for whichever
  // [id]/username the request landed on. null means either the server fetch
  // failed, or — on a client-side Link navigation to a *different* profile
  // (same route, new [id]) — this is simply a profile the server hasn't
  // fetched for us; the client load below handles that exactly as it always
  // did.
  initialData: ProfileDetailInitialData | null;
};

export default function ProfessionalProfilePage({ initialData }: ProfilePageClientProps) {
  const params = useParams();
  const profileId = params.id as string;
  const cacheKey = `profile-detail-${profileId}`;
  const cached = getCached<ProfileDetailCache>(cacheKey);
  // initialData is only valid for the [id] this page actually rendered with
  // server-side — on the very first client render after a full page load
  // that's always the current profileId, so this is safe without comparing
  // ids explicitly.
  const seed: ProfileDetailCache | null = cached ?? (initialData as unknown as ProfileDetailCache | null);

  const [loading, setLoading] = useState(() => !seed);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(() => seed?.profile ?? null);
  // Shared booking links end in #availability: land on the calendar once the
  // profile has loaded.
  useHashTarget(!loading && !!profile);

  // Page chrome that follows the scroll: the sticky section bar sits under the
  // app header (whose height changes by breakpoint), tracks the section in
  // view, and the mobile book bar shows once the hero buttons scroll away.
  const heroEndRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(64);
  const [activeSection, setActiveSection] = useState("");
  const [pastHero, setPastHero] = useState(false);
  const [calendarInView, setCalendarInView] = useState(false);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setHeaderHeight(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (loading) return;
    const onScroll = () => {
      const line = headerHeight + 120;
      const heroEnd = heroEndRef.current?.getBoundingClientRect().top ?? Infinity;
      setPastHero(heroEnd < headerHeight);

      let current = "";
      document.querySelectorAll<HTMLElement>("[data-profile-section]").forEach((el) => {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      });
      setActiveSection(current);

      const calendar = document.getElementById("availability")?.getBoundingClientRect();
      setCalendarInView(!!calendar && calendar.top < window.innerHeight * 0.75 && calendar.bottom > window.innerHeight * 0.25);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [loading, headerHeight]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(() => seed?.portfolioItems ?? []);
  const [reviews, setReviews] = useState<EnrichedReview[]>(() => seed?.reviews ?? []);
  const [availability, setAvailability] = useState<AvailabilityRow[]>(() => seed?.availability ?? []);
  const [bookings, setBookings] = useState<BookingRow[]>(() => seed?.bookings ?? []);
  const [services, setServices] = useState<ProfessionalService[]>(() => seed?.services ?? []);
  const [showBannerPreview, setShowBannerPreview] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(() => initialData?.viewerUserId ?? null);
  const [viewerIsCustomer, setViewerIsCustomer] = useState(() => initialData?.viewerIsCustomer ?? false);
  // Signed-out visitor picked a time and service: ask them to sign in, then
  // bring them straight back to this calendar.
  const [authPromptService, setAuthPromptService] = useState<string | null>(null);
  const [hasBookedBefore, setHasBookedBefore] = useState(() => initialData?.hasBookedBefore ?? false);

  const [selectedSlot, setSelectedSlot] = useState<GeneratedSlot | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedServiceMode, setSelectedServiceMode] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [bookingSlotKey, setBookingSlotKey] = useState<string | null>(null);
  const [pendingBookingChoice, setPendingBookingChoice] = useState<PendingBookingChoice | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRow | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  const dateScrollerRef = useRef<HTMLDivElement | null>(null);
  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    async function loadProfilePage(silent: boolean) {
      try {
        if (!silent) setLoading(true);
        setMessage("");

        const isUuid = UUID_REGEX.test(profileId);
        const profileSelect =
          "id, full_name, username, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, location_place_id, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration, verification_status, verification_track, verified_until";

        const { data: profileData, error: profileError } = isUuid
          ? await supabase.from("profiles").select(profileSelect).eq("id", profileId).single()
          : await supabase.from("profiles").select(profileSelect).ilike("username", profileId).single();

        if (profileError || !profileData) {
          setMessage(profileError?.message || "Profile not found.");
          setLoading(false);
          return;
        }

        const resolvedId = profileData.id;

        setProfile(profileData as Profile);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setViewerUserId(user.id);

          const { data: viewerProfile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

          const isCustomer =
            viewerProfile?.role === "customer" ||
            viewerProfile?.role === "I am a customer";

          setViewerIsCustomer(isCustomer);

          if (isCustomer) {
            const { data: priorCompletedRequest } = await supabase
              .from("service_requests")
              .select("id")
              .eq("client_id", user.id)
              .eq("accepted_professional_id", resolvedId)
              .eq("status", "completed")
              .limit(1)
              .maybeSingle();

            const { data: priorCompletedBooking } = await supabase
              .from("bookings")
              .select("id")
              .eq("customer_id", user.id)
              .eq("professional_id", resolvedId)
              .eq("status", "completed")
              .limit(1)
              .maybeSingle();

            setHasBookedBefore(!!priorCompletedRequest || !!priorCompletedBooking);
          } else {
            setHasBookedBefore(false);
          }
        } else {
          setViewerUserId(null);
          setViewerIsCustomer(false);
          setHasBookedBefore(false);
        }

        const { data: servicesData, error: servicesError } = await supabase
          .from("professional_services")
          .select(
            "id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at"
          )
          .eq("professional_id", resolvedId)
          .eq("is_active", true)
          .eq("is_bookable", true)
          .order("created_at", { ascending: true });

        const resolvedServices =
          !servicesError && servicesData ? (servicesData as ProfessionalService[]) : [];
        setServices(resolvedServices);

        const { data: availabilityData, error: availabilityError } = await supabase
          .from("professional_availability")
          .select("id, professional_id, day_of_week, start_time, end_time, is_active")
          .eq("professional_id", resolvedId)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true });

        const resolvedAvailability =
          !availabilityError && availabilityData
            ? (availabilityData.map((row) => ({
                ...row,
                start_time: String(row.start_time).slice(0, 5),
                end_time: String(row.end_time).slice(0, 5),
              })) as AvailabilityRow[])
            : [];
        setAvailability(resolvedAvailability);

        const today = new Date();
        const end = new Date();
        end.setDate(today.getDate() + 7);

        const todayString = formatDateKey(today);
        const endString = formatDateKey(end);

        const { data: bookingsData, error: bookingsError } = await supabase
          .from("bookings")
          .select(
            "id, professional_id, customer_id, booking_date, start_time, end_time, status, service_id, service_name, duration_minutes, service_price, service_mode, source, formatted_address, location_lat, location_lng, location_place_id"
          )
          .eq("professional_id", resolvedId)
          .in("status", ["confirmed", "completion_requested", "completed"])
          .gte("booking_date", todayString)
          .lte("booking_date", endString)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });

        const resolvedBookings =
          !bookingsError && bookingsData
            ? (bookingsData.map((row) => ({
                ...row,
                start_time: String(row.start_time).slice(0, 5),
                end_time: String(row.end_time).slice(0, 5),
              })) as BookingRow[])
            : [];
        setBookings(resolvedBookings);

        const { data: portfolioData, error: portfolioError } = await supabase
          .from("professional_portfolio")
          .select("id, user_id, image_url, caption, media_type, created_at")
          .eq("user_id", resolvedId)
          .order("created_at", { ascending: false });

        const resolvedPortfolio =
          !portfolioError && portfolioData ? (portfolioData as PortfolioItem[]) : [];
        setPortfolioItems(resolvedPortfolio);

        const { data: reviewData, error: reviewError } = await supabase
          .from("professional_reviews")
          .select("id, professional_id, reviewer_id, rating, comment, created_at")
          .eq("professional_id", resolvedId)
          .order("created_at", { ascending: false });

        if (!reviewError && reviewData) {
          const reviewerIds = [...new Set(reviewData.map((review) => review.reviewer_id))];

          let reviewerMap = new Map<
            string,
            { full_name: string | null; avatar_url: string | null }
          >();

          if (reviewerIds.length > 0) {
            const { data: reviewerProfiles } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", reviewerIds);

            if (reviewerProfiles) {
              reviewerMap = new Map(
                reviewerProfiles.map((reviewer) => [
                  reviewer.id,
                  {
                    full_name: reviewer.full_name ?? null,
                    avatar_url: reviewer.avatar_url ?? null,
                  },
                ])
              );
            }
          }

          const enrichedReviews: EnrichedReview[] = reviewData.map((review) => {
            const reviewer = reviewerMap.get(review.reviewer_id);

            return {
              ...review,
              reviewer_name: reviewer?.full_name ?? null,
              reviewer_avatar_url: reviewer?.avatar_url ?? null,
            };
          });

          setReviews(enrichedReviews);
          setCached<ProfileDetailCache>(cacheKey, {
            profile: profileData as Profile,
            services: resolvedServices,
            availability: resolvedAvailability,
            bookings: resolvedBookings,
            portfolioItems: resolvedPortfolio,
            reviews: enrichedReviews,
          });
        } else {
          setReviews([]);
          setCached<ProfileDetailCache>(cacheKey, {
            profile: profileData as Profile,
            services: resolvedServices,
            availability: resolvedAvailability,
            bookings: resolvedBookings,
            portfolioItems: resolvedPortfolio,
            reviews: [],
          });
        }

        setLoading(false);
      } catch (error) {
        console.error("PROFILE PAGE CRASH:", error);
        setMessage("Something went wrong loading this profile.");
        setLoading(false);
      }
    }

    if (profileId) {
      loadProfilePage(!!seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {}
    );
  }, []);

  const profileDistanceLabel = useMemo(() => {
    if (!userLocation || !profile?.location_lat || !profile?.location_lng) return null;
    return formatDistance(
      getDistanceKm(
        userLocation.lat,
        userLocation.lng,
        profile.location_lat,
        profile.location_lng
      )
    );
  }, [userLocation, profile?.location_lat, profile?.location_lng]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const slotBlockMinutes = useMemo(() => {
    return Math.max(Number(profile?.default_appointment_duration || 60), 30);
  }, [profile?.default_appointment_duration]);

  const directBookingModes = getPlainServiceModes(profile?.service_modes ?? null).filter((mode) =>
    ["in_shop", "home_studio"].includes(mode)
  );

  // Instant booking needs a fixed location to book against, so it also
  // requires the professional to offer in-shop or home-studio (not just
  // at-home) — without that, the calendar has nowhere valid to send someone.
  const profileVerified = isVerifiedNow(profile);

  const canDirectBook =
    profileVerified &&
    !!profile?.direct_booking_enabled &&
    !!profile?.public_availability_enabled &&
    directBookingModes.length > 0;

  const generatedSlots = useMemo(() => {
    if (!canDirectBook) {
      return [];
    }

    const activeAvailability = availability.filter((row) => row.is_active);
    const nextSevenDays: GeneratedSlot[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      currentDate.setDate(currentDate.getDate() + offset);

      const dayOfWeek = currentDate.getDay();
      const matchingWindows = activeAvailability.filter(
        (row) => Number(row.day_of_week) === dayOfWeek
      );

      if (matchingWindows.length === 0) continue;

      for (const window of matchingWindows) {
        const startMinutes = timeToMinutes(window.start_time);
        const endMinutes = timeToMinutes(window.end_time);

        for (
          let slotStart = startMinutes;
          slotStart + slotBlockMinutes <= endMinutes;
          slotStart += 15
        ) {
          const slotEnd = slotStart + slotBlockMinutes;

          // Today: never offer a time that has already started (15 min buffer).
          if (offset === 0) {
            const now = new Date();
            if (slotStart <= now.getHours() * 60 + now.getMinutes() + 15) continue;
          }

          const dateKey = formatDateKey(currentDate);
          const startTime = minutesToTime(slotStart);
          const endTime = minutesToTime(slotEnd);

          const overlapsExistingBooking = bookings.some((booking) => {
            if (booking.booking_date !== dateKey) return false;
            if (booking.status === "cancelled") return false;

            const bookingStart = timeToMinutes(booking.start_time);
            const bookingEnd = timeToMinutes(booking.end_time);

            return slotStart < bookingEnd && slotEnd > bookingStart;
          });

          if (overlapsExistingBooking) continue;

          nextSevenDays.push({
            key: `${dateKey}-${startTime}-${endTime}-${slotBlockMinutes}`,
            date: dateKey,
            dayLabel:
              offset === 0
                ? "Today"
                : offset === 1
                ? "Tomorrow"
                : dayLabels[dayOfWeek],
            dateLabel: currentDate.toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
            }),
            start_time: startTime,
            end_time: endTime,
            duration_minutes: slotBlockMinutes,
          });
        }
      }
    }

    return nextSevenDays;
  }, [availability, bookings, profile, slotBlockMinutes, canDirectBook]);

  const groupedSlots = useMemo(() => {
    const groups = new Map<
      string,
      { dayLabel: string; dateLabel: string; slots: GeneratedSlot[] }
    >();

    for (const slot of generatedSlots) {
      if (!groups.has(slot.date)) {
        groups.set(slot.date, {
          dayLabel: slot.dayLabel,
          dateLabel: slot.dateLabel,
          slots: [],
        });
      }

      groups.get(slot.date)?.slots.push(slot);
    }

    return Array.from(groups.entries()).map(([date, value]) => ({
      date,
      dayLabel: value.dayLabel,
      dateLabel: value.dateLabel,
      slots: value.slots,
    }));
  }, [generatedSlots]);

  const bookingCalendarDays = useMemo(() => {
    const slotMap = new Map(groupedSlots.map((group) => [group.date, group.slots]));

    return Array.from({ length: 7 }).map((_, offset) => {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      currentDate.setDate(currentDate.getDate() + offset);

      const date = formatDateKey(currentDate);
      const slots = slotMap.get(date) || [];

      return {
        date,
        dayLabel:
          offset === 0
            ? "Today"
            : offset === 1
            ? "Tomorrow"
            : dayLabels[currentDate.getDay()],
        shortDayLabel: currentDate.toLocaleDateString("en-CA", {
          weekday: "short",
        }),
        dateLabel: currentDate.toLocaleDateString("en-CA", {
          month: "short",
          day: "numeric",
        }),
        slots,
      };
    });
  }, [groupedSlots]);

  const selectedBookingDay = useMemo(() => {
    if (selectedDay) {
      return bookingCalendarDays.find((day) => day.date === selectedDay) || null;
    }

    return (
      bookingCalendarDays.find((day) => day.slots.length > 0) ||
      bookingCalendarDays[0] ||
      null
    );
  }, [bookingCalendarDays, selectedDay]);

  useEffect(() => {
    const selectedDate = selectedBookingDay?.date;
    if (!selectedDate) return;

    dateButtonRefs.current[selectedDate]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedBookingDay?.date]);

  const selectedDayTimeGroups = useMemo(() => {
    const slots = selectedBookingDay?.slots || [];

    return [
      {
        label: "Morning",
        helper: "Before 12 PM",
        slots: slots.filter((slot) => timeToMinutes(slot.start_time) < 12 * 60),
      },
      {
        label: "Afternoon",
        helper: "12 PM - 4 PM",
        slots: slots.filter((slot) => {
          const minutes = timeToMinutes(slot.start_time);
          return minutes >= 12 * 60 && minutes < 16 * 60;
        }),
      },
      {
        label: "Evening",
        helper: "After 4 PM",
        slots: slots.filter((slot) => timeToMinutes(slot.start_time) >= 16 * 60),
      },
    ].filter((group) => group.slots.length > 0);
  }, [selectedBookingDay]);

  const activePeriodGroup =
    selectedDayTimeGroups.find((group) => group.label === selectedPeriod) ||
    selectedDayTimeGroups[0] ||
    null;

  const servicesThatFitSelectedSlot = useMemo(() => {
    if (!selectedSlot) return [];
    return services.filter(
      (service) =>
        service.is_active &&
        service.is_bookable &&
        Number(service.duration_minutes) <= Number(selectedSlot.duration_minutes)
    );
  }, [services, selectedSlot]);

  const visibleReviews = useMemo(() => {
    return showAllReviews ? reviews : reviews.slice(0, 4);
  }, [reviews, showAllReviews]);

  function formatProfessionalType(value: string | null | undefined) {
    if (!value) return "Customer";

    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function getProfessionalTypeLabels(currentProfile: Profile | null) {
    if (!currentProfile) return [];

    const savedTypes = Array.isArray(currentProfile.professional_types)
      ? currentProfile.professional_types
      : [];

    const fallbackType = currentProfile.professional_type
      ? [currentProfile.professional_type]
      : [];

    return (savedTypes.length > 0 ? savedTypes : fallbackType)
      .filter(Boolean)
      .map((type) => formatProfessionalType(type));
  }

  function formatProfessionalTypes(currentProfile: Profile | null) {
    const labels = getProfessionalTypeLabels(currentProfile);
    return labels.length > 0 ? labels.join(" • ") : "Professional";
  }

  function formatServiceModes(value: string | string[] | null) {
    if (!value) return null;

    if (Array.isArray(value)) {
      return value
        .map((mode) =>
          mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
        )
        .join(" • ");
    }

    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function renderStars(rating: number) {
    const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
    return "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
  }

  function formatTime(time: string) {
    const [hourString, minute] = time.split(":");
    const hour = Number(hourString);
    const suffix = hour >= 12 ? "PM" : "AM";
    const twelveHour = hour % 12 || 12;
    return `${twelveHour}:${minute} ${suffix}`;
  }

  function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function timeToMinutes(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function minutesToTime(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }


  function getSlotPeriod(time: string) {
    const minutes = timeToMinutes(time);
    if (minutes < 12 * 60) return "morning";
    if (minutes < 16 * 60) return "afternoon";
    return "evening";
  }

  function chooseBookingDay(date: string) {
    setSelectedDay(date);
    setSelectedSlot(null);
    setSelectedServiceMode(null);
    setLocationInput("");
    setMessage("");
  }

  // Hovering a day on the booking strip zooms into its open times.
  function renderBookingDayLens(date: string) {
    const day = bookingCalendarDays.find((item) => item.date === date);
    if (!day) return null;
    const preview = day.slots.slice(0, 9);
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_28px_64px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        <div className="flex items-end justify-between gap-3 border-b border-neutral-100 px-4 pb-3 pt-4">
          <div>
            <p className="text-[11px] font-medium text-neutral-500">{day.dayLabel}</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-[-0.03em] text-neutral-900">
              {new Date(`${day.date}T00:00:00`).getDate()}
              <span className="ml-1.5 text-base font-medium text-neutral-400">{day.dateLabel.split(" ")[0]}</span>
            </p>
          </div>
          <span className="pb-1 text-sm tabular-nums text-neutral-500">
            {day.slots.length} open {day.slots.length === 1 ? "time" : "times"}
          </span>
        </div>

        {day.slots.length === 0 ? (
          <p className="px-4 py-5 text-sm text-neutral-500">Fully booked — try another day.</p>
        ) : (
          <div className="lu-slots grid grid-cols-3 gap-1.5 px-4 py-4">
            {preview.map((slot) => (
              <span
                key={slot.key}
                className="whitespace-nowrap rounded-lg bg-neutral-100 px-1 py-1.5 text-center text-[12px] font-medium tabular-nums text-neutral-800"
              >
                {formatTime(slot.start_time)}
              </span>
            ))}
            {day.slots.length > preview.length ? (
              <span className="col-span-3 text-center text-[11px] text-neutral-500">
                +{day.slots.length - preview.length} more
              </span>
            ) : null}
          </div>
        )}

        <div className="border-t border-neutral-100 px-4 py-2.5">
          <button
            type="button"
            onClick={() => chooseBookingDay(day.date)}
            disabled={day.slots.length === 0}
            className="rounded text-xs font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-900 disabled:text-neutral-400 disabled:no-underline"
          >
            Choose this day
          </button>
        </div>
      </div>
    );
  }

  function getDaySymbols(slots: GeneratedSlot[]) {
    const hasDaytime = slots.some((slot) => getSlotPeriod(slot.start_time) !== "evening");
    const hasEvening = slots.some((slot) => getSlotPeriod(slot.start_time) === "evening");

    return [hasDaytime ? "daytime" : null, hasEvening ? "evening" : null].filter(Boolean) as string[];
  }

  function getSelectedMonthLabel() {
    const date = selectedBookingDay?.date || bookingCalendarDays[0]?.date;
    if (!date) return "";

    return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", {
      month: "long",
      year: "numeric",
    });
  }

  function getNextOpeningText() {
    if (generatedSlots.length === 0) return null;
    const first = generatedSlots[0];
    return `${first.dayLabel} ${first.dateLabel} • ${formatTime(first.start_time)}`;
  }

  function handleStartBookingConfirmation(service: ProfessionalService) {
    setMessage("");

    if (!viewerUserId) {
      setAuthPromptService(service.service_name || "this service");
      return;
    }

    if (!viewerIsCustomer) {
      setMessage("You need to be signed in as a customer to book a time.");
      return;
    }

    if (!profile || !selectedSlot) return;

    if (!selectedServiceMode) {
      setMessage("Please select in-shop or home-studio before choosing a service.");
      return;
    }

    const usesProfessionalLocation =
      selectedServiceMode === "in_shop" || selectedServiceMode === "home_studio";

    if (!usesProfessionalLocation) {
      setMessage(
        "Direct booking is only available for in-shop or home-studio appointments. Use Request service for at-home jobs."
      );
      return;
    }

    const professionalAddress = profile.formatted_address || profile.location || null;

    if (!professionalAddress?.trim()) {
      setMessage(
        "This professional needs to add their shop or studio address before direct bookings can be accepted."
      );
      return;
    }

    setPendingBookingChoice({
      service,
      slot: selectedSlot,
      mode: selectedServiceMode,
      address: professionalAddress,
    });
  }

  async function handleBookServiceInSlot(
    service: ProfessionalService,
    slotOverride?: GeneratedSlot,
    modeOverride?: string
  ) {
    if (bookingSlotKey) return;

    const activeSlot = slotOverride || selectedSlot;
    const activeMode = modeOverride || selectedServiceMode;

    function abort(msg: string) {
      setMessage(msg);
      setBookingSlotKey(null);
    }

    try {
      setMessage("");

      if (!viewerUserId || !viewerIsCustomer) {
        setMessage("You need to be signed in as a customer to book a time.");
        return;
      }

      if (!profile || !activeSlot) return;

      setBookingSlotKey(activeSlot.key);

      if (!activeMode) {
        abort("Please select in-shop or home-studio before choosing a service.");
        return;
      }

      const usesProfessionalLocation =
        activeMode === "in_shop" || activeMode === "home_studio";

      if (!usesProfessionalLocation) {
        abort(
          "Direct booking is only available for in-shop or home-studio appointments. Use Request service for at-home jobs."
        );
        return;
      }

      const professionalAddress = profile.formatted_address || profile.location || null;

      if (!professionalAddress?.trim()) {
        abort(
          "This professional needs to add their shop or studio address before direct bookings can be accepted."
        );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        abort("Not authenticated. Please log out and log back in.");
        return;
      }

      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          flowType: "direct_booking",
          professionalId: profile.id,
          serviceId: service.id,
          date: activeSlot.date,
          startTime: activeSlot.start_time,
          endTime: activeSlot.end_time,
          mode: activeMode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        abort(data?.error || "Could not start payment.");
        return;
      }

      setPaymentClientSecret(data.clientSecret);
    } catch (error: any) {
      console.error("DIRECT BOOKING PAYMENT ERROR", error);
      abort(error?.message || "Something went wrong starting payment.");
    }
  }

  async function handleDirectBookingPaymentComplete() {
    setPaymentClientSecret(null);
    setConfirmingPayment(true);
    setMessage("Payment successful — confirming your booking...");

    const activeSlot = selectedSlot;

    let foundBooking: BookingRow | null = null;

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const { data: latest } = await supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, service_id, service_name, duration_minutes, service_price, service_mode, source, formatted_address, location_lat, location_lng, location_place_id"
        )
        .eq("customer_id", viewerUserId)
        .eq("professional_id", profile?.id)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.id && (!activeSlot || latest.booking_date === activeSlot.date)) {
        foundBooking = {
          ...latest,
          start_time: String(latest.start_time).slice(0, 5),
          end_time: String(latest.end_time).slice(0, 5),
        } as BookingRow;
        break;
      }
    }

    setConfirmingPayment(false);
    setMessage("");
    setBookingSlotKey(null);

    if (foundBooking) {
      setBookings((prev) => [...prev, foundBooking as BookingRow]);
      setConfirmedBooking(foundBooking);
      setSelectedSlot(null);
      setSelectedServiceMode(null);
      setLocationInput("");
      setLocationPlaceId("");
      setLocationLat(null);
      setLocationLng(null);
    } else {
      setMessage("Payment succeeded, but we couldn't confirm the booking yet. Check your Bookings tab in a moment.");
    }
  }

if (loading) {
  return (
    <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10">

      <div className="mx-auto max-w-6xl animate-pulse">
        {/* Hero */}
        <div className="mt-10 overflow-hidden rounded-[28px] bg-white ring-1 ring-ink/[0.07]">
          <div className="h-56 w-full bg-neutral-200 md:h-72" />

          <div className="px-8 pb-8 pt-6">
            <div className="flex flex-col gap-5 md:flex-row">
              <div className="h-28 w-28 rounded-2xl bg-neutral-200" />

              <div className="flex-1">
                <div className="h-12 w-72 rounded bg-neutral-200" />

                <div className="mt-4 h-5 w-48 rounded bg-neutral-200" />

                <div className="mt-6 h-4 w-96 max-w-full rounded bg-neutral-200" />

                <div className="mt-3 h-4 w-80 max-w-[90%] rounded bg-neutral-200" />

                <div className="mt-5 flex gap-2">
                  <div className="h-8 w-24 rounded-full bg-neutral-200" />
                  <div className="h-8 w-24 rounded-full bg-neutral-200" />
                  <div className="h-8 w-24 rounded-full bg-neutral-200" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="mt-8 grid gap-6">
          <div className="rounded-[28px] bg-white ring-1 ring-ink/[0.07] p-6">
            <div className="h-7 w-52 rounded bg-neutral-200" />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="h-40 rounded-2xl bg-neutral-200" />
              <div className="h-40 rounded-2xl bg-neutral-200" />
            </div>
          </div>

          <div className="rounded-[28px] bg-white ring-1 ring-ink/[0.07] p-6">
            <div className="h-7 w-40 rounded bg-neutral-200" />

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="aspect-square rounded-2xl bg-neutral-200" />
              <div className="aspect-square rounded-2xl bg-neutral-200" />
              <div className="aspect-square rounded-2xl bg-neutral-200" />
            </div>
          </div>

          <div className="rounded-[28px] bg-white ring-1 ring-ink/[0.07] p-6">
            <div className="h-7 w-44 rounded bg-neutral-200" />

            <div className="mt-6 space-y-4">
              <div className="h-24 rounded-2xl bg-neutral-200" />
              <div className="h-24 rounded-2xl bg-neutral-200" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

  if (!profile) {
    return (
      <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10 text-neutral-900">

        <div className="mx-auto max-w-6xl py-10">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            ← Back
          </Link>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Profile not found."}
          </div>
        </div>
      </main>
    );
  }

  const isProfessional =
    profile.role === "professional" || profile.role === "I am a professional";


  const professionalServiceModes = getPlainServiceModes(profile.service_modes);
  const hasFixedServiceLocation =
    professionalServiceModes.includes("in_shop") || professionalServiceModes.includes("home_studio");
  const offersAtHomeService = professionalServiceModes.includes("at_home");

  const profileTags = [
    profileVerified ? (profile.verification_track === "student" ? "Verified student" : "Verified") : null,
    canDirectBook ? "Direct booking" : null,
    getNextOpeningText() ? "Open this week" : null,
    averageRating ? "Highly rated" : null,
    reviews.length >= 3 ? "Trusted by clients" : null,
  ].filter(Boolean) as string[];

  const servicePrices = services
    .map((service) => Number(service.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const servicePriceFrom = servicePrices.length ? formatPrice(Math.min(...servicePrices)) : null;

  const sectionLinks = [
    canDirectBook ? { id: "availability", label: "Book" } : null,
    services.length > 0 ? { id: "services", label: "Services" } : null,
    portfolioItems.length > 0 ? { id: "work", label: "Work" } : null,
    { id: "reviews", label: "Reviews" },
  ].filter(Boolean) as { id: string; label: string }[];

  const professionalBookingAddress = profile.formatted_address || profile.location || null;
  const professionalMapsUrl = getGoogleMapsUrl(
    profile.location_lat,
    profile.location_lng,
    professionalBookingAddress
  );

  return (
    <>
      <main
        className="min-h-screen bg-paper px-4 pb-36 pt-4 text-neutral-900 sm:px-6 sm:pb-16 lg:px-8"
        style={{ "--profile-offset": `${headerHeight + 64}px` } as React.CSSProperties}
      >
        <div className="mx-auto max-w-6xl py-4 sm:py-8">
          {(() => {
            const verified = profileTags.includes("Verified") || profileTags.includes("Verified student");
            const nameWords = (profile.full_name || "Profile").trim().split(/\s+/);
            const nameLast = nameWords.pop() || "";
            const nameLead = nameWords.join(" ");
            const subline = [
              isProfessional ? formatProfessionalTypes(profile) : "LineUp Client",
              isProfessional ? profile.business_name?.trim() : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const identity = (onPhoto: boolean) => (
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:gap-6">
                <div
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-full md:h-24 md:w-24 ${
                    onPhoto ? "ring-2 ring-white/80" : "bg-white shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] ring-1 ring-ink/[0.08]"
                  }`}
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name || "Profile"} className="h-full w-full bg-white object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-3xl font-semibold text-neutral-400">
                      {profile.full_name?.charAt(0).toUpperCase() || "P"}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h1
                    className={`text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.045em] md:text-[4.5rem] ${
                      onPhoto ? "text-white" : "text-ink"
                    }`}
                  >
                    <MaskLine>
                      {/* The badge stays glued to the last word so it never wraps alone. */}
                      {nameLead ? <span className="break-words">{nameLead} </span> : null}
                      <span className="whitespace-nowrap">
                      {nameLast}
                      {verified ? (
                        <BadgeCheck
                          aria-label="Verified professional"
                          className={`ml-2 inline h-7 w-7 -translate-y-1 align-middle md:ml-3 md:h-10 md:w-10 md:-translate-y-2 ${
                            onPhoto ? "fill-white text-ink" : "fill-ink text-white"
                          }`}
                          strokeWidth={2}
                        />
                      ) : null}
                      </span>
                    </MaskLine>
                  </h1>
                  <p className={`lu-fade-in mt-3 text-[15px] md:text-base ${onPhoto ? "text-white/75" : "text-neutral-600"}`}>
                    {subline}
                    {profile.username ? (
                      <span className={onPhoto ? "text-white/50" : "text-neutral-400"}> · @{profile.username}</span>
                    ) : null}
                  </p>
                </div>
              </div>
            );

            return profile.banner_url ? (
              <div className="lu-lift-in relative overflow-hidden rounded-[32px] bg-ink">
                <button
                  type="button"
                  onClick={() => setShowBannerPreview(true)}
                  className="block h-[400px] w-full cursor-zoom-in md:h-[500px]"
                  aria-label="View cover photo"
                >
                  <img src={profile.banner_url} alt="Cover photo" className="h-full w-full object-cover" />
                </button>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/0" />
                <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">{identity(true)}</div>
              </div>
            ) : (
              <div className="pt-4 md:pt-10">{identity(false)}</div>
            );
          })()}

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
                {hasFixedServiceLocation && (profile.formatted_address || profile.location) ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {formatDisplayAddress(profile.formatted_address || profile.location)}
                    {profileDistanceLabel ? <span className="text-neutral-400">· {profileDistanceLabel}</span> : null}
                  </span>
                ) : !hasFixedServiceLocation && offersAtHomeService ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    Travels to your area
                    {profileDistanceLabel ? <span className="text-neutral-400">· {profileDistanceLabel}</span> : null}
                  </span>
                ) : null}
                {isProfessional && formatServiceModes(profile.service_modes) ? (
                  <span>{formatServiceModes(profile.service_modes)}</span>
                ) : null}
                {profile.instagram_handle ? (
                  <a
                    href={`https://instagram.com/${String(profile.instagram_handle).replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-ink underline decoration-ink/20 underline-offset-4 transition hover:decoration-ink"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
                    </svg>
                    @{String(profile.instagram_handle).replace("@", "")}
                  </a>
                ) : null}
              </div>

              {profile.bio?.trim() ? (
                <p className="mt-5 max-w-2xl whitespace-pre-line text-[17px] leading-8 text-neutral-700">
                  {profile.bio.trim()}
                </p>
              ) : null}

              {profileTags.filter((tag) => !tag.startsWith("Verified")).length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {profileTags
                    .filter((tag) => !tag.startsWith("Verified"))
                    .slice(0, 4)
                    .map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-ink/[0.07]">
                        {tag}
                      </span>
                    ))}
                </div>
              ) : null}
            </div>

            <div className="lg:w-[300px]">
              {isProfessional && viewerIsCustomer && viewerUserId !== profile.id && !profileVerified ? (
                <div className="rounded-2xl bg-white p-4 text-sm leading-6 text-neutral-600 ring-1 ring-ink/[0.07]">
                  This professional hasn&apos;t completed verification yet, so they can&apos;t be requested or booked right now.
                </div>
              ) : null}

              {isProfessional && (viewerIsCustomer || !viewerUserId) && viewerUserId !== profile.id && profileVerified ? (
                <div className="grid gap-2.5">
                  {canDirectBook ? (
                    <a
                      href="#availability"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-4 text-[15px] font-semibold text-white transition duration-300 ease-premium hover:bg-neutral-800 active:scale-[0.98]"
                    >
                      <CalendarDays className="h-4 w-4" />
                      Book a time
                    </a>
                  ) : null}
                  <Link
                    href={
                      viewerUserId
                        ? `/requests/new?rebook=1&pro=${profile.id}`
                        : loginHref(`/requests/new?rebook=1&pro=${profile.id}`)
                    }
                    className={`inline-flex items-center justify-center rounded-full px-7 py-4 text-[15px] font-semibold transition duration-300 ease-premium active:scale-[0.98] ${
                      canDirectBook
                        ? "bg-white text-ink ring-1 ring-ink/15 hover:ring-ink/30"
                        : "bg-ink text-white hover:bg-neutral-800"
                    }`}
                  >
                    {hasBookedBefore ? "Request again" : "Request service"}
                  </Link>
                  {canDirectBook && getNextOpeningText() ? (
                    <p className="mt-1 text-center text-xs text-neutral-500">Next opening {getNextOpeningText()}</p>
                  ) : null}
                </div>
              ) : null}

              {viewerUserId === profile.id ? (
                <Link
                  href="/account"
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:ring-ink/30"
                >
                  Edit profile
                </Link>
              ) : null}
            </div>
          </div>

          {isProfessional ? (
            <dl className={`mt-8 grid ${portfolioItems.length > 0 ? "grid-cols-4" : "grid-cols-3"} divide-x divide-ink/[0.08] rounded-2xl bg-white py-4 ring-1 ring-ink/[0.07] md:py-5`}>
              {[
                {
                  label: "Rating",
                  value: averageRating || "New",
                  star: !!averageRating,
                  href: reviews.length > 0 ? "#reviews" : null,
                },
                {
                  label: reviews.length === 1 ? "Review" : "Reviews",
                  value: String(reviews.length),
                  href: reviews.length > 0 ? "#reviews" : null,
                },
                {
                  label: services.length === 1 ? "Service" : "Services",
                  value: String(services.length),
                  href: services.length > 0 ? "#services" : null,
                },
                portfolioItems.length > 0
                  ? { label: "Portfolio", value: String(portfolioItems.length), href: "#work" }
                  : null,
              ]
                .filter((stat): stat is NonNullable<typeof stat> => !!stat)
                .map((stat) => {
                const body = (
                  <>
                    <dt className="mt-1.5 truncate text-[11px] text-neutral-500 md:text-xs">{stat.label}</dt>
                    <dd className="flex items-center justify-center gap-1 text-[1.15rem] font-semibold leading-none tracking-[-0.02em] text-ink md:text-[1.5rem]">
                      {"star" in stat && stat.star ? (
                        <span aria-hidden="true" className="text-[0.7em] leading-none">★</span>
                      ) : null}
                      {stat.value}
                    </dd>
                  </>
                );
                return stat.href ? (
                  <a
                    key={stat.label}
                    href={stat.href}
                    className="flex min-w-0 flex-col-reverse items-center px-2 text-center transition hover:opacity-70"
                  >
                    {body}
                  </a>
                ) : (
                  <div key={stat.label} className="flex min-w-0 flex-col-reverse items-center px-2 text-center">
                    {body}
                  </div>
                );
              })}
            </dl>
          ) : null}

          {message ? (
            <div className="mt-6 rounded-2xl bg-white p-4 text-sm text-neutral-700 ring-1 ring-ink/[0.07]">{message}</div>
          ) : null}

          <div ref={heroEndRef} aria-hidden="true" />

          {isProfessional && sectionLinks.length > 1 ? (
            <nav
              aria-label="On this page"
              className="sticky z-30 -mx-4 mt-10 bg-paper/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
              style={{ top: headerHeight }}
            >
              <div className="flex items-center justify-between gap-4 border-b border-ink/[0.08]">
                <ul className="-mb-px flex min-w-0 gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {sectionLinks.map((link) => {
                    const active = activeSection === link.id;
                    return (
                      <li key={link.id}>
                        <a
                          href={`#${link.id}`}
                          className={`relative flex h-12 items-center whitespace-nowrap text-sm transition-colors ${
                            active ? "font-medium text-ink" : "text-neutral-500 hover:text-ink"
                          }`}
                        >
                          {link.label}
                          <span
                            aria-hidden="true"
                            className={`absolute inset-x-0 bottom-0 h-[1.5px] origin-left bg-ink transition-transform duration-300 ease-premium ${
                              active ? "scale-x-100" : "scale-x-0"
                            }`}
                          />
                        </a>
                      </li>
                    );
                  })}
                </ul>

                {canDirectBook && (viewerIsCustomer || !viewerUserId) && viewerUserId !== profile.id && profileVerified ? (
                  <a
                    href="#availability"
                    className={`hidden shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition-all duration-300 ease-premium hover:bg-neutral-800 sm:inline-flex ${
                      pastHero ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
                    }`}
                  >
                    Book {profile.full_name?.split(" ")[0] || "a time"}
                  </a>
                ) : null}
              </div>
            </nav>
          ) : null}
          {isProfessional && canDirectBook ? (
            <ProfileSection
              id="availability"
              wide
              title="Book a time"
              subtitle="Availability"
              summary={getNextOpeningText() ? `Next opening: ${getNextOpeningText()}` : "View available times"}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-ink/[0.07]">
                <p className="text-neutral-600">
                  Pick an open time below and book instantly
                  {directBookingModes.length > 0
                    ? ` (${directBookingModes.map((m) => formatModeLabel(m).toLowerCase()).join(" or ")})`
                    : ""}
                  .
                </p>
                <Link
                  href={`/requests/new?rebook=1&pro=${profile.id}`}
                  className="font-medium text-ink underline decoration-ink/25 underline-offset-4 transition hover:decoration-ink"
                >
                  Make a direct service request instead
                </Link>
              </div>

              {services.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-5 text-neutral-600">
                  This professional has not added any bookable services yet.
                </div>
              ) : generatedSlots.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-5 text-neutral-600">
                  No open times available in the next 7 days.
                </div>
              ) : (
                <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-6">
                    <DayZoomArea renderLens={renderBookingDayLens} lensWidth={300}>
                    <div className="w-full max-w-full overflow-visible rounded-3xl bg-white p-3 ring-1 ring-ink/[0.07] sm:p-4">
                      <div className="mb-3 flex items-center justify-between gap-3 px-1">
                        <div>
                          <p className="text-xs font-medium text-neutral-500">
                            Choose a day
                          </p>
                          <p className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">
                            {getSelectedMonthLabel()}
                          </p>
                        </div>
                        <span className="hidden text-xs text-neutral-500 sm:inline">
                          Hover a day to preview times
                        </span>
                      </div>

                      <div
                        ref={dateScrollerRef}
                        className="flex w-full max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible scroll-smooth px-2 pb-3 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {bookingCalendarDays.map((day) => {
                          const isSelected = selectedBookingDay?.date === day.date;
                          const hasSlots = day.slots.length > 0;
                          const symbols = getDaySymbols(day.slots);
                          const dateNumber = new Date(`${day.date}T00:00:00`).getDate();

                          return (
                            <button
                              key={day.date}
                              ref={(element) => {
                                dateButtonRefs.current[day.date] = element;
                              }}
                              type="button"
                              data-zoom-key={day.date}
                              aria-pressed={isSelected}
                              onClick={() => chooseBookingDay(day.date)}
                              className="flex min-w-[58px] snap-center flex-col items-center gap-2 rounded-3xl px-1 py-1 text-center transition active:scale-[0.97] sm:min-w-[74px]"
                            >
                              <span
                                className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold transition-all duration-200 sm:h-16 sm:w-16 sm:text-xl ${
                                  isSelected
                                    ? "border-ink bg-ink text-white shadow-md ring-2 ring-black ring-offset-2"
                                    : hasSlots
                                    ? "border-neutral-200 bg-white text-neutral-900 shadow-[0_1px_0_rgba(0,0,0,0.03)] hover:border-neutral-400 hover:shadow-sm"
                                    : "border-neutral-200 bg-neutral-100 text-neutral-400"
                                }`}
                              >
                                {dateNumber}
                              </span>

                              <span
                                className={`text-xs font-medium ${
                                  isSelected ? "text-neutral-900" : hasSlots ? "text-neutral-600" : "text-neutral-400"
                                }`}
                              >
                                {day.shortDayLabel}
                              </span>

                              <span className="flex h-5 items-center justify-center gap-1">
                                {symbols.length > 0 ? (
                                  symbols.map((symbol) => (
                                    <span
                                      key={symbol}
                                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full ring-1 ${
                                        isSelected
                                          ? "bg-ink text-white ring-black"
                                          : "bg-neutral-100 text-neutral-500 ring-neutral-200"
                                      }`}
                                    >
                                      {symbol === "evening" ? (
                                        <Moon className="h-3 w-3" strokeWidth={2.25} />
                                      ) : (
                                        <Sun className="h-3 w-3" strokeWidth={2.25} />
                                      )}
                                    </span>
                                  ))
                                ) : (
                                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </DayZoomArea>

                    <div className="min-w-0 rounded-3xl bg-white p-4 ring-1 ring-ink/[0.07] sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-medium text-neutral-500">
                            Selected day
                          </p>
                          <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-neutral-900">
                            {selectedBookingDay
                              ? `${selectedBookingDay.dayLabel} ${selectedBookingDay.dateLabel}`
                              : "Choose a day"}
                          </h3>
                        </div>

                        {selectedBookingDay ? (
                          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-200">
                            {selectedBookingDay.slots.length} open{" "}
                            {selectedBookingDay.slots.length === 1 ? "time" : "times"}
                          </span>
                        ) : null}
                      </div>

                      {!selectedBookingDay || selectedBookingDay.slots.length === 0 ? (
                        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-ink/[0.06] text-sm text-neutral-600">
                          No times available for this day. Pick another day with an open time.
                        </div>
                      ) : (
                        <div className="mt-6">
                          {selectedDayTimeGroups.length > 1 ? (
                            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {selectedDayTimeGroups.map((group) => {
                                const isActive = activePeriodGroup?.label === group.label;
                                const isEveningGroup = group.label === "Evening";

                                return (
                                  <button
                                    key={group.label}
                                    type="button"
                                    onClick={() => setSelectedPeriod(group.label)}
                                    className={`flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                                      isActive
                                        ? "border-ink bg-ink text-white"
                                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                                    }`}
                                  >
                                    {isEveningGroup ? (
                                      <Moon className="h-3.5 w-3.5" strokeWidth={2.25} />
                                    ) : (
                                      <Sun className="h-3.5 w-3.5" strokeWidth={2.25} />
                                    )}
                                    {group.label}
                                    <span className={isActive ? "text-white/70" : "text-neutral-400"}>
                                      {group.slots.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {activePeriodGroup ? (
                            <div className={selectedDayTimeGroups.length > 1 ? "mt-4" : ""}>
                              <p className="mb-3 text-xs text-neutral-500">{activePeriodGroup.helper}</p>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                {activePeriodGroup.slots.map((slot) => (
                                  <button
                                    key={slot.key}
                                    type="button"
                                    disabled={
                                      // Signed-out visitors can pick; they sign in to confirm.
                                      (!!viewerUserId && !viewerIsCustomer) ||
                                      viewerUserId === profile.id ||
                                      bookingSlotKey === slot.key
                                    }
                                    onClick={() => {
                                      setSelectedSlot(slot);
                                      setSelectedServiceMode(directBookingModes.length === 1 ? directBookingModes[0] : null);
                                      setLocationInput("");
                                      setLocationPlaceId("");
                                      setLocationLat(null);
                                      setLocationLng(null);
                                      setMessage("");
                                    }}
                                    className={`min-w-0 rounded-2xl border px-3 py-3 text-left transition-all duration-150 ${
                                      selectedSlot?.key === slot.key
                                        ? "border-ink bg-ink text-white shadow-md"
                                        : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 hover:shadow-sm"
                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                  >
                                    <p className="text-base font-semibold">
                                      {bookingSlotKey === slot.key
                                        ? "Booking…"
                                        : formatTime(slot.start_time)}
                                    </p>
                                    <p
                                      className={`mt-1 text-xs ${
                                        selectedSlot?.key === slot.key
                                          ? "text-white/70"
                                          : "text-neutral-500"
                                      }`}
                                    >
                                      until {formatTime(slot.end_time)}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-fit rounded-3xl bg-white p-5 ring-1 ring-ink/[0.07] xl:sticky xl:top-[calc(var(--profile-offset,8rem)+1rem)]">
                    <p className="text-xs font-medium text-neutral-500">
                      Booking summary
                    </p>

                    {!selectedSlot ? (
                      <div className="mt-4 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-600">
                        Select a day and time to see which services fit and complete your booking.
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 rounded-2xl border border-ink bg-surface p-5 text-ink">
                          <p className="text-xs font-medium text-neutral-500">
                            Selected time
                          </p>
                          <h3 className="mt-2 text-xl font-semibold">
                            {selectedSlot.dayLabel} {selectedSlot.dateLabel}
                          </h3>
                          <p className="mt-2 text-sm text-neutral-600">
                            {formatTime(selectedSlot.start_time)} -{" "}
                            {formatTime(selectedSlot.end_time)}
                          </p>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlot(null);
                              setSelectedServiceMode(null);
                              setLocationInput("");
                              setLocationPlaceId("");
                              setLocationLat(null);
                              setLocationLng(null);
                            }}
                            className="mt-4 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-ink transition hover:bg-neutral-50"
                          >
                            Clear
                          </button>
                        </div>

                        {servicesThatFitSelectedSlot.length === 0 ? (
                          <div className="mt-4 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-600">
                            No services fit inside this time block.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-4">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">
                                Where it happens
                              </p>
                              <p className="mt-1 text-xs leading-5 text-neutral-500">
                                Direct bookings are for appointments at the professional’s shop or studio. For at-home work, post a request instead.
                              </p>

                              {directBookingModes.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {directBookingModes.map((mode) => (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() => {
                                        setSelectedServiceMode(mode);
                                        setLocationInput("");
                                        setLocationPlaceId("");
                                        setLocationLat(null);
                                        setLocationLng(null);
                                        setMessage("");
                                      }}
                                      className={`rounded-full border px-4 py-2 text-sm transition ${
                                        selectedServiceMode === mode
                                          ? "border-ink bg-ink text-white"
                                          : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                                      }`}
                                    >
                                      {formatModeLabel(mode)}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                  This professional has not enabled in-shop or home-studio direct booking yet.
                                </div>
                              )}
                            </div>

                            {selectedServiceMode === "in_shop" || selectedServiceMode === "home_studio" ? (
                              <div className="rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm leading-6 text-neutral-600">
                                <p className="font-medium text-neutral-900">
                                  {formatModeLabel(selectedServiceMode)}
                                </p>
                                <p className="mt-1">
                                  This booking will use the professional’s saved business location.
                                </p>

                                {professionalBookingAddress ? (
                                  <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
                                    <p className="font-medium text-neutral-900">
                                      <MapPin aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-[-2px]" />{formatDisplayAddress(professionalBookingAddress)}
                                    </p>
                                    {profileDistanceLabel ? (
                                      <p className="mt-1 text-xs font-medium text-neutral-500">
                                        {profileDistanceLabel}
                                      </p>
                                    ) : null}

                                    {professionalMapsUrl ? (
                                      <a
                                        href={professionalMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 inline-flex rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50"
                                      >
                                        Open in Maps
                                      </a>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                                    This professional still needs to add a shop/studio address in Services.
                                  </p>
                                )}
                              </div>
                            ) : directBookingModes.length > 0 ? (
                              <div className="rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-500">
                                Select where you want to book the appointment.
                              </div>
                            ) : null}

                            <div>
                              <p className="text-sm font-medium text-neutral-900">
                                Choose your service
                              </p>

                              <div className="mt-2 space-y-3">
                                {servicesThatFitSelectedSlot.map((service) => (
                                  <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => {
                                      if (!selectedServiceMode) {
                                        setMessage("Please select a service mode.");
                                        return;
                                      }
                                      handleStartBookingConfirmation(service);
                                    }}
                                    disabled={bookingSlotKey === selectedSlot.key}
                                    className="w-full rounded-2xl bg-white p-4 ring-1 ring-ink/[0.06] text-left transition hover:border-ink hover:bg-neutral-50 disabled:opacity-60"
                                  >
                                    <p className="font-semibold text-neutral-900">
                                      {service.service_name}
                                    </p>
                                    <p className="mt-1 text-sm text-neutral-500">
                                      {service.duration_minutes} min
                                      {formatPrice(service.price) ? ` · ${formatPrice(service.price)}` : ""}
                                    </p>
                                    {service.description ? (
                                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">
                                        {service.description}
                                      </p>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!viewerUserId ? (
                      <div className="mt-4 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-600">
                        Pick a time and a service. You&apos;ll sign in to confirm and come right back here.
                      </div>
                    ) : !viewerIsCustomer ? (
                      <div className="mt-4 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-600">
                        Sign in as a customer to book a time.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </ProfileSection>
          ) : null}

          {isProfessional && services.length > 0 ? (
            <ProfileSection
              id="services"
              title="Services"
              subtitle="What you can book"
              summary={`${services.length} service${services.length === 1 ? "" : "s"}${
                servicePriceFrom ? ` · from ${servicePriceFrom}` : ""
              }`}
            >
              {services.length > 8 ? (
                <label className="mb-4 flex items-center gap-2.5 rounded-full bg-white px-4 ring-1 ring-ink/[0.08] transition focus-within:ring-2 focus-within:ring-ink">
                  <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                  <input
                    value={serviceQuery}
                    onChange={(e) => setServiceQuery(e.target.value)}
                    placeholder={`Search ${services.length} services`}
                    aria-label="Search services"
                    className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-neutral-400"
                  />
                </label>
              ) : null}

              {(() => {
                const query = serviceQuery.trim().toLowerCase();
                const matching = query
                  ? services.filter(
                      (service) =>
                        service.service_name.toLowerCase().includes(query) ||
                        (service.description || "").toLowerCase().includes(query)
                    )
                  : services;
                const shown = query || showAllServices ? matching : matching.slice(0, 6);
                const canAct = (viewerIsCustomer || !viewerUserId) && viewerUserId !== profile.id;

                if (matching.length === 0) {
                  return <p className="py-6 text-sm text-neutral-500">No services match “{serviceQuery.trim()}”.</p>;
                }

                return (
                  <>
                    <ul className="overflow-hidden rounded-3xl bg-white ring-1 ring-ink/[0.07]">
                      {shown.map((service) => {
                        const body = (
                          <>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-ink">{service.service_name}</p>
                              <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                                {service.duration_minutes} min
                                {service.description ? ` · ${service.description}` : ""}
                              </p>
                            </div>
                            {formatPrice(service.price) ? (
                              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
                                {formatPrice(service.price)}
                              </span>
                            ) : null}
                          </>
                        );
                        const rowClass =
                          "flex items-center gap-4 border-t border-ink/[0.06] px-5 py-4 first:border-t-0";

                        if (canAct && canDirectBook) {
                          return (
                            <li key={service.id}>
                              <a href="#availability" className={`${rowClass} group transition hover:bg-neutral-50`}>
                                {body}
                                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                              </a>
                            </li>
                          );
                        }
                        if (canAct && profileVerified) {
                          const requestPath = `/requests/new?rebook=1&pro=${profile.id}&service=${encodeURIComponent(service.service_name)}${service.price ? `&price=${service.price}` : ""}`;
                          return (
                            <li key={service.id}>
                              <Link
                                href={viewerUserId ? requestPath : loginHref(requestPath)}
                                className={`${rowClass} group transition hover:bg-neutral-50`}
                              >
                                {body}
                                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                              </Link>
                            </li>
                          );
                        }
                        return (
                          <li key={service.id} className={rowClass}>
                            {body}
                          </li>
                        );
                      })}
                    </ul>

                    {!query && matching.length > 6 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllServices((prev) => !prev)}
                        className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-white"
                      >
                        {showAllServices ? "Show fewer" : `Show all ${matching.length} services`}
                      </button>
                    ) : null}
                  </>
                );
              })()}
            </ProfileSection>
          ) : null}

          {isProfessional && portfolioItems.length > 0 ? (
            <ProfileSection
              id="work"
              wide
              title="Past work"
              subtitle="Portfolio"
              summary={`${portfolioItems.length} piece${portfolioItems.length === 1 ? "" : "s"}`}
            >
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
                {portfolioItems.map((item, index) => (
                  <figure
                    key={item.id}
                    className={`group relative overflow-hidden rounded-2xl bg-neutral-100 ${
                      index === 0 ? "col-span-2 row-span-2" : ""
                    }`}
                  >
                    <div className={index === 0 ? "aspect-[4/3] h-full lg:aspect-auto" : "aspect-square"}>
                      {item.media_type === "video" ? (
                        <video
                          src={`${item.image_url}#t=0.1`}
                          preload="metadata"
                          className="h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                          controls
                        />
                      ) : (
                        <img
                          loading="lazy"
                          src={item.image_url}
                          alt={item.caption || "Portfolio image"}
                          className="h-full w-full object-cover transition duration-700 ease-premium group-hover:scale-[1.03]"
                        />
                      )}
                    </div>

                    {item.caption && item.media_type !== "video" ? (
                      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-sm text-white">
                        <span className="line-clamp-2">{item.caption}</span>
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            </ProfileSection>
          ) : null}

          {isProfessional ? (
            <ProfileSection
              id="reviews"
              title="Client feedback"
              subtitle="Reviews"
            >
              {reviews.length === 0 ? (
                <p className="rounded-2xl bg-neutral-50 p-5 text-sm text-neutral-600 ring-1 ring-ink/[0.05]">
                  No reviews yet. Reviews appear here after completed bookings.
                </p>
              ) : (
                <>
                  <div className="flex items-end gap-4 border-b border-ink/[0.06] pb-6">
                    <p className="text-[3rem] font-semibold leading-none tracking-[-0.04em] text-ink">
                      {averageRating}
                    </p>
                    <div className="pb-1">
                      <p className="text-sm tracking-[0.1em] text-ink">
                        {renderStars(Math.round(Number(averageRating) || 0))}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {reviews.length} review{reviews.length === 1 ? "" : "s"} from booked clients
                      </p>
                    </div>
                  </div>

                  <ul className="divide-y divide-ink/[0.06]">
                    {visibleReviews.map((review) => (
                      <li key={review.id} className="py-6 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                            {review.reviewer_avatar_url ? (
                              <img
                                loading="lazy"
                                src={review.reviewer_avatar_url}
                                alt={review.reviewer_name || "Reviewer"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-500">
                                {review.reviewer_name?.charAt(0).toUpperCase() || "C"}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-ink">
                              {review.reviewer_name || "Verified client"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              <span className="tracking-[0.08em] text-ink">{renderStars(review.rating)}</span>
                              <span className="mx-1.5 text-neutral-300">·</span>
                              {formatDate(review.created_at)}
                            </p>
                          </div>
                        </div>

                        {review.comment ? (
                          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-neutral-700">{review.comment}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {reviews.length > 4 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllReviews((prev) => !prev)}
                      className="mt-6 rounded-full px-5 py-2.5 text-sm font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-neutral-50"
                    >
                      {showAllReviews ? "Show fewer" : `Show all ${reviews.length} reviews`}
                    </button>
                  ) : null}
                </>
              )}
            </ProfileSection>
          ) : null}

        </div>
      </main>

      {/* Phone: once the hero buttons scroll away, booking stays one tap away.
          Sits above the app's tab bar when signed in, and steps aside while
          the calendar itself is on screen. */}
      {isProfessional &&
      profileVerified &&
      (viewerIsCustomer || !viewerUserId) &&
      viewerUserId !== profile.id ? (
        <div
          className={`fixed inset-x-0 z-40 px-3 transition-all duration-500 ease-premium sm:hidden ${
            pastHero && !calendarInView ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
          }`}
          style={{
            bottom: viewerUserId
              ? "calc(env(safe-area-inset-bottom) + 84px)"
              : "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-[22px] bg-ink p-2 pl-5 text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {servicePriceFrom ? `From ${servicePriceFrom}` : profile.full_name || "Book"}
              </p>
              <p className="truncate text-xs text-white/60">
                {canDirectBook
                  ? getNextOpeningText()
                    ? `Next: ${getNextOpeningText()}`
                    : "See open times"
                  : "Send a request"}
              </p>
            </div>
            {canDirectBook ? (
              <a href="#availability" className="shrink-0 rounded-[16px] bg-white px-5 py-3 text-sm font-semibold text-ink active:scale-[0.97]">
                Book a time
              </a>
            ) : (
              <Link
                href={
                  viewerUserId
                    ? `/requests/new?rebook=1&pro=${profile.id}`
                    : loginHref(`/requests/new?rebook=1&pro=${profile.id}`)
                }
                className="shrink-0 rounded-[16px] bg-white px-5 py-3 text-sm font-semibold text-ink active:scale-[0.97]"
              >
                Request
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {pendingBookingChoice ? (
        <div className="lu-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div className="lu-dialog-in w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-ink">
              <CalendarDays aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
            </div>

            <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-neutral-900">
              Confirm booking
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Make sure the service, time, and location are right before confirming.
            </p>

            <div className="mt-4 space-y-3 rounded-2xl bg-neutral-50 ring-1 ring-ink/[0.05] p-4 text-sm text-neutral-700">
              <div>
                <p className="text-xs font-medium text-neutral-500">
                  Service
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {pendingBookingChoice.service.service_name}
                </p>
              </div>

              {formatPrice(pendingBookingChoice.service.price) ? (
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Price
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    {formatPrice(pendingBookingChoice.service.price)}
                  </p>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-medium text-neutral-500">
                  Date & time
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {formatDate(pendingBookingChoice.slot.date)} · {formatTime(pendingBookingChoice.slot.start_time)} - {formatTime(pendingBookingChoice.slot.end_time)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500">
                  Where
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {formatModeLabel(pendingBookingChoice.mode)}
                </p>
              </div>

              {pendingBookingChoice.address ? (
                <div>
                  <p className="text-xs font-medium text-neutral-500">
                    Location
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    <MapPin aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-[-2px]" />{formatDisplayAddress(pendingBookingChoice.address)}
                  </p>
                </div>
              ) : null}
            </div>

            {/* The cancellation policy, stated before anyone pays. */}
            <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-600 ring-1 ring-ink/[0.05]">
              <span className="font-semibold text-neutral-900">Cancellation policy:</span> cancel for a full refund until{" "}
              {formatCancellationDeadline(pendingBookingChoice.slot.date, pendingBookingChoice.slot.start_time)}. Within 24
              hours of the appointment, bookings can&apos;t be cancelled.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const choice = pendingBookingChoice;
                  setPendingBookingChoice(null);
                  handleBookServiceInSlot(choice.service, choice.slot, choice.mode);
                }}
                disabled={bookingSlotKey === pendingBookingChoice.slot.key}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {bookingSlotKey === pendingBookingChoice.slot.key ? "Booking…" : "Confirm booking"}
              </button>
              <button
                type="button"
                onClick={() => setPendingBookingChoice(null)}
                disabled={bookingSlotKey === pendingBookingChoice.slot.key}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentClientSecret ? (
        <PaymentModal
          clientSecret={paymentClientSecret}
          title="Confirm your booking"
          subtitle="Payment is processed securely through Stripe. Your booking will be confirmed after payment succeeds."
          onClose={() => {
            setPaymentClientSecret(null);
            setBookingSlotKey(null);
          }}
          onSuccess={handleDirectBookingPaymentComplete}
          redirectTo={null}
        />
      ) : null}

      {authPromptService ? (
        <div
          className="lu-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setAuthPromptService(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-auth-title"
            onClick={(e) => e.stopPropagation()}
            className="lu-sheet-in w-full max-w-md rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:p-8"
          >
            <h2 id="book-auth-title" className="text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
              <MaskLine>Sign in to book.</MaskLine>
              <MaskLine delay={90} className="text-neutral-500">
                {authPromptService} with {profile.full_name?.split(" ")[0] || "this pro"}
              </MaskLine>
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              It takes a minute, and you&apos;ll come right back to this calendar to confirm your time.
            </p>
            <div className="mt-7 flex flex-col gap-3">
              {(() => {
                const back = `${typeof window !== "undefined" ? window.location.pathname : ""}#availability`;
                return (
                  <>
                    <Link
                      href={loginHref(back, "signup")}
                      onClick={() => rememberReturnTo(back)}
                      className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                      Create an account
                    </Link>
                    <Link
                      href={loginHref(back)}
                      onClick={() => rememberReturnTo(back)}
                      className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3.5 text-sm font-semibold text-ink transition hover:bg-neutral-50"
                    >
                      I have an account
                    </Link>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {confirmingPayment ? (
        <MomentOverlay status="working" workingTitle="Confirming your booking" title="Booked." />
      ) : null}

      {confirmedBooking ? (
        <BookedSheet
          subtitle={profile.full_name ? `With ${profile.full_name}.` : undefined}
          body="Full details, location and directions are on the booking page."
          note={`Free cancellation until ${formatCancellationDeadline(confirmedBooking.booking_date, confirmedBooking.start_time)}. Within 24 hours of the appointment it can't be cancelled.`}
          rows={[
            { label: "Service", value: confirmedBooking.service_name || "Appointment" },
            {
              label: "When",
              value: `${formatDate(confirmedBooking.booking_date)} · ${formatTime(confirmedBooking.start_time)} - ${formatTime(confirmedBooking.end_time)}`,
            },
            ...(confirmedBooking.formatted_address
              ? [
                  {
                    label: "Where",
                    value: (
                      <>
                        {confirmedBooking.service_mode ? (
                          <span className="block font-semibold">{formatModeLabel(confirmedBooking.service_mode)}</span>
                        ) : null}
                        <MapPin aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-[-2px]" />
                        {formatDisplayAddress(confirmedBooking.formatted_address)}
                        {userLocation && confirmedBooking.location_lat && confirmedBooking.location_lng ? (
                          <span className="mt-0.5 block text-xs font-normal text-neutral-500">
                            {formatDistance(
                              getDistanceKm(
                                userLocation.lat,
                                userLocation.lng,
                                confirmedBooking.location_lat,
                                confirmedBooking.location_lng
                              )
                            )}
                          </span>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        >
          <Link
            href={`/bookings/${confirmedBooking.id}`}
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            View booking
          </Link>
          <button
            type="button"
            onClick={() => setConfirmedBooking(null)}
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            Stay here
          </button>
        </BookedSheet>
      ) : null}

      {showBannerPreview && profile.banner_url ? (
        <div className="lu-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4">
          <button
            type="button"
            onClick={() => setShowBannerPreview(false)}
            className="lu-dialog-in absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            Close
          </button>

          <div className="flex h-full w-full max-w-6xl items-center justify-center">
            <img loading="lazy"
              src={profile.banner_url}
              alt="Full cover photo"
              className="max-h-full max-w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}