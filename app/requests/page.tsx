"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Inbox, Briefcase, Wand2, UserCircle, Images, Star, ClipboardList, Handshake } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";
import WelcomeTour, { type TourStep } from "../components/WelcomeTour";
import OnboardingChecklist from "../components/OnboardingChecklist";

const PROFESSIONAL_TOUR_STEPS: TourStep[] = [
  {
    Icon: Sparkles,
    eyebrow: "Welcome to LineUp",
    title: "Let's get you set up.",
    description:
      "A quick walk through the essentials before your first booking — this'll only take a minute.",
  },
  {
    Icon: Inbox,
    eyebrow: "Your Dashboard",
    title: "Here's where you'll see new requests.",
    description:
      "Clients post exactly what they need, and matching requests from people near you show up right here. Send an offer on the ones you want to take.",
  },
  {
    Icon: Briefcase,
    eyebrow: "Work",
    title: "This is where you manage your bookings.",
    description:
      "Once a client accepts your offer, it becomes a confirmed booking here. After you finish a job, open that booking and tap \"Request completion\" — that's what triggers your payout once the client confirms.",
  },
  {
    Icon: Wand2,
    eyebrow: "Services",
    title: "Add what you offer, your pricing, and your address.",
    description:
      "This is what clients see when deciding whether to book you. If you take in-shop or home studio bookings, add that address here too — it's kept private and only shared with a customer after they've booked.",
  },
  {
    Icon: Images,
    eyebrow: "Show your work",
    title: "Build a portfolio.",
    description:
      "Add photos — or short videos — of work you're proud of. It's the first thing clients look at when deciding who to book, and it lives right on your account page.",
  },
  {
    Icon: UserCircle,
    eyebrow: "Your profile",
    title: "Add a photo and connect your payouts.",
    description:
      "A profile photo helps clients recognize and trust you, and connecting Stripe means you actually get paid once a job is done.",
  },
  {
    Icon: Star,
    eyebrow: "Last step",
    title: "Choose how you want to grow.",
    description:
      "Basic is free and lets you take on real clients right away. Upgrade any time to unlock your own booking calendar for direct bookings, deeper analytics, and higher monthly limits.",
  },
];

const CUSTOMER_TOUR_STEPS: TourStep[] = [
  {
    Icon: Sparkles,
    eyebrow: "Welcome to LineUp",
    title: "Let's find you the right professional.",
    description: "A quick look at how booking works before you post your first request.",
  },
  {
    Icon: ClipboardList,
    eyebrow: "How it works",
    title: "Post what you need, get real offers.",
    description:
      "Share the service, your budget, and when and where you want it done — nearby professionals send you offers, and you pick the one that fits best. After the appointment, you'll confirm it's done right on the booking page so your pro gets paid.",
  },
  {
    Icon: Handshake,
    eyebrow: "Ready to go",
    title: "Post your first request.",
    description:
      "It only takes a minute, and payment is handled securely right in the app once you accept an offer.",
  },
];

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
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
  completed_at?: string | null;
  cancelled_at?: string | null;
  completion_requested_at?: string | null;
  reference_photos: string[] | null;
  preferred_professional_id?: string | null;
  is_direct_rebook?: boolean | null;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  timing_flexibility?: string | null;
  scheduled_date?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
};

type RequestOfferRow = {
  id: string;
  request_id: string;
  viewed_by_customer: boolean | null;
};

type NotificationRow = {
  request_id: string | null;
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
  created_at: string;
  service_id: string | null;
  service_name: string | null;
  duration_minutes: number | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  completion_requested_at: string | null;
  completed_at: string | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  refund_status?: string | null;
};

type EnrichedBooking = BookingRow & {
  professional_name: string | null;
  professional_avatar_url: string | null;
  professional_type: string | null;
};

type ProfessionalWorkBooking = BookingRow & {
  client_name: string | null;
  client_avatar_url: string | null;
};

type UnifiedProfessionalWorkItem =
  | {
      id: string;
      source: "request";
      status: "accepted" | "completion_requested" | "completed";
      title: string;
      subtitle: string | null;
      description: string | null;
      client_name: string | null;
      client_avatar_url: string | null;
      location: string | null;
      formatted_address?: string | null;
      location_lat?: number | null;
      location_lng?: number | null;
      service_mode: string | null;
      service_modes: string[] | null;
      budget: string | null;
      created_at: string;
      completed_at: string | null;
      href: string;
      rawRequest: ServiceRequest;
      sortDate: string;
    }
  | {
      id: string;
      source: "booking";
      status: BookingStatus;
      title: string;
      subtitle: string | null;
      description: string | null;
      client_name: string | null;
      client_avatar_url: string | null;
      location: string | null;
      location_lat?: number | null;
      location_lng?: number | null;
      service_mode: null;
      budget: null;
      created_at: string;
      completed_at: string | null;
      href: string;
      rawBooking: ProfessionalWorkBooking;
      sortDate: string;
    };

type ProfileRow = {
  id: string;
  role: string | null;
  professional_type?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

function normalizeRole(role: string | null | undefined) {
  return role?.toLowerCase().trim() || "";
}

function isCustomerRole(role: string | null | undefined) {
  return normalizeRole(role).includes("customer");
}

function isProfessionalRole(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);
  return !normalizedRole.includes("customer") && !!normalizedRole;
}

