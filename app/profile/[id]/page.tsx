"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Star,
  Sparkles,
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import PaymentModal from "@/app/components/payments/PaymentModal";
import { getCached, setCached } from "@/app/lib/pageCache";

type Profile = {
  id: string;
  full_name: string | null;
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

function formatModeLabel(mode: string) {
  if (mode === "in_shop") return "In shop";
  if (mode === "home_studio") return "Home studio";
  if (mode === "at_home") return "At home";
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

function AccordionSection({
  id,
  title,
  subtitle,
  summary,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className="mt-6 scroll-mt-24 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-neutral-50 sm:px-6"
      >
        <div className="min-w-0">
          {subtitle ? (
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              {subtitle}
            </p>
          ) : null}

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>

          {summary ? (
            <p className="mt-1 text-sm leading-6 text-neutral-500">{summary}</p>
          ) : null}
        </div>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-2xl font-light transition ${
            open ? "rotate-45 bg-black text-white" : "bg-white text-neutral-900"
          }`}
        >
          +
        </span>
      </button>

      {open ? <div className="border-t border-neutral-100 p-5 sm:p-6">{children}</div> : null}
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

export default function ProfessionalProfilePage() {
  const params = useParams();
  const profileId = params.id as string;
  const cacheKey = `profile-detail-${profileId}`;
  const cached = getCached<ProfileDetailCache>(cacheKey);

  const [loading, setLoading] = useState(() => !cached);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(() => cached?.profile ?? null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(() => cached?.portfolioItems ?? []);
  const [reviews, setReviews] = useState<EnrichedReview[]>(() => cached?.reviews ?? []);
  const [availability, setAvailability] = useState<AvailabilityRow[]>(() => cached?.availability ?? []);
  const [bookings, setBookings] = useState<BookingRow[]>(() => cached?.bookings ?? []);
  const [services, setServices] = useState<ProfessionalService[]>(() => cached?.services ?? []);
  const [showBannerPreview, setShowBannerPreview] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerIsCustomer, setViewerIsCustomer] = useState(false);
  const [hasBookedBefore, setHasBookedBefore] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<GeneratedSlot | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedServiceMode, setSelectedServiceMode] = useState<string | null>(null);
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
  const dateScrollerRef = useRef<HTMLDivElement | null>(null);
  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    async function loadProfilePage() {
      try {
        setLoading(true);
        setMessage("");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, avatar_url, banner_url, role, professional_type, professional_types, location, formatted_address, location_lat, location_lng, location_place_id, bio, instagram_handle, business_name, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration"
          )
          .eq("id", profileId)
          .single();

        if (profileError || !profileData) {
          setMessage(profileError?.message || "Profile not found.");
          setLoading(false);
          return;
        }

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
              .eq("accepted_professional_id", profileId)
              .eq("status", "completed")
              .limit(1)
              .maybeSingle();

            const { data: priorCompletedBooking } = await supabase
              .from("bookings")
              .select("id")
              .eq("customer_id", user.id)
              .eq("professional_id", profileId)
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
          .eq("professional_id", profileId)
          .eq("is_active", true)
          .eq("is_bookable", true)
          .order("created_at", { ascending: true });

        const resolvedServices =
          !servicesError && servicesData ? (servicesData as ProfessionalService[]) : [];
        setServices(resolvedServices);

        const { data: availabilityData, error: availabilityError } = await supabase
          .from("professional_availability")
          .select("id, professional_id, day_of_week, start_time, end_time, is_active")
          .eq("professional_id", profileId)
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
          .eq("professional_id", profileId)
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
          .eq("user_id", profileId)
          .order("created_at", { ascending: false });

        const resolvedPortfolio =
          !portfolioError && portfolioData ? (portfolioData as PortfolioItem[]) : [];
        setPortfolioItems(resolvedPortfolio);

        const { data: reviewData, error: reviewError } = await supabase
          .from("professional_reviews")
          .select("id, professional_id, reviewer_id, rating, comment, created_at")
          .eq("professional_id", profileId)
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
      loadProfilePage();
    }
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

  const generatedSlots = useMemo(() => {
    if (!profile?.direct_booking_enabled || !profile?.public_availability_enabled) {
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
  }, [availability, bookings, profile, slotBlockMinutes]);

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

  function getSlotSymbol(time: string) {
    return getSlotPeriod(time) === "evening" ? "evening" : "daytime";
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

    if (!viewerUserId || !viewerIsCustomer) {
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
    <main className="min-h-screen bg-white px-6 py-10">

      <div className="mx-auto max-w-6xl animate-pulse">
        {/* Hero */}
        <div className="mt-10 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white">
          <div className="h-56 w-full bg-neutral-200 md:h-72" />

          <div className="px-8 pb-8 pt-6">
            <div className="flex flex-col gap-5 md:flex-row">
              <div className="h-28 w-28 rounded-[1.5rem] bg-neutral-200" />

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
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6">
            <div className="h-7 w-52 rounded bg-neutral-200" />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="h-40 rounded-2xl bg-neutral-200" />
              <div className="h-40 rounded-2xl bg-neutral-200" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6">
            <div className="h-7 w-40 rounded bg-neutral-200" />

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="aspect-square rounded-2xl bg-neutral-200" />
              <div className="aspect-square rounded-2xl bg-neutral-200" />
              <div className="aspect-square rounded-2xl bg-neutral-200" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6">
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
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">

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

  const professionalTypeLabels = getProfessionalTypeLabels(profile);

  const profileTags = [
    profile.direct_booking_enabled ? "Direct booking" : null,
    getNextOpeningText() ? "Open this week" : null,
    averageRating ? "Highly rated" : null,
    reviews.length >= 3 ? "Trusted by clients" : null,
  ].filter(Boolean) as string[];

  const directBookingModes = getPlainServiceModes(profile.service_modes).filter((mode) =>
    ["in_shop", "home_studio"].includes(mode)
  );

  const professionalBookingAddress = profile.formatted_address || profile.location || null;
  const professionalMapsUrl = getGoogleMapsUrl(
    profile.location_lat,
    profile.location_lng,
    professionalBookingAddress
  );

  return (
    <>
      <main className="min-h-screen bg-white px-6 pb-10 pt-6 text-neutral-900">


        <div className="mx-auto max-w-6xl py-8">
          <section className="mb-8 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="relative h-48 w-full bg-black md:h-64">
              {profile.banner_url ? (
                <button
                  type="button"
                  onClick={() => setShowBannerPreview(true)}
                  className="h-full w-full cursor-zoom-in"
                >
                  <img
                    src={profile.banner_url}
                    alt="Cover photo"
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-white/60">
                  No cover photo
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
            </div>

            <div className="px-6 pb-6 pt-6 md:px-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.5rem] border-4 border-white bg-neutral-100 shadow md:h-28 md:w-28">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.full_name || "Profile"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-neutral-500">
                        {profile.full_name?.charAt(0).toUpperCase() || "P"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 pt-1">
                    <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                      {profile.full_name || "Profile"}
                    </h1>

                    <p className="mt-2 text-base text-neutral-600 md:text-lg">
                      {isProfessional ? formatProfessionalTypes(profile) : "Customer"}
                    </p>

                    {isProfessional && profile.business_name?.trim() ? (
                      <p className="mt-1 text-sm font-medium text-neutral-500">
                        {profile.business_name}
                      </p>
                    ) : null}

                    {isProfessional && professionalTypeLabels.length > 1 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {professionalTypeLabels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600">
                      {profile.formatted_address || profile.location ? (
                        <span className="inline-flex flex-col items-start gap-0.5">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            {formatDisplayAddress(profile.formatted_address || profile.location)}
                          </span>
                          {profileDistanceLabel ? (
                            <span className="ml-5 text-xs text-neutral-500">
                              {profileDistanceLabel}
                            </span>
                          ) : null}
                        </span>
                      ) : null}

                      {isProfessional && averageRating ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Star className="h-4 w-4 fill-current" />
                          {averageRating} · {reviews.length} review{reviews.length === 1 ? "" : "s"}
                        </span>
                      ) : isProfessional ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Star className="h-4 w-4" />
                          No reviews yet
                        </span>
                      ) : null}
                    </div>

                    {profileTags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {profileTags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isProfessional && viewerIsCustomer && viewerUserId !== profile.id ? (
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[240px]">
                    {profile.direct_booking_enabled && profile.public_availability_enabled ? (
                      <a
                        href="#availability"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Book directly
                      </a>
                    ) : null}

                    <Link
                      href={`/requests/new?rebook=1&pro=${profile.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      {hasBookedBefore ? "Request again" : "Request service"}
                    </Link>
                  </div>
                ) : null}
              </div>

              {(profile.bio ||
                (isProfessional && formatServiceModes(profile.service_modes))) && (
                <div className="mt-6 border-t border-neutral-200 pt-6">
                  {profile.bio ? (
                    <p className="max-w-3xl text-sm leading-7 text-neutral-600 md:text-[15px]">
                      {profile.bio}
                    </p>
                  ) : null}

                  {isProfessional && formatServiceModes(profile.service_modes) ? (
                    <div className="mt-4 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                      {formatServiceModes(profile.service_modes)}
                    </div>
                  ) : null}
                </div>
              )}

              {message ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                  {message}
                </div>
              ) : null}
            </div>
          </section>

          {isProfessional && services.length > 0 ? (
            <AccordionSection
              title="What you can book"
              subtitle="Services"
              summary={`${services.length} service${services.length === 1 ? "" : "s"} available`}
              defaultOpen
            >
              <div className="grid gap-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-neutral-900">
                            {service.service_name}
                          </p>

                          {formatPrice(service.price) ? (
                            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200">
                              {formatPrice(service.price)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-4 w-4" />
                            {service.duration_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4" />
                            {service.is_bookable ? "Bookable" : "Request only"}
                          </span>
                        </div>

                        {service.description ? (
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-600">
                            {service.description}
                          </p>
                        ) : null}
                      </div>

                      {profile.direct_booking_enabled && profile.public_availability_enabled ? (
                        <a
                          href="#availability"
                          className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          View times
                        </a>
                      ) : (
                        <Link
                          href={`/requests/new?rebook=1&pro=${profile.id}`}
                          className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Request service
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionSection>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <AccordionSection
              title="About"
              subtitle="Profile"
              summary={profile.bio?.trim() ? "Bio, categories, specialties, and Instagram" : "No bio added yet"}
            >
              <div>
                <p className="max-w-3xl text-base leading-8 text-neutral-600">
                  {profile.bio?.trim() || "No bio added yet."}
                </p>
              </div>

              {isProfessional && professionalTypeLabels.length > 0 ? (
                <div className="mt-8">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Service categories
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {professionalTypeLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {isProfessional && profile.specialties && profile.specialties.length > 0 ? (
                <div className="mt-8">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Specialties
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {profile.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {profile.instagram_handle ? (
                <div className="mt-8">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Instagram
                  </p>
                  <a
                    href={`https://instagram.com/${String(profile.instagram_handle).replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    @{String(profile.instagram_handle).replace("@", "")}
                  </a>
                </div>
              ) : null}
            </AccordionSection>

            {isProfessional ? (
              <AccordionSection
                title="Trust snapshot"
                subtitle="Trust"
                summary={`${averageRating || "No"} rating · ${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Average rating
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {averageRating || "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Reviews
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {reviews.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Bookable services
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {services.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Next opening
                    </p>
                    <p className="mt-2 text-sm font-semibold text-neutral-900">
                      {getNextOpeningText() || "No opening"}
                    </p>
                  </div>
                </div>

                {viewerIsCustomer && viewerUserId !== profile.id ? (
                  <div className="mt-4">
                    <Link
                      href={`/requests/new?rebook=1&pro=${profile.id}`}
                      className="inline-flex w-full items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      {hasBookedBefore ? "Request again" : "Start a request"}
                    </Link>
                  </div>
                ) : null}
              </AccordionSection>
            ) : null}
          </div>

          {isProfessional &&
          profile.direct_booking_enabled &&
          profile.public_availability_enabled ? (
            <AccordionSection
              id="availability"
              title="Book a time"
              subtitle="Availability"
              summary={getNextOpeningText() ? `Next opening: ${getNextOpeningText()}` : "View available times"}
            >

              {services.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  This professional has not added any bookable services yet.
                </div>
              ) : generatedSlots.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No open times available in the next 7 days.
                </div>
              ) : (
                <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-6">
                    <div className="w-full max-w-full overflow-visible rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
                      <div className="mb-3 flex items-center justify-between gap-3 px-1">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                            Choose a day
                          </p>
                          <p className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">
                            {getSelectedMonthLabel()}
                          </p>
                        </div>
                        <span className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 sm:inline-flex">
                          Swipe dates
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
                              onClick={() => {
                                setSelectedDay(day.date);
                                setSelectedSlot(null);
                                setSelectedServiceMode(null);
                                setLocationInput("");
                                setMessage("");
                              }}
                              className="flex min-w-[58px] snap-center flex-col items-center gap-2 rounded-3xl px-1 py-1 text-center transition active:scale-[0.97] sm:min-w-[74px]"
                            >
                              <span
                                className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold transition-all duration-200 sm:h-16 sm:w-16 sm:text-xl ${
                                  isSelected
                                    ? "border-black bg-black text-white shadow-md ring-2 ring-black ring-offset-2"
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
                                          ? "bg-black text-white ring-black"
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

                    <div className="min-w-0 rounded-[2rem] border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white p-4 shadow-sm sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                            Selected day
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
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
                        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                          No times available for this day. Pick another day with an open time.
                        </div>
                      ) : (
                        <div className="mt-6 space-y-6">
                          {selectedDayTimeGroups.map((group) => {
                            const isEveningGroup = group.label === "Evening";

                            return (
                              <div key={group.label} className="border-t border-neutral-200 pt-5 first:border-t-0 first:pt-0">
                                <div className="mb-3 flex items-center gap-3">
                                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200">
                                    {isEveningGroup ? (
                                      <Moon className="h-4 w-4" strokeWidth={2.25} />
                                    ) : (
                                      <Sun className="h-4 w-4" strokeWidth={2.25} />
                                    )}
                                  </span>
                                  <div>
                                    <p className="text-sm font-semibold text-neutral-900">
                                      {group.label}
                                    </p>
                                    <p className="text-xs text-neutral-500">{group.helper}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                  {group.slots.map((slot) => (
                                    <button
                                      key={slot.key}
                                      type="button"
                                      disabled={
                                        !viewerIsCustomer ||
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
                                          ? "border-black bg-black text-white shadow-md"
                                          : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 hover:shadow-sm"
                                      } disabled:cursor-not-allowed disabled:opacity-50`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-base font-semibold">
                                            {bookingSlotKey === slot.key
                                              ? "Booking..."
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
                                        </div>
                                        <span
                                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${
                                            selectedSlot?.key === slot.key
                                              ? "bg-white/20 text-white ring-white/20"
                                              : "bg-neutral-100 text-neutral-700 ring-neutral-200"
                                          }`}
                                        >
                                          {getSlotSymbol(slot.start_time) === "evening" ? (
                                            <Moon className="h-3.5 w-3.5" strokeWidth={2.25} />
                                          ) : (
                                            <Sun className="h-3.5 w-3.5" strokeWidth={2.25} />
                                          )}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-fit rounded-[1.75rem] border border-neutral-200 bg-white p-5 xl:sticky xl:top-6">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Booking summary
                    </p>

                    {!selectedSlot ? (
                      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                        Select a day and time to see which services fit and complete your booking.
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 rounded-2xl bg-black p-5 text-white">
                          <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                            Selected time
                          </p>
                          <h3 className="mt-2 text-xl font-semibold">
                            {selectedSlot.dayLabel} {selectedSlot.dateLabel}
                          </h3>
                          <p className="mt-2 text-sm text-white/80">
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
                            className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                          >
                            Clear
                          </button>
                        </div>

                        {servicesThatFitSelectedSlot.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                            No services fit inside this time block.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-4">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">
                                Appointment location
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
                                          ? "border-black bg-black text-white"
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
                              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
                                <p className="font-medium text-neutral-900">
                                  {formatModeLabel(selectedServiceMode)} appointment
                                </p>
                                <p className="mt-1">
                                  This booking will use the professional’s saved business location.
                                </p>

                                {professionalBookingAddress ? (
                                  <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
                                    <p className="font-medium text-neutral-900">
                                      📍 {formatDisplayAddress(professionalBookingAddress)}
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
                              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
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
                                    className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-black hover:bg-neutral-50 disabled:opacity-60"
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

                    {!viewerIsCustomer ? (
                      <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                        Sign in as a customer to book a time.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </AccordionSection>
          ) : null}

          {isProfessional ? (
            <AccordionSection
              title="Past work"
              subtitle="Portfolio"
              summary={
                portfolioItems.length > 0
                  ? `${portfolioItems.length} item${portfolioItems.length === 1 ? "" : "s"}`
                  : "No portfolio items yet"
              }
            >

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {portfolioItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={`overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white ${
                      index === 0 ? "sm:col-span-2 sm:row-span-2 lg:col-span-2" : ""
                    }`}
                  >
                    <div
                      className={`bg-neutral-100 ${
                        index === 0 ? "aspect-[4/3] lg:aspect-[5/4]" : "aspect-square"
                      }`}
                    >
                      {item.media_type === "video" ? (
                        <video
                          src={item.image_url}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                          controls
                        />
                      ) : (
                        <img
                          src={item.image_url}
                          alt={item.caption || "Portfolio image"}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="p-4">
                      {item.caption ? (
                        <p className="text-sm text-neutral-700">{item.caption}</p>
                      ) : (
                        <p className="text-sm text-neutral-400">No caption</p>
                      )}
                    </div>
                  </div>
                ))}

                {portfolioItems.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600 sm:col-span-2 lg:col-span-3">
                    No portfolio items yet.
                  </div>
                ) : null}
              </div>
            </AccordionSection>
          ) : null}

          {isProfessional ? (
            <AccordionSection
              title="Client feedback"
              subtitle="Reviews"
              summary={
                reviews.length > 0
                  ? `${reviews.length} review${reviews.length === 1 ? "" : "s"}`
                  : "No reviews yet"
              }
            >

              {reviews.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No reviews yet.
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-4">
                    {visibleReviews.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                              {review.reviewer_avatar_url ? (
                                <img
                                  src={review.reviewer_avatar_url}
                                  alt={review.reviewer_name || "Reviewer"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                                  {review.reviewer_name?.charAt(0).toUpperCase() || "C"}
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="font-semibold text-neutral-900">
                                {review.reviewer_name || "Verified client"}
                              </p>
                              <p className="text-xs text-neutral-400">
                                {formatDate(review.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="text-sm font-medium text-neutral-900">
                            {renderStars(review.rating)} <span className="ml-2">{review.rating}/5</span>
                          </div>
                        </div>

                        {review.comment ? (
                          <p className="mt-4 leading-7 text-neutral-600">{review.comment}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {reviews.length > 4 ? (
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={() => setShowAllReviews((prev) => !prev)}
                        className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                      >
                        {showAllReviews ? "Show fewer reviews" : "Show all reviews"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </AccordionSection>
          ) : null}
        </div>
      </main>

      {pendingBookingChoice ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-2xl">
              📅
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
              Confirm booking
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Make sure the service, time, and location are right before confirming.
            </p>

            <div className="mt-4 space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Service
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {pendingBookingChoice.service.service_name}
                </p>
              </div>

              {formatPrice(pendingBookingChoice.service.price) ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Price
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    {formatPrice(pendingBookingChoice.service.price)}
                  </p>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Date & time
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {formatDate(pendingBookingChoice.slot.date)} · {formatTime(pendingBookingChoice.slot.start_time)} - {formatTime(pendingBookingChoice.slot.end_time)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Appointment type
                </p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {formatModeLabel(pendingBookingChoice.mode)}
                </p>
              </div>

              {pendingBookingChoice.address ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Location
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">
                    📍 {formatDisplayAddress(pendingBookingChoice.address)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const choice = pendingBookingChoice;
                  setPendingBookingChoice(null);
                  handleBookServiceInSlot(choice.service, choice.slot, choice.mode);
                }}
                disabled={bookingSlotKey === pendingBookingChoice.slot.key}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {bookingSlotKey === pendingBookingChoice.slot.key ? "Booking..." : "Confirm booking"}
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

      {confirmingPayment ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Confirming
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">
              Confirming your booking...
            </h2>
            <p className="mt-2 text-sm text-neutral-500">This usually takes a few seconds.</p>
          </div>
        </div>
      ) : null}

      {confirmedBooking ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
              Booking confirmed
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Your appointment is booked. You can view the full details, location, and directions from the booking page.
            </p>

            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              <p className="font-semibold text-neutral-900">
                {confirmedBooking.service_name || "Appointment"}
              </p>
              <p className="mt-1">
                {formatDate(confirmedBooking.booking_date)} · {formatTime(confirmedBooking.start_time)} - {formatTime(confirmedBooking.end_time)}
              </p>
              {confirmedBooking.formatted_address ? (
                <div className="mt-2 text-neutral-600">
                  <p>📍 {formatDisplayAddress(confirmedBooking.formatted_address)}</p>
                  {userLocation && confirmedBooking.location_lat && confirmedBooking.location_lng ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDistance(
                        getDistanceKm(
                          userLocation.lat,
                          userLocation.lng,
                          confirmedBooking.location_lat,
                          confirmedBooking.location_lng
                        )
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/bookings/${confirmedBooking.id}`}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                View booking
              </Link>
              <button
                type="button"
                onClick={() => setConfirmedBooking(null)}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBannerPreview && profile.banner_url ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setShowBannerPreview(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            Close
          </button>

          <div className="flex h-full w-full max-w-6xl items-center justify-center">
            <img
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