function formatCategory(category: string) {
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMode(mode: string | null) {
  if (!mode) return null;
  if (mode === "in_shop") return "In shop";
  if (mode === "at_home") return "At home";
  if (mode === "home_studio") return "Home studio";
  return mode.replaceAll("_", " ");
}

function formatModeList(request: { service_mode: string | null; service_modes?: string[] | null }) {
  const modes = request.service_modes?.length
    ? request.service_modes
    : request.service_mode
    ? [request.service_mode]
    : [];
  return modes.map(formatMode).filter(Boolean).join(" or ") || null;
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBookingDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimingFlexibility(value: string | null | undefined) {
  if (!value) return null;
  if (value === "exact") return "Exact start time";
  if (value === "flexible") return "Flexible start";
  if (value === "anytime") return "Anytime";
  return value;
}

function formatPreferredTiming(request: {
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  timing_flexibility?: string | null;
}) {
  if (request.timing_flexibility === "anytime") {
    return "Anytime — pro will suggest";
  }

  if (request.preferred_date && request.preferred_start_time) {
    return `${formatShortDate(request.preferred_date)} • ${formatTime(
      String(request.preferred_start_time).slice(0, 5)
    )}`;
  }

  if (request.preferred_date) {
    return formatShortDate(request.preferred_date);
  }

  return "Not provided";
}

function formatTime(time: string) {
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
}

function formatProfessionalType(value: string | null) {
  if (!value) return null;
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function userIdFromOpenRequest(request: ServiceRequest) {
  return request.preferred_professional_id;
}

function getBookingDateTime(bookingDate: string, startTime: string) {
  return new Date(`${bookingDate}T${String(startTime).slice(0, 5)}:00`);
}

function getRequestScheduledDateTime(
  scheduledDate: string | null | undefined,
  scheduledStartTime: string | null | undefined,
  fallbackCreatedAt: string
) {
  if (scheduledDate && scheduledStartTime) {
    return new Date(
      `${scheduledDate}T${String(scheduledStartTime).slice(0, 5)}:00`
    );
  }

  return new Date(fallbackCreatedAt);
}

function isDateInRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

function getDistanceKm(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null
) {
  if (
    typeof lat1 !== "number" ||
    typeof lng1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lng2 !== "number"
  ) {
    return null;
  }

  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(distance) ? distance : null;
}

function formatDistanceLabel(distanceKm: number | null) {
  if (distanceKm === null) return null;
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

function formatDisplayAddress(address: string | null | undefined) {
  if (!address?.trim()) return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      primary: parts[0],
      secondary: parts.slice(1, 3).join(", "),
      full: address,
    };
  }

  if (parts.length === 2) {
    return {
      primary: parts[0],
      secondary: parts[1],
      full: address,
    };
  }

  return {
    primary: address,
    secondary: null,
    full: address,
  };
}

function getMapsUrl(lat?: number | null, lng?: number | null, address?: string | null) {
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return null;
}

// Keyless Google Maps embed (google.com/maps?...&output=embed) instead of the
// paid Static Maps REST API — same technique already used and working on the
// request detail page, doesn't depend on Maps Platform billing being enabled.
function getMapEmbedUrl(lat?: number | null, lng?: number | null, address?: string | null) {
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  }

  if (address?.trim()) {
    return `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&z=15&output=embed`;
  }

  return null;
}

function UberLocationCard({
  address,
  lat,
  lng,
  compact = false,
  interactive = true,
  userLat = null,
  userLng = null,
}: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  compact?: boolean;
  interactive?: boolean;
  userLat?: number | null;
  userLng?: number | null;
}) {
  const displayAddress = formatDisplayAddress(address);
  const mapsUrl = getMapsUrl(lat, lng, address);
  const mapEmbedUrl = getMapEmbedUrl(lat, lng, address);
  const distanceLabel = formatDistanceLabel(getDistanceKm(userLat, userLng, lat, lng));

  if (!displayAddress) return null;

  return (
    <div className={`overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 ${compact ? "mt-3" : "mt-5"}`}>
      <div className="flex items-stretch">
        <div className="flex min-w-0 flex-1 gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-sm text-white">
            📍
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Location
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-neutral-900">
              {displayAddress.primary}
            </p>
            {displayAddress.secondary ? (
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {displayAddress.secondary}
              </p>
            ) : null}
            {distanceLabel ? (
              <p className="mt-1 text-xs font-medium text-neutral-500">
                {distanceLabel}
              </p>
            ) : null}
            {mapsUrl && interactive ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-xs font-semibold text-neutral-900 underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                Open in Maps
              </a>
            ) : mapsUrl ? (
              <span className="mt-2 inline-flex text-xs font-semibold text-neutral-900">
                Tap card for details
              </span>
            ) : null}
          </div>
        </div>

        {mapEmbedUrl ? (
          <div className="hidden w-32 shrink-0 overflow-hidden border-l border-neutral-200 bg-neutral-100 sm:block">
            <iframe
              title="Location map"
              src={mapEmbedUrl}
              width="100%"
              height="100%"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="block h-full min-h-[112px] w-full border-0"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type RequestsCache = {
  role: string | null;
  userId: string | null;
  userName: string | null;
  requests: ServiceRequest[];
  bookings: EnrichedBooking[];
  professionalBookings: ProfessionalWorkBooking[];
  respondedRequestIds: string[];
  professionalUnreadRequestIds: string[];
  offerCountsByRequest: Record<string, number>;
  unreadOfferCountsByRequest: Record<string, number>;
};

export default function RequestsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<RequestsCache>("requests-page"));
  const [role, setRole] = useState<string | null>(() => getCached<RequestsCache>("requests-page")?.role ?? null);
  const [userId, setUserId] = useState<string | null>(() => getCached<RequestsCache>("requests-page")?.userId ?? null);
  const [userName, setUserName] = useState<string | null>(() => getCached<RequestsCache>("requests-page")?.userName ?? null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [requests, setRequests] = useState<ServiceRequest[]>(() => getCached<RequestsCache>("requests-page")?.requests ?? []);
  const [bookings, setBookings] = useState<EnrichedBooking[]>(() => getCached<RequestsCache>("requests-page")?.bookings ?? []);
  const [professionalBookings, setProfessionalBookings] = useState<
    ProfessionalWorkBooking[]
  >(() => getCached<RequestsCache>("requests-page")?.professionalBookings ?? []);

  const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>(() => getCached<RequestsCache>("requests-page")?.respondedRequestIds ?? []);
  const [professionalUnreadRequestIds, setProfessionalUnreadRequestIds] =
    useState<string[]>(() => getCached<RequestsCache>("requests-page")?.professionalUnreadRequestIds ?? []);
  const [offerCountsByRequest, setOfferCountsByRequest] = useState<
    Record<string, number>
  >(() => getCached<RequestsCache>("requests-page")?.offerCountsByRequest ?? {});
  const [unreadOfferCountsByRequest, setUnreadOfferCountsByRequest] = useState<
    Record<string, number>
  >(() => getCached<RequestsCache>("requests-page")?.unreadOfferCountsByRequest ?? {});

  const [message, setMessage] = useState("");
  const [bookingActionLoadingId, setBookingActionLoadingId] = useState<
    string | null
  >(null);
  const [cancelBookingConfirmId, setCancelBookingConfirmId] = useState<string | null>(null);

  const hasLoadedOnceRef = useRef(false);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hydrateCustomerData = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("service_requests")
      .select("*")
      .eq("client_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const customerRequests = (data as ServiceRequest[]) || [];
    setRequests(customerRequests);

    const requestIds = customerRequests.map((r) => r.id);

    if (requestIds.length > 0) {
      const { data: offersData, error: offersError } = await supabase
        .from("request_offers")
        .select("id, request_id, viewed_by_customer")
        .in("request_id", requestIds);

      if (offersError) throw new Error(offersError.message);

      const totalOfferCounts: Record<string, number> = {};
      const unreadCounts: Record<string, number> = {};

      ((offersData as RequestOfferRow[]) || []).forEach((offer) => {
        totalOfferCounts[offer.request_id] =
          (totalOfferCounts[offer.request_id] || 0) + 1;

        if (!offer.viewed_by_customer) {
          unreadCounts[offer.request_id] =
            (unreadCounts[offer.request_id] || 0) + 1;
        }
      });

      setOfferCountsByRequest(totalOfferCounts);
      setUnreadOfferCountsByRequest(unreadCounts);
    } else {
      setOfferCountsByRequest({});
      setUnreadOfferCountsByRequest({});
    }

    const { data: customerBookingsData, error: customerBookingsError } =
      await supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, refund_status"
        )
        .eq("customer_id", userId)
        .order("booking_date", { ascending: false })
        .order("start_time", { ascending: false });

    if (customerBookingsError) throw new Error(customerBookingsError.message);

    const customerBookings = (customerBookingsData as BookingRow[]) || [];
    const professionalIds = [
      ...new Set(
        customerBookings
          .map((booking) => booking.professional_id)
          .filter(Boolean)
      ),
    ];

    let professionalMap = new Map<
      string,
      {
        full_name: string | null;
        avatar_url: string | null;
        professional_type: string | null;
      }
    >();

    if (professionalIds.length > 0) {
      const {
        data: professionalProfiles,
        error: professionalProfilesError,
      } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, professional_type")
        .in("id", professionalIds);

      if (professionalProfilesError) {
        throw new Error(professionalProfilesError.message);
      }

      professionalMap = new Map(
        (professionalProfiles || []).map((pro) => [
          pro.id,
          {
            full_name: pro.full_name ?? null,
            avatar_url: pro.avatar_url ?? null,
            professional_type: pro.professional_type ?? null,
          },
        ])
      );
    }

    const enrichedBookings: EnrichedBooking[] = customerBookings.map((booking) => {
      const professional = professionalMap.get(booking.professional_id);

      return {
        ...booking,
        start_time: String(booking.start_time).slice(0, 5),
        end_time: String(booking.end_time).slice(0, 5),
        professional_name: professional?.full_name ?? null,
        professional_avatar_url: professional?.avatar_url ?? null,
        professional_type: professional?.professional_type ?? null,
      };
    });

    setBookings(enrichedBookings);
    setProfessionalBookings([]);
    setProfessionalUnreadRequestIds([]);
    setRespondedRequestIds([]);
  }, []);

  const hydrateProfessionalData = useCallback(async (userId: string) => {
    const { data: allRequests, error: allRequestsError } = await supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (allRequestsError) throw new Error(allRequestsError.message);

    const { data: trackedRequests, error: trackedRequestsError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("accepted_professional_id", userId)
      .in("status", ["accepted", "completion_requested", "completed"])
      .order("created_at", { ascending: false });

    if (trackedRequestsError) throw new Error(trackedRequestsError.message);

    const myTrackedRequests: ServiceRequest[] = trackedRequests ?? [];
    const mergedRequestsMap = new Map<string, ServiceRequest>();

    ((allRequests as ServiceRequest[]) ?? []).forEach((item) => {
      mergedRequestsMap.set(item.id, item);
    });

    myTrackedRequests.forEach((item) => {
      mergedRequestsMap.set(item.id, item);
    });

    const mergedRequests = Array.from(mergedRequestsMap.values())
      .filter((request) => {
        if (request.is_direct_rebook) {
          return request.preferred_professional_id === userId;
        }

        return (
          request.status === "open" ||
          request.accepted_professional_id === userId
        );
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    setRequests(mergedRequests);
    setBookings([]);

    const { data: offers, error: offersError } = await supabase
      .from("request_offers")
      .select("request_id")
      .eq("professional_id", userId);

    if (offersError) throw new Error(offersError.message);

    const uniqueRespondedIds = Array.from(
      new Set(
        (offers ?? [])
          .map((offer) => offer.request_id)
          .filter((id): id is string => !!id)
      )
    );
    setRespondedRequestIds(uniqueRespondedIds);

    const { data: notifications, error: notificationsError } = await supabase
      .from("notifications")
      .select("request_id")
      .eq("user_id", userId)
      .eq("is_read", false);

    if (notificationsError) {
      console.error("Error loading unread notifications:", notificationsError);
      setProfessionalUnreadRequestIds([]);
    } else {
      const unreadIds = Array.from(
        new Set(
          ((notifications as NotificationRow[]) ?? [])
            .map((item) => item.request_id)
            .filter((id): id is string => !!id)
        )
      );

      setProfessionalUnreadRequestIds(unreadIds);
    }

    const { data: professionalBookingsData, error: professionalBookingsError } =
      await supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, refund_status"
        )
        .eq("professional_id", userId)
        .in("status", ["confirmed", "completion_requested", "completed", "cancelled"])
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (professionalBookingsError) {
      throw new Error(professionalBookingsError.message);
    }

    const proBookings = (professionalBookingsData as BookingRow[]) || [];
    const customerIds = [
      ...new Set(proBookings.map((booking) => booking.customer_id).filter(Boolean)),
    ];

    let customerMap = new Map<
      string,
      { full_name: string | null; avatar_url: string | null }
    >();

    if (customerIds.length > 0) {
      const { data: customerProfiles, error: customerProfilesError } =
        await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", customerIds);

      if (customerProfilesError) {
        throw new Error(customerProfilesError.message);
      }

      customerMap = new Map(
        (customerProfiles || []).map((customer) => [
          customer.id,
          {
            full_name: customer.full_name ?? null,
            avatar_url: customer.avatar_url ?? null,
          },
        ])
      );
    }

    const enrichedProfessionalBookings: ProfessionalWorkBooking[] = proBookings.map(
      (booking) => {
        const customer = customerMap.get(booking.customer_id);

        return {
          ...booking,
          start_time: String(booking.start_time).slice(0, 5),
          end_time: String(booking.end_time).slice(0, 5),
          client_name: customer?.full_name ?? null,
          client_avatar_url: customer?.avatar_url ?? null,
        };
      }
    );

    setProfessionalBookings(enrichedProfessionalBookings);
    setOfferCountsByRequest({});
    setUnreadOfferCountsByRequest({});
  }, []);

  const loadRequestsLive = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoading(true);
      }

      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, professional_type, full_name, location_lat, location_lng")
        .eq("id", user.id)
        .single();

if (profileError || !profile) {
  router.push("/onboarding");
  return;
}

      const typedProfile = profile as ProfileRow;
      const userRole = typedProfile.role;
      setRole(userRole);
      setUserId(user.id);
      setUserName(typedProfile.full_name ?? null);

      if (
        typeof typedProfile.location_lat === "number" &&
        typeof typedProfile.location_lng === "number"
      ) {
        setUserLocation({
          lat: typedProfile.location_lat,
          lng: typedProfile.location_lng,
        });
      }

      try {
        if (isCustomerRole(userRole)) {
          await hydrateCustomerData(user.id);
        } else if (isProfessionalRole(userRole)) {
          await hydrateProfessionalData(user.id);
        } else {
          setMessage("Invalid account role.");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Something went wrong.";
        setMessage(errorMessage);
      } finally {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    },
    [hydrateCustomerData, hydrateProfessionalData, router]
  );

  useEffect(() => {
    if (userLocation) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // Distance is optional. If browser location is denied and the user
        // does not have saved profile coordinates, cards still work normally.
      }
    );
  }, [userLocation]);

  useEffect(() => {
    loadRequestsLive({ silent: !!getCached<RequestsCache>("requests-page") });
  }, [loadRequestsLive]);

  useEffect(() => {
    if (!loading && role) {
      setCached<RequestsCache>("requests-page", {
        role,
        userId,
        userName,
        requests,
        bookings,
        professionalBookings,
        respondedRequestIds,
        professionalUnreadRequestIds,
        offerCountsByRequest,
        unreadOfferCountsByRequest,
      });
    }
  }, [loading, role, userId, userName, requests, bookings, professionalBookings, respondedRequestIds, professionalUnreadRequestIds, offerCountsByRequest, unreadOfferCountsByRequest]);

  useEffect(() => {
    if (!role) return;

    const queueSilentReload = () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }

      reloadTimeoutRef.current = setTimeout(() => {
        loadRequestsLive({ silent: hasLoadedOnceRef.current });
      }, 250);
    };

    const channel = supabase
      .channel("requests-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        queueSilentReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_offers",
        },
        queueSilentReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        queueSilentReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
        },
        queueSilentReload
      )
      .subscribe();

    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [role, loadRequestsLive]);

  async function handleConfirmBookingCompletion(bookingId: string) {
    try {
      setBookingActionLoadingId(bookingId);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const completedAt = new Date().toISOString();

      const { error } = await supabase
        .from("bookings")
        .update({
          status: "completed",
          completed_at: completedAt,
        })
        .eq("id", bookingId)
        .eq("customer_id", user.id)
        .eq("status", "completion_requested");

      if (error) {
        setMessage(error.message);
        return;
      }

      setBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status: "completed",
                completed_at: completedAt,
              }
            : booking
        )
      );

      setMessage("Booking marked as completed.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong confirming completion.");
    } finally {
      setBookingActionLoadingId(null);
    }
  }

  async function handleCancelBooking(bookingId: string) {
    setCancelBookingConfirmId(null);

    try {
      setBookingActionLoadingId(bookingId);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not cancel this booking.");
        return;
      }

      setBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status: "cancelled",
                cancelled_by: user.id,
                cancelled_at: data.cancelledAt,
              }
            : booking
        )
      );

      setMessage("Booking cancelled.");
      await loadRequestsLive({ silent: true });
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong cancelling this booking.");
    } finally {
      setBookingActionLoadingId(null);
    }
  }

  const normalizedRole = role?.toLowerCase() || "";
  const isCustomer = normalizedRole.includes("customer");
  const isProfessional = !isCustomer && !!normalizedRole;

  const activeRequests = useMemo(
    () => requests.filter((request) => request.status !== "completed" && request.status !== "cancelled"),
    [requests]
  );

  const completedRequests = useMemo(
    () => requests.filter((request) => request.status === "completed"),
    [requests]
  );

  const cancelledRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== "cancelled" || !request.cancelled_at) return false;
        return Date.now() - new Date(request.cancelled_at).getTime() <= 24 * 60 * 60 * 1000;
      }),
    [requests]
  );

  const activeBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === "confirmed" ||
          booking.status === "completion_requested"
      ),
    [bookings]
  );

  const completedBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "completed"),
    [bookings]
  );

  const cancelledBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (booking.status !== "cancelled" || !booking.cancelled_at) return false;
        return Date.now() - new Date(booking.cancelled_at).getTime() <= 24 * 60 * 60 * 1000;
      }),
    [bookings]
  );

  const professionalOpenRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== "open") return false;
        if (request.is_direct_rebook) {
          return request.preferred_professional_id === userId;
        }
        return true;
      }),
    [requests, userId]
  );

  const professionalTrackedRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          !!request.accepted_professional_id &&
          (request.status === "accepted" ||
            request.status === "completion_requested" ||
            request.status === "completed")
      ),
    [requests]
  );

  const professionalUpcomingRequests = useMemo(
    () =>
      professionalTrackedRequests.filter(
        (request) =>
          request.status === "accepted" ||
          request.status === "completion_requested"
      ),
    [professionalTrackedRequests]
  );

  const professionalCompletedRequests = useMemo(
    () =>
      professionalTrackedRequests.filter(
        (request) => request.status === "completed"
      ),
    [professionalTrackedRequests]
  );

  const professionalUpcomingBookings = useMemo(() => {
    return professionalBookings.filter(
      (booking) =>
        booking.status === "confirmed" ||
        booking.status === "completion_requested"
    );
  }, [professionalBookings]);

  const cancelledProfessionalBookings = useMemo(
    () =>
      professionalBookings.filter((booking) => {
        if (booking.status !== "cancelled" || !booking.cancelled_at) return false;
        return Date.now() - new Date(booking.cancelled_at).getTime() <= 24 * 60 * 60 * 1000;
      }),
    [professionalBookings]
  );

  const professionalCompletedBookings = useMemo(() => {
    const upcomingIds = new Set(
      professionalBookings
        .filter(
          (booking) =>
            booking.status === "confirmed" ||
            booking.status === "completion_requested"
        )
        .map((booking) => booking.id)
    );

    return professionalBookings.filter(
      (booking) => booking.status === "completed" && !upcomingIds.has(booking.id)
    );
  }, [professionalBookings]);

  const unifiedProfessionalUpcomingWork = useMemo(() => {
    const requestItems: UnifiedProfessionalWorkItem[] =
      professionalUpcomingRequests.map((request) => ({
        id: request.id,
        source: "request",
        status:
          request.status === "completion_requested"
            ? "completion_requested"
            : "accepted",
        title: request.title,
        subtitle:
          request.scheduled_date &&
          request.scheduled_start_time &&
          request.scheduled_end_time
            ? `${formatBookingDate(request.scheduled_date)} • ${formatTime(
                request.scheduled_start_time
              )} - ${formatTime(request.scheduled_end_time)}`
            : request.service_detail || null,
        description: request.description || null,
        client_name: null,
        client_avatar_url: null,
        location: request.formatted_address || request.location || null,
        formatted_address: request.formatted_address || null,
        location_lat: request.location_lat ?? null,
        location_lng: request.location_lng ?? null,
        service_mode: request.service_mode || null,
        service_modes: request.service_modes || null,
        budget: request.budget || null,
        created_at: request.created_at,
        completed_at: request.completed_at || null,
        href: `/requests/${request.id}`,
        rawRequest: request,
        sortDate: getRequestScheduledDateTime(
          request.scheduled_date,
          request.scheduled_start_time,
          request.created_at
        ).toISOString(),
      }));

    const bookingItems: UnifiedProfessionalWorkItem[] =
      professionalUpcomingBookings.map((booking) => ({
        id: booking.id,
        source: "booking",
        status: booking.status,
        title: booking.service_name || "Booked service",
        subtitle: `${formatBookingDate(booking.booking_date)} • ${formatTime(
          booking.start_time
        )} - ${formatTime(booking.end_time)}`,
        description: null,
        client_name: booking.client_name || null,
        client_avatar_url: booking.client_avatar_url || null,
        location: booking.formatted_address || null,
        location_lat: booking.location_lat ?? null,
        location_lng: booking.location_lng ?? null,
        service_mode: null,
        budget: null,
        created_at: booking.created_at,
        completed_at: booking.completed_at || null,
        href: `/bookings/${booking.id}`,
        rawBooking: booking,
        sortDate: getBookingDateTime(
          booking.booking_date,
          booking.start_time
        ).toISOString(),
      }));

    return [...requestItems, ...bookingItems].sort(
      (a, b) =>
        new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime()
    );
  }, [professionalUpcomingRequests, professionalUpcomingBookings]);

  const unifiedProfessionalCompletedWork = useMemo(() => {
    const requestItems: UnifiedProfessionalWorkItem[] =
      professionalCompletedRequests.map((request) => ({
        id: request.id,
        source: "request",
        status: "completed",
        title: request.title,
        subtitle:
          request.scheduled_date &&
          request.scheduled_start_time &&
          request.scheduled_end_time
            ? `${formatBookingDate(request.scheduled_date)} • ${formatTime(
                request.scheduled_start_time
              )} - ${formatTime(request.scheduled_end_time)}`
            : request.service_detail || null,
        description: request.description || null,
        client_name: null,
        client_avatar_url: null,
        location: request.formatted_address || request.location || null,
        formatted_address: request.formatted_address || null,
        location_lat: request.location_lat ?? null,
        location_lng: request.location_lng ?? null,
        service_mode: request.service_mode || null,
        service_modes: request.service_modes || null,
        budget: request.budget || null,
        created_at: request.created_at,
        completed_at: request.completed_at || null,
        href: `/requests/${request.id}`,
        rawRequest: request,
        sortDate: request.completed_at || request.created_at,
      }));

    const bookingItems: UnifiedProfessionalWorkItem[] =
      professionalCompletedBookings.map((booking) => ({
        id: booking.id,
        source: "booking",
        status: "completed",
        title: booking.service_name || "Booked service",
        subtitle: `${formatBookingDate(booking.booking_date)} • ${formatTime(
          booking.start_time
        )} - ${formatTime(booking.end_time)}`,
        description: null,
        client_name: booking.client_name || null,
        client_avatar_url: booking.client_avatar_url || null,
        location: booking.formatted_address || null,
        location_lat: booking.location_lat ?? null,
        location_lng: booking.location_lng ?? null,
        service_mode: null,
        budget: null,
        created_at: booking.created_at,
        completed_at: booking.completed_at || null,
        href: `/bookings/${booking.id}`,
        rawBooking: booking,
        sortDate: booking.completed_at || booking.created_at,
      }));

    return [...requestItems, ...bookingItems].sort(
      (a, b) =>
        new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );
  }, [professionalCompletedRequests, professionalCompletedBookings]);

  const now = useMemo(
    () => new Date(),
    [requests, bookings, professionalBookings]
  );

  const sevenDaysFromNow = useMemo(() => {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return end;
  }, [now]);

  const currentMonthStart = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
    [now]
  );

  const nextMonthStart = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + 1, 1),
    [now]
  );

  const professionalWeekAtGlanceWork = useMemo(() => {
    return unifiedProfessionalUpcomingWork.filter((item) => {
      if (item.source === "booking") {
        const bookingDate = getBookingDateTime(
          item.rawBooking.booking_date,
          item.rawBooking.start_time
        );
        return isDateInRange(bookingDate, now, sevenDaysFromNow);
      }

      const requestDate = getRequestScheduledDateTime(
        item.rawRequest.scheduled_date,
        item.rawRequest.scheduled_start_time,
        item.rawRequest.created_at
      );
      return isDateInRange(requestDate, now, sevenDaysFromNow);
    });
  }, [unifiedProfessionalUpcomingWork, now, sevenDaysFromNow]);

  const monthlyCompletedJobsCount = useMemo(() => {
    const completedRequestsThisMonth = professionalCompletedRequests.filter(
      (request) => {
        const completedDate = new Date(request.completed_at || request.created_at);
        return isDateInRange(completedDate, currentMonthStart, nextMonthStart);
      }
    ).length;

    const completedBookingsThisMonth = professionalCompletedBookings.filter(
      (booking) => {
        const completedDate = new Date(booking.completed_at || booking.created_at);
        return isDateInRange(completedDate, currentMonthStart, nextMonthStart);
      }
    ).length;

    return completedRequestsThisMonth + completedBookingsThisMonth;
  }, [
    professionalCompletedRequests,
    professionalCompletedBookings,
    currentMonthStart,
    nextMonthStart,
  ]);

  const monthlyUpcomingCount = useMemo(() => {
    const upcomingRequestsThisMonth = professionalUpcomingRequests.filter(
      (request) => {
        const requestDate = getRequestScheduledDateTime(
          request.scheduled_date,
          request.scheduled_start_time,
          request.created_at
        );
        return isDateInRange(requestDate, currentMonthStart, nextMonthStart);
      }
    ).length;

    const upcomingBookingsThisMonth = professionalUpcomingBookings.filter(
      (booking) => {
        const bookingDate = getBookingDateTime(
          booking.booking_date,
          booking.start_time
        );
        return isDateInRange(bookingDate, currentMonthStart, nextMonthStart);
      }
    ).length;

    return upcomingRequestsThisMonth + upcomingBookingsThisMonth;
  }, [
    professionalUpcomingRequests,
    professionalUpcomingBookings,
    currentMonthStart,
    nextMonthStart,
  ]);

  const monthlyOpportunitiesCount = useMemo(() => {
    return professionalOpenRequests.filter((request) => {
      const requestDate = new Date(request.created_at);
      return isDateInRange(requestDate, currentMonthStart, nextMonthStart);
    }).length;
  }, [professionalOpenRequests, currentMonthStart, nextMonthStart]);

if (loading) {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


      <div className="mx-auto max-w-6xl py-8">
        <div>
            <div className="max-w-3xl">
              <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-neutral-200 md:h-16" />
              <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded-full bg-neutral-100" />
              <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
            </div>

            <div className="mt-10 grid gap-6">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex gap-4">
                    <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />

                    <div className="flex-1">
                      <div className="flex gap-2">
                        <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-100" />
                        <div className="h-6 w-28 animate-pulse rounded-full bg-neutral-100" />
                      </div>

                      <div className="mt-5 h-7 w-2/3 animate-pulse rounded-xl bg-neutral-200" />
                      <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-neutral-100" />

                      <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                        <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                        <div className="h-20 animate-pulse rounded-2xl bg-neutral-50" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

return (
  <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


    <div className="mx-auto max-w-6xl py-8">
      <div>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Dashboard
              </p>

              <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
                Welcome back{userName ? `, ${userName.split(" ")[0]}` : ""}.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                {isCustomer
                  ? "Track your requests, bookings, and completed services in one place."
                  : "Here’s what’s happening with your work this week."}
              </p>
            </div>

            {isCustomer ? (
              <Link
                href="/requests/new"
                className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                New request
              </Link>
            ) : null}
          </div>

          {isProfessional && userId ? (
            <>
              <WelcomeTour
                userId={userId}
                role="professional"
                steps={PROFESSIONAL_TOUR_STEPS}
                finalCtaLabel="View subscription plans"
                finalCtaHref="/subscription"
              />
              <OnboardingChecklist userId={userId} />
            </>
          ) : null}

          {isCustomer && userId ? (
            <WelcomeTour
              userId={userId}
              role="customer"
              steps={CUSTOMER_TOUR_STEPS}
              finalCtaLabel="Post your first request"
              finalCtaHref="/requests/new"
            />
          ) : null}

          {message ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          {!message && isCustomer && requests.length === 0 && bookings.length === 0 ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                <svg viewBox="0 0 20 20" className="h-6 w-6 text-neutral-400" fill="none">
                  <path d="M10 2C6.686 2 4 4.686 4 8c0 4 6 10 6 10s6-6 6-10c0-3.314-2.686-6-6-6z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">You're all set up</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Post your first request and professionals in your area will send you offers to compare.
              </p>
              <Link
                href="/requests/new"
                className="mt-5 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Post a request
              </Link>
            </div>
          ) : null}

          {!message &&
          isProfessional &&
          professionalOpenRequests.length === 0 &&
          unifiedProfessionalUpcomingWork.length === 0 &&
          unifiedProfessionalCompletedWork.length === 0 ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                <svg viewBox="0 0 20 20" className="h-6 w-6 text-neutral-400" fill="none">
                  <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">Ready for your first job</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Make sure your services, availability, and service area are set up so clients can find you.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href="/services" className="inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                  Set up services
                </Link>
                <Link href="/services#availability" className="inline-flex rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50">
                  Set availability
                </Link>
              </div>
            </div>
          ) : null}

          {isCustomer ? (
            <>
              <div className="mt-10">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Active bookings
                </h2>

                {activeBookings.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                      <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                        <path d="M6 2v2M14 2v2M3 8h14M4 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900">No active bookings</p>
                    <p className="mt-1 text-sm text-neutral-500">Confirmed upcoming services will appear here.</p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {activeBookings.map((booking) => {
                      const isLoadingAction =
                        bookingActionLoadingId === booking.id;

                      return (
                        <div
                          key={booking.id}
                          className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
                        >
                          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 flex-1 gap-4">
                              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                                {booking.professional_avatar_url ? (
                                  <img
                                    src={booking.professional_avatar_url}
                                    alt={booking.professional_name || "Professional"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                                    {booking.professional_name
                                      ?.charAt(0)
                                      .toUpperCase() || "P"}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 max-w-3xl">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                    Booking
                                  </span>

                                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                    {booking.status === "completion_requested"
                                      ? "Awaiting confirmation"
                                      : booking.status}
                                  </span>

                                  {booking.professional_type ? (
                                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                      {formatProfessionalType(
                                        booking.professional_type
                                      )}
                                    </span>
                                  ) : null}
                                </div>

                                <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                  {booking.service_name || "Booked service"}
                                </h2>

                                <p className="mt-3 text-neutral-600">
                                  {formatBookingDate(booking.booking_date)} •{" "}
                                  {formatTime(booking.start_time)} -{" "}
                                  {formatTime(booking.end_time)}
                                </p>

                                <p className="mt-2 text-neutral-600">
                                  With {booking.professional_name || "Professional"}
                                </p>

                                <UberLocationCard
                                  address={booking.formatted_address}
                                  lat={booking.location_lat}
                                  lng={booking.location_lng}
                                  compact
                              userLat={userLocation?.lat}
                              userLng={userLocation?.lng}
                                />
                              </div>
                            </div>

                            <p className="shrink-0 text-sm text-neutral-500">
                              Created {formatDateTime(booking.created_at)}
                            </p>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-2">
                            {booking.duration_minutes ? (
                              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                {booking.duration_minutes} min
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                              href={`/bookings/${booking.id}`}
                              className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              View booking
                            </Link>

                            {booking.status === "completion_requested" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleConfirmBookingCompletion(booking.id)
                                }
                                disabled={isLoadingAction}
                                className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                              >
                                {isLoadingAction
                                  ? "Confirming..."
                                  : "Confirm completion"}
                              </button>
                            ) : null}

                            {(booking.status === "confirmed" ||
                              booking.status === "completion_requested") ? (
                              cancelBookingConfirmId === booking.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-neutral-600">Cancel booking?</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelBooking(booking.id)}
                                    disabled={isLoadingAction}
                                    className="inline-flex rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                                  >
                                    Yes, cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancelBookingConfirmId(null)}
                                    className="inline-flex rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-50"
                                  >
                                    Keep
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setCancelBookingConfirmId(booking.id)}
                                  disabled={isLoadingAction}
                                  className="inline-flex rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                                >
                                  Cancel booking
                                </button>
                              )
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {activeRequests.length > 0 ? (
                <div className="mt-10">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Active requests
                  </h2>

                  <div className="mt-6 grid gap-6">
                    {activeRequests.map((request) => (
                      <Link
                        key={request.id}
                        href={`/requests/${request.id}`}
                        className="block rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            {request.reference_photos &&
                            request.reference_photos.length > 0 ? (
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                                <img
                                  src={request.reference_photos[0]}
                                  alt="Reference preview"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : null}

                            <div className="min-w-0 max-w-3xl">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {formatCategory(request.category)}
                                  {request.service_detail
                                    ? ` • ${request.service_detail}`
                                    : ""}
                                </span>

                                {request.is_direct_rebook ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800">
                                    Direct rebook
                                  </span>
                                ) : null}

                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {request.status === "open"
                                    ? "Pending"
                                    : request.status === "accepted"
                                    ? "Accepted"
                                    : request.status === "completion_requested"
                                    ? "Awaiting confirmation"
                                    : request.status}
                                </span>

                                {unreadOfferCountsByRequest[request.id] ? (
                                  <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                                    {unreadOfferCountsByRequest[request.id]} of{" "}
                                    {offerCountsByRequest[request.id] || 0} offers new
                                  </span>
                                ) : null}
                              </div>

                              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                {request.title}
                              </h2>

                              {request.description ? (
                                <p className="mt-3 text-neutral-600 line-clamp-3">
                                  {request.description}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <p className="shrink-0 text-sm text-neutral-500">
                            Posted {formatDateTime(request.created_at)}
                          </p>
                        </div>

                              <div className="mt-5 flex flex-wrap gap-2">
                                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                  {formatPreferredTiming(request)}
                                </span>
                                {request.timing_flexibility ? (
                                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                    {formatTimingFlexibility(request.timing_flexibility)}
                                  </span>
                                ) : null}
                                {formatModeList(request) ? (
                                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                    {formatModeList(request)}
                                  </span>
                                ) : null}
                                {request.budget ? (
                                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                                    {request.budget}
                                  </span>
                                ) : null}
                              </div>

                              <UberLocationCard
                                address={request.formatted_address || request.location}
                                lat={request.location_lat}
                                lng={request.location_lng}
                                interactive={false}
                                userLat={userLocation?.lat}
                                userLng={userLocation?.lng}
                              />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {completedBookings.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Completed bookings
                  </h2>

                  <div className="mt-6 grid gap-6">
                    {completedBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                              {booking.professional_avatar_url ? (
                                <img
                                  src={booking.professional_avatar_url}
                                  alt={booking.professional_name || "Professional"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                                  {booking.professional_name
                                    ?.charAt(0)
                                    .toUpperCase() || "P"}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 max-w-3xl">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  Booking
                                </span>

                                <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                                  Completed
                                </span>
                              </div>

                              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                {booking.service_name || "Booked service"}
                              </h2>

                              <p className="mt-3 text-neutral-600">
                                {formatBookingDate(booking.booking_date)} •{" "}
                                {formatTime(booking.start_time)} -{" "}
                                {formatTime(booking.end_time)}
                              </p>

                              <p className="mt-2 text-neutral-600">
                                With {booking.professional_name || "Professional"}
                              </p>

                              <UberLocationCard
                                address={booking.formatted_address}
                                lat={booking.location_lat}
                                lng={booking.location_lng}
                                compact
                              userLat={userLocation?.lat}
                              userLng={userLocation?.lng}
                              />
                            </div>
                          </div>

                          <p className="shrink-0 text-sm text-neutral-500">
                            Completed{" "}
                            {booking.completed_at
                              ? formatDateTime(booking.completed_at)
                              : formatDateTime(booking.created_at)}
                          </p>
                        </div>

                        <div className="mt-6">
                          <Link
                            href={`/bookings/${booking.id}`}
                            className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                          >
                            View booking
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {cancelledBookings.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Cancelled bookings
                  </h2>

                  <div className="mt-6 grid gap-4">
                    {cancelledBookings.map((booking) => (
                      <Link
                        key={booking.id}
                        href={`/bookings/${booking.id}`}
                        className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                            Cancelled
                          </span>
                          {booking.refund_status === "refunded" ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Refunded
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-tight">
                          {booking.service_name || "Booked service"}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatBookingDate(booking.booking_date)} • With{" "}
                          {booking.professional_name || "Professional"}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {completedRequests.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Completed services
                  </h2>

                  <div className="mt-6 grid gap-6">
                    {completedRequests.map((request) => (
                      <div
                        key={request.id}
                        className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                      >
                        <Link href={`/requests/${request.id}`}>
                          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 flex-1 gap-4">
                              {request.reference_photos &&
                              request.reference_photos.length > 0 ? (
                                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                                  <img
                                    src={request.reference_photos[0]}
                                    alt="Reference preview"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : null}

                              <div className="min-w-0 max-w-3xl">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                    {formatCategory(request.category)}
                                    {request.service_detail
                                      ? ` • ${request.service_detail}`
                                      : ""}
                                  </span>

                                  {request.is_direct_rebook ? (
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800">
                                      Direct rebook
                                    </span>
                                  ) : null}

                                  <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                                    Completed
                                  </span>
                                </div>

                                <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                  {request.title}
                                </h2>

                                {request.description ? (
                                  <p className="mt-3 text-neutral-600 line-clamp-3">
                                    {request.description}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <p className="shrink-0 text-sm text-neutral-500">
                              Posted {formatDateTime(request.created_at)}
                            </p>
                          </div>
                        </Link>

                        {request.accepted_professional_id ? (
                          <div className="mt-6">
                            <Link
                              href={`/requests/new?rebook=1&pro=${request.accepted_professional_id}&request=${request.id}`}
                              className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              Book again
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {cancelledRequests.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Cancelled requests
                  </h2>

                  <div className="mt-6 grid gap-4">
                    {cancelledRequests.map((request) => (
                      <Link
                        key={request.id}
                        href={`/requests/${request.id}`}
                        className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                            {formatCategory(request.category)}
                          </span>
                          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                            Cancelled
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-tight">
                          {request.title}
                        </h3>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {isProfessional ? (
            <>
              <div className="mt-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Week at a glance
                  </h2>

                  <Link
                    href="/calendar"
                    className="text-sm font-medium text-neutral-500 transition hover:text-black"
                  >
                    View full calendar →
                  </Link>
                </div>

                {professionalWeekAtGlanceWork.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                      <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                        <path d="M6 2v2M14 2v2M3 8h14M4 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900">Clear week ahead</p>
                    <p className="mt-1 text-sm text-neutral-500">No upcoming work scheduled for this week.</p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4">
                    {professionalWeekAtGlanceWork.map((item) => (
                      <div
                        key={`${item.source}-${item.id}`}
                        className="rounded-2xl border border-neutral-200 bg-white p-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-lg font-semibold text-neutral-900">
                              {item.title}
                            </p>

                            {item.subtitle ? (
                              <p className="mt-1 text-sm text-neutral-600">
                                {item.subtitle}
                              </p>
                            ) : null}

                            {item.client_name ? (
                              <span className="mt-2 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
                                {item.client_name}
                              </span>
                            ) : null}

                            <UberLocationCard
                              address={item.location}
                              lat={item.location_lat}
                              lng={item.location_lng}
                              compact
                              userLat={userLocation?.lat}
                              userLng={userLocation?.lng}
                            />
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                              {item.source === "booking" ? "Booking" : "Request"}
                            </span>
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                              {item.status === "completion_requested"
                                ? "Awaiting confirmation"
                                : item.status}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4">
                          <Link
                            href={item.href}
                            className="inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                          >
                            {item.source === "booking" ? "View booking" : "View request"}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-14">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Recommended opportunities
                </h2>

                {professionalOpenRequests.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                      <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900">No matching requests right now</p>
                    <p className="mt-1 text-sm text-neutral-500">New requests matching your services will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {professionalOpenRequests.slice(0, 4).map((request) => (
                      <Link
                        key={request.id}
                        href={`/requests/${request.id}`}
                        className="block rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                            {formatCategory(request.category)}
                            {request.service_detail
                              ? ` • ${request.service_detail}`
                              : ""}
                          </span>

                          {request.is_direct_rebook ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800">
                              Direct rebook
                            </span>
                          ) : null}

                          {professionalUnreadRequestIds.includes(request.id) &&
                          !respondedRequestIds.includes(request.id) ? (
                            <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                              New
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">
                          {request.title}
                        </h3>

                        {request.description ? (
                          <p className="mt-3 line-clamp-3 text-neutral-600">
                            {request.description}
                          </p>
                        ) : null}

                        <div className="mt-5 flex flex-wrap gap-2">
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                            {formatPreferredTiming(request)}
                          </span>
                          {request.timing_flexibility ? (
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                              {formatTimingFlexibility(request.timing_flexibility)}
                            </span>
                          ) : null}
                          {formatModeList(request) ? (
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                              {formatModeList(request)}
                            </span>
                          ) : null}
                          {request.budget ? (
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                              {request.budget}
                            </span>
                          ) : null}
                        </div>

                        <UberLocationCard
                          address={request.formatted_address || request.location}
                          lat={request.location_lat}
                          lng={request.location_lng}
                          interactive={false}
                          userLat={userLocation?.lat}
                          userLng={userLocation?.lng}
                        />

                        <div className="mt-5">
                          {respondedRequestIds.includes(request.id) ? (
                            <span className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-500">
                              Responded
                            </span>
                          ) : (
                            <span className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                              Respond now →
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-14">
                <h2 className="text-2xl font-semibold tracking-tight">
                  This month
                </h2>

                <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <p className="text-sm text-neutral-500">Completed jobs</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {monthlyCompletedJobsCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <p className="text-sm text-neutral-500">Upcoming</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {monthlyUpcomingCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <p className="text-sm text-neutral-500">Opportunities</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {monthlyOpportunitiesCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-14">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Completed work
                  </h2>

                  <Link
                    href="/calendar"
                    className="text-sm font-medium text-neutral-500 transition hover:text-black"
                  >
                    Calendar →
                  </Link>
                </div>

                {unifiedProfessionalCompletedWork.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                      <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900">No completed work yet</p>
                    <p className="mt-1 text-sm text-neutral-500">Finished jobs will appear here once marked complete.</p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {unifiedProfessionalCompletedWork.slice(0, 4).map((item) => (
                      <div
                        key={`${item.source}-${item.id}`}
                        className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                              {item.source === "booking" && item.client_avatar_url ? (
                                <img
                                  src={item.client_avatar_url}
                                  alt={item.client_name || "Client"}
                                  className="h-full w-full object-cover"
                                />
                              ) : item.source === "request" &&
                                item.rawRequest.reference_photos &&
                                item.rawRequest.reference_photos.length > 0 ? (
                                <img
                                  src={item.rawRequest.reference_photos[0]}
                                  alt="Reference preview"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                                  {item.client_name?.charAt(0).toUpperCase() || "C"}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 max-w-3xl">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {item.source === "booking" ? "Booking" : "Request"}
                                </span>

                                <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                                  Completed
                                </span>
                              </div>

                              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                {item.title}
                              </h2>

                              {item.subtitle ? (
                                <p className="mt-3 text-neutral-600">{item.subtitle}</p>
                              ) : null}

                              {item.client_name ? (
                                <span className="mt-2 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
                                  {item.client_name}
                                </span>
                              ) : null}

                              <UberLocationCard
                                address={item.location}
                                lat={item.location_lat}
                                lng={item.location_lng}
                                compact
                              userLat={userLocation?.lat}
                              userLng={userLocation?.lng}
                              />
                            </div>
                          </div>

                          <p className="shrink-0 text-sm text-neutral-500">
                            Completed{" "}
                            {item.completed_at
                              ? formatDateTime(item.completed_at)
                              : formatDateTime(item.created_at)}
                          </p>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <Link
                            href={item.href}
                            className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                          >
                            {item.source === "booking" ? "View booking" : "View request"}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cancelledProfessionalBookings.length > 0 ? (
                <div className="mt-14">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Cancelled bookings
                  </h2>

                  <div className="mt-6 grid gap-4">
                    {cancelledProfessionalBookings.map((booking) => (
                      <Link
                        key={booking.id}
                        href={`/bookings/${booking.id}`}
                        className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                            Cancelled
                          </span>
                          {booking.refund_status === "refunded" ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                              Client refunded
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-tight">
                          {booking.service_name || "Booked service"}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatBookingDate(booking.booking_date)}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
