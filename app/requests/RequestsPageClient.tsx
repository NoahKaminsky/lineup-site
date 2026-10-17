"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Inbox, Briefcase, Wand2, UserCircle, Images, Star, ClipboardList, Handshake, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { getCached, setCached } from "@/app/lib/pageCache";
import type { RequestsInitialData } from "./getInitialData";
import { getCustomerRatingsMap, type CustomerRatingSummary } from "@/app/lib/customerRatings";
import WelcomeTour, { type TourStep } from "../components/WelcomeTour";
import OnboardingChecklist from "../components/OnboardingChecklist";
import VerificationBanner from "../components/VerificationBanner";
import NotificationNudge from "../components/NotificationNudge";
import { canCancelForRefund, formatCancellationDeadline } from "@/app/lib/bookingTime";
import { useDismissedRequests } from "@/app/lib/requestDismissals";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";

// "Recently completed" lists show the last 24 hours only (older work lives in
// Archived services).
function isWithinLastDay(iso: string | null | undefined) {
  return !!iso && Date.now() - new Date(iso).getTime() <= 24 * 60 * 60 * 1000;
}

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
      "Basic is free and lets you take on real clients right away. Any paid plan turns on an instant-booking calendar on your profile automatically — clients pick an open time and pay right there, no offers needed. It's on by default once you subscribe, and you can turn it off in Services if you'd rather not.",
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
  // Set when the client started this from a past job with the pro ("Request
  // again"): only then is it a rebook; otherwise it's a direct request.
  original_request_id?: string | null;
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
  request_id?: string | null;
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <MapPin aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
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

type RequestsPageClientProps = {
  // Fetched server-side (see app/requests/page.tsx + getInitialData.ts) with
  // the same shape as RequestsCache below, so a cold load — first visit, hard
  // refresh, deep link — already has real data instead of a blank skeleton.
  // Structurally identical to RequestsCache on purpose but kept as a
  // separately-defined type in getInitialData.ts; bridged with a cast here
  // rather than importing one from the other, so the two stay independent.
  initialData: RequestsInitialData | null;
  initialUserLocation: { lat: number; lng: number } | null;
};

export default function RequestsPageClient({ initialData, initialUserLocation }: RequestsPageClientProps) {
  const router = useRouter();

  // Prefer the client's own in-memory cache (set after any load, including
  // background refreshes) over the server-fetched initialData, since on a
  // client-side navigation back to this page the cache can be fresher than
  // whatever was fetched for the page that's about to unmount. On a true
  // cold load there's no cache yet, so initialData is what seeds the page.
  const seed: RequestsCache | null =
    getCached<RequestsCache>("requests-page") ?? (initialData as unknown as RequestsCache | null);

  const [loading, setLoading] = useState(() => !seed);
  const [role, setRole] = useState<string | null>(() => seed?.role ?? null);
  const [userId, setUserId] = useState<string | null>(() => seed?.userId ?? null);
  const [userName, setUserName] = useState<string | null>(() => seed?.userName ?? null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(() => initialUserLocation ?? null);

  const [requests, setRequests] = useState<ServiceRequest[]>(() => seed?.requests ?? []);
  const [bookings, setBookings] = useState<EnrichedBooking[]>(() => seed?.bookings ?? []);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<string>>(
    () => new Set(initialData?.reviewedBookingIds ?? [])
  );
  const [professionalBookings, setProfessionalBookings] = useState<
    ProfessionalWorkBooking[]
  >(() => seed?.professionalBookings ?? []);

  const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>(() => seed?.respondedRequestIds ?? []);
  const [professionalUnreadRequestIds, setProfessionalUnreadRequestIds] =
    useState<string[]>(() => seed?.professionalUnreadRequestIds ?? []);
  const [offerCountsByRequest, setOfferCountsByRequest] = useState<
    Record<string, number>
  >(() => seed?.offerCountsByRequest ?? {});
  const [unreadOfferCountsByRequest, setUnreadOfferCountsByRequest] = useState<
    Record<string, number>
  >(() => seed?.unreadOfferCountsByRequest ?? {});

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
          "id, professional_id, customer_id, request_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, refund_status"
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

    const completedBookingIds = enrichedBookings
      .filter((booking) => booking.status === "completed")
      .map((booking) => booking.id);

    if (completedBookingIds.length > 0) {
      const { data: reviewedRows } = await supabase
        .from("professional_reviews")
        .select("booking_id")
        .eq("reviewer_id", userId)
        .in("booking_id", completedBookingIds);

      setReviewedBookingIds(new Set((reviewedRows || []).map((row) => row.booking_id).filter(Boolean)));
    } else {
      setReviewedBookingIds(new Set());
    }
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
          "id, professional_id, customer_id, request_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, refund_status"
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

      const user = await getSignedInUser();

      if (!user) {
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
    // Still always refetch live on mount — initialData / the cache might be
    // a few seconds (or up to 5 minutes, for the cache) stale, and this page
    // needs to be current. The only thing seeding changes is whether that
    // refetch is silent (we already have something to show) or blocking.
    loadRequestsLive({ silent: !!seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const user = await getSignedInUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId, action: "confirm" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not confirm completion.");
        return;
      }

      const completedAt = new Date().toISOString();
      const completedBooking = bookings.find((booking) => booking.id === bookingId);

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

      if (completedBooking?.request_id) {
        setRequests((prev) =>
          prev.map((request) =>
            request.id === completedBooking.request_id
              ? { ...request, status: "completed", completed_at: completedAt }
              : request
          )
        );
      }

      if (data.needsReview) {
        router.push(`/bookings/${bookingId}?review=1`);
        return;
      }

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

      const user = await getSignedInUser();

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

  // Whether the "Ready for your first job" prompt still has anything to ask
  // for. Services are always needed; weekly availability only for paid plans
  // (it's a subscriber feature, so Basic pros could never clear it).
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isProfessional || !userId) return;
    let cancelled = false;
    (async () => {
      const [servicesRes, hoursRes, profileRes] = await Promise.all([
        supabase.from("professional_services").select("id", { count: "exact", head: true }).eq("professional_id", userId),
        supabase
          .from("professional_availability")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", userId)
          .eq("is_active", true),
        supabase.from("profiles").select("subscription_status").eq("id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      const subscribed =
        profileRes.data?.subscription_status === "active" || profileRes.data?.subscription_status === "trialing";
      const hasServices = (servicesRes.count ?? 0) > 0;
      const hasHours = (hoursRes.count ?? 0) > 0;
      setSetupComplete(hasServices && (hasHours || !subscribed));
    })();
    return () => {
      cancelled = true;
    };
  }, [isProfessional, userId]);

  // Once a request is accepted, it gets a matching row in `bookings` — without this,
  // the same job shows up twice here (once as the request, once as the booking).
  const bookedRequestIds = useMemo(
    () => new Set(bookings.map((booking) => booking.request_id).filter(Boolean) as string[]),
    [bookings]
  );

  const activeRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.status !== "completed" &&
          request.status !== "cancelled" &&
          !bookedRequestIds.has(request.id)
      ),
    [requests, bookedRequestIds]
  );

  const completedRequests = useMemo(
    () => requests.filter((request) => request.status === "completed" && !bookedRequestIds.has(request.id)),
    [requests, bookedRequestIds]
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

  const pendingCompletionBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "completion_requested"),
    [bookings]
  );

  const completedBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "completed"),
    [bookings]
  );

  // "Recently completed" lists only show the last 24 hours; everything older
  // lives in Archived services (/archive). Same rule the app already uses for
  // cancelled requests.
  const recentCompletedBookings = useMemo(
    () => completedBookings.filter((booking) => isWithinLastDay(booking.completed_at || booking.created_at)),
    [completedBookings]
  );

  const recentCompletedRequests = useMemo(
    () => completedRequests.filter((request) => isWithinLastDay(request.completed_at || request.created_at)),
    [completedRequests]
  );

  const unreviewedCompletedBookings = useMemo(
    () => completedBookings.filter((booking) => !reviewedBookingIds.has(booking.id)),
    [completedBookings, reviewedBookingIds]
  );

  const cancelledBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (booking.status !== "cancelled" || !booking.cancelled_at) return false;
        return Date.now() - new Date(booking.cancelled_at).getTime() <= 24 * 60 * 60 * 1000;
      }),
    [bookings]
  );

  // Requests this pro chose to clear ("not for me").
  const { dismissed: dismissedRequestIds, dismiss: dismissRequest } = useDismissedRequests(userId, isProfessional);

  const professionalOpenRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== "open") return false;
        if (dismissedRequestIds.has(request.id)) return false;
        if (request.is_direct_rebook) {
          return request.preferred_professional_id === userId;
        }
        return true;
      }),
    [requests, userId, dismissedRequestIds]
  );

  const [openRequestOwnerRatings, setOpenRequestOwnerRatings] = useState<
    Record<string, CustomerRatingSummary>
  >({});

  useEffect(() => {
    const clientIds = professionalOpenRequests.map((request) => request.client_id);
    if (clientIds.length === 0) {
      setOpenRequestOwnerRatings({});
      return;
    }

    let cancelled = false;
    getCustomerRatingsMap(clientIds).then((ratingsMap) => {
      if (!cancelled) setOpenRequestOwnerRatings(ratingsMap);
    });

    return () => {
      cancelled = true;
    };
  }, [professionalOpenRequests]);

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

  // Once a request is accepted, it gets a matching row in `bookings` — without this,
  // the same job shows up twice here (once as the request, once as the booking).
  const professionalBookedRequestIds = useMemo(
    () => new Set(professionalBookings.map((booking) => booking.request_id).filter(Boolean) as string[]),
    [professionalBookings]
  );

  const unifiedProfessionalUpcomingWork = useMemo(() => {
    const requestItems: UnifiedProfessionalWorkItem[] = professionalUpcomingRequests
      .filter((request) => !professionalBookedRequestIds.has(request.id))
      .map((request) => ({
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
        title: cleanServiceLabel(booking.service_name) || "Booked service",
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
  }, [professionalUpcomingRequests, professionalUpcomingBookings, professionalBookedRequestIds]);

  const unifiedProfessionalCompletedWork = useMemo(() => {
    const requestItems: UnifiedProfessionalWorkItem[] = professionalCompletedRequests
      .filter((request) => !professionalBookedRequestIds.has(request.id))
      .map((request) => ({
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
        title: cleanServiceLabel(booking.service_name) || "Booked service",
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
  }, [professionalCompletedRequests, professionalCompletedBookings, professionalBookedRequestIds]);

  const recentProfessionalCompletedWork = useMemo(
    () =>
      unifiedProfessionalCompletedWork.filter(
        (item) => !!(item.completed_at || item.created_at) &&
          Date.now() - new Date(item.completed_at || item.created_at).getTime() <= 24 * 60 * 60 * 1000
      ),
    [unifiedProfessionalCompletedWork]
  );

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
        if (professionalBookedRequestIds.has(request.id)) return false;
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
    professionalBookedRequestIds,
    currentMonthStart,
    nextMonthStart,
  ]);

  const monthlyUpcomingCount = useMemo(() => {
    // A request that became a booking is counted once, as the booking.
    const upcomingRequestsThisMonth = professionalUpcomingRequests.filter(
      (request) => {
        if (professionalBookedRequestIds.has(request.id)) return false;
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
    professionalBookedRequestIds,
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
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


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
                  className="rounded-panel border border-neutral-200 bg-white p-6 shadow-sm"
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
  <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


    <div className="mx-auto max-w-6xl py-8">
      <div>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Dashboard
              </p>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
                Welcome back{userName ? `, ${userName.split(" ")[0]}` : ""}.
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
                {isCustomer
                  ? "Track your requests, bookings, and completed services in one place."
                  : "Here’s what’s happening with your work this week."}
              </p>
            </div>

            {isCustomer ? (
              <Link
                href="/requests/new"
                className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
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
              <VerificationBanner />
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

          <NotificationNudge />

          {message ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          {isCustomer && pendingCompletionBookings.length > 0 ? (
            <div role="status" className="lu-dialog-in mt-8 rounded-[24px] bg-ink p-6 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-white/60">Action needed</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight">
                    {pendingCompletionBookings.length === 1
                      ? `Confirm your ${cleanServiceLabel(pendingCompletionBookings[0].service_name) || "service"} is done`
                      : `Confirm ${pendingCompletionBookings.length} completed services`}
                  </p>
                  <p className="mt-1 max-w-md text-sm text-white/70">
                    Your professional marked this done. Confirming it wraps up the booking and pays them out, then
                    you can leave a review.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleConfirmBookingCompletion(pendingCompletionBookings[0].id)}
                  disabled={bookingActionLoadingId === pendingCompletionBookings[0].id}
                  className="inline-flex shrink-0 rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-neutral-200 disabled:opacity-60"
                >
                  {bookingActionLoadingId === pendingCompletionBookings[0].id
                    ? "Confirming…"
                    : "Confirm service completed"}
                </button>
              </div>
            </div>
          ) : null}

          {isCustomer && unreviewedCompletedBookings.length > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div>
                <p className="font-semibold text-neutral-900">
                  {unreviewedCompletedBookings.length === 1
                    ? `How was your ${cleanServiceLabel(unreviewedCompletedBookings[0].service_name) || "service"}?`
                    : `You have ${unreviewedCompletedBookings.length} completed services to review`}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Leave a quick review so other clients know what to expect.
                </p>
              </div>
              {/* Tap a star to jump straight into the review with it picked. */}
              <div className="flex items-center gap-0.5" aria-label="Leave a review">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Link
                    key={star}
                    href={`/bookings/${unreviewedCompletedBookings[0].id}?review=1&rating=${star}`}
                    aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
                    className="group/star rounded-full p-1 text-neutral-300 transition hover:scale-110 hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1l-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {!message && isCustomer && requests.length === 0 && bookings.length === 0 ? (
            <div className="mt-10 rounded-panel border border-dashed border-neutral-300 px-6 py-12 text-center">
              <div className="mx-auto flex h-8 w-8 items-center justify-center">
                <svg viewBox="0 0 20 20" className="h-6 w-6 text-neutral-400" fill="none">
                  <path d="M10 2C6.686 2 4 4.686 4 8c0 4 6 10 6 10s6-6 6-10c0-3.314-2.686-6-6-6z" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">You&apos;re all set up</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Post your first request and professionals in your area will send you offers to compare.
              </p>
              <Link
                href="/requests/new"
                className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Post a request
              </Link>
            </div>
          ) : null}

          {!message &&
          isProfessional &&
          setupComplete === false &&
          professionalOpenRequests.length === 0 &&
          unifiedProfessionalUpcomingWork.length === 0 &&
          unifiedProfessionalCompletedWork.length === 0 ? (
            <div className="mt-10 rounded-panel border border-dashed border-neutral-300 px-6 py-12 text-center">
              <div className="mx-auto flex h-8 w-8 items-center justify-center">
                <svg viewBox="0 0 20 20" className="h-6 w-6 text-neutral-400" fill="none">
                  <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">Ready for your first job</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Make sure your services, availability, and service area are set up so clients can find you.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href="/services" className="inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Set up services
                </Link>
                <Link href="/services#availability" className="inline-flex rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50">
                  Set availability
                </Link>
              </div>
            </div>
          ) : null}

          {isCustomer ? (
            <div className="lg:max-w-3xl">
              <div className="mt-10">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  Active bookings
                </h2>

                {activeBookings.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center">
                      <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                        <path d="M6 2v2M14 2v2M3 8h14M4 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="mt-3 font-semibold text-neutral-900">No active bookings</p>
                    <p className="mt-1 text-sm text-neutral-500">Confirmed upcoming services will appear here.</p>
                  </div>
                ) : (
                  <div className="lu-lineup mt-5 grid gap-4">
                    {activeBookings.map((booking) => {
                      const isLoadingAction =
                        bookingActionLoadingId === booking.id;

                      return (
                        <div
                          key={booking.id}
                          className="rounded-2xl border border-hairline bg-surface p-5 sm:p-6"
                        >
                          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 flex-1 gap-4">
                              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                                {booking.professional_avatar_url ? (
                                  <img loading="lazy"
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

                                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                    {booking.status === "completion_requested"
                                      ? "Awaiting confirmation"
                                      : booking.status}
                                  </span>

                                  {booking.professional_type ? (
                                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                      {formatProfessionalType(
                                        booking.professional_type
                                      )}
                                    </span>
                                  ) : null}
                                </div>

                                <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
                                  {cleanServiceLabel(booking.service_name) || "Booked service"}
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
                                className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
                              >
                                {isLoadingAction
                                  ? "Confirming…"
                                  : "Confirm service completed"}
                              </button>
                            ) : null}

                            {(booking.status === "confirmed" ||
                              booking.status === "completion_requested") ? (
                              !canCancelForRefund(booking.booking_date, booking.start_time) ? (
                                // Inside 24h: say so instead of offering a button the
                                // server will refuse.
                                <p className="text-xs leading-5 text-neutral-500">
                                  Within 24 hours of the appointment, so it can no longer be cancelled. Message the
                                  professional if something&apos;s come up.
                                </p>
                              ) : cancelBookingConfirmId === booking.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm text-neutral-600">Cancel and get a full refund?</span>
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
                            {(booking.status === "confirmed" || booking.status === "completion_requested") &&
                            canCancelForRefund(booking.booking_date, booking.start_time) ? (
                              <p className="text-xs text-neutral-400">
                                Free cancellation until {formatCancellationDeadline(booking.booking_date, booking.start_time)}.
                              </p>
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
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Active requests
                  </h2>

                  <div className="lu-lineup mt-5 grid gap-4">
                    {activeRequests.map((request) => (
                      <Link
                        key={request.id}
                        href={`/requests/${request.id}`}
                        className="block rounded-2xl border border-hairline bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] sm:p-6"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            {request.reference_photos &&
                            request.reference_photos.length > 0 ? (
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                                <img loading="lazy"
                                  src={request.reference_photos[0]}
                                  alt="Reference preview"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            ) : null}

                            <div className="min-w-0 max-w-3xl">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                  {formatCategory(request.category)}
                                  {request.service_detail &&
 cleanServiceLabel(request.service_detail).toLowerCase() !== formatCategory(request.category).toLowerCase()
                                    ? ` • ${cleanServiceLabel(request.service_detail)}`
                                    : ""}
                                </span>

                                {request.is_direct_rebook ? (
                                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-ink">
                                    {request.original_request_id ? "Rebook" : "Direct request"}
                                  </span>
                                ) : null}

                                <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                  {request.status === "open"
                                    ? "Pending"
                                    : request.status === "accepted"
                                    ? "Accepted"
                                    : request.status === "completion_requested"
                                    ? "Awaiting confirmation"
                                    : request.status}
                                </span>

                                {unreadOfferCountsByRequest[request.id] ? (
                                  <span className="animate-notification-pop rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-white">
                                    {unreadOfferCountsByRequest[request.id]} of{" "}
                                    {offerCountsByRequest[request.id] || 0} offers new
                                  </span>
                                ) : null}
                              </div>

                              <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
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

              {recentCompletedBookings.length > 0 ? (
                <div className="mt-12">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">Recently completed</h2>
                    <Link href="/archive" className="rounded text-sm text-neutral-500 transition-colors hover:text-ink">
                      View archive →
                    </Link>
                  </div>

                  <div className="lu-lineup mt-5 grid gap-4">
                    {recentCompletedBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-hairline bg-surface/60 p-5 sm:p-6"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                              {booking.professional_avatar_url ? (
                                <img loading="lazy"
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
                                <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                  Booking
                                </span>

                                <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-white">
                                  Completed
                                </span>
                              </div>

                              <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
                                {cleanServiceLabel(booking.service_name) || "Booked service"}
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
                <div className="mt-12">
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Cancelled bookings
                  </h2>

                  <div className="lu-lineup mt-5 grid gap-3">
                    {cancelledBookings.map((booking) => (
                      <Link
                        key={booking.id}
                        href={`/bookings/${booking.id}`}
                        className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-white">
                            Cancelled
                          </span>
                          {booking.refund_status === "refunded" ? (
                            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-ink">
                              Refunded
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold tracking-tight">
                          {cleanServiceLabel(booking.service_name) || "Booked service"}
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

              {recentCompletedRequests.length > 0 ? (
                <div className="mt-12">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">Recently completed requests</h2>
                    <Link href="/archive" className="rounded text-sm text-neutral-500 transition-colors hover:text-ink">
                      View archive →
                    </Link>
                  </div>

                  <div className="lu-lineup mt-5 grid gap-4">
                    {recentCompletedRequests.map((request) => (
                      <div
                        key={request.id}
                        className="rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:bg-surface sm:p-6"
                      >
                        <Link href={`/requests/${request.id}`}>
                          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 flex-1 gap-4">
                              {request.reference_photos &&
                              request.reference_photos.length > 0 ? (
                                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                                  <img loading="lazy"
                                    src={request.reference_photos[0]}
                                    alt="Reference preview"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              ) : null}

                              <div className="min-w-0 max-w-3xl">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                                    {formatCategory(request.category)}
                                    {request.service_detail &&
 cleanServiceLabel(request.service_detail).toLowerCase() !== formatCategory(request.category).toLowerCase()
                                      ? ` • ${cleanServiceLabel(request.service_detail)}`
                                      : ""}
                                  </span>

                                  {request.is_direct_rebook ? (
                                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-ink">
                                      {request.original_request_id ? "Rebook" : "Direct request"}
                                    </span>
                                  ) : null}

                                  <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-white">
                                    Completed
                                  </span>
                                </div>

                                <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
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
                <div className="mt-12">
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    Cancelled requests
                  </h2>

                  <div className="lu-lineup mt-5 grid gap-3">
                    {cancelledRequests.map((request) => (
                      <Link
                        key={request.id}
                        href={`/requests/${request.id}`}
                        className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                            {formatCategory(request.category)}
                          </span>
                          <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-white">
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
            </div>
          ) : null}

          {isProfessional ? (
            <div className="mt-10 space-y-12">
              {/* This month — the numbers a pro checks first. */}
              <section aria-label="This month">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">This month</p>
                <dl className="lu-slots mt-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-hairline bg-surface">
                  {[
                    { label: "Completed", value: monthlyCompletedJobsCount },
                    { label: "Upcoming", value: monthlyUpcomingCount },
                    { label: "Opportunities", value: monthlyOpportunitiesCount },
                  ].map((stat, index) => (
                    <div key={stat.label} className={`px-4 py-4 sm:px-6 sm:py-5 ${index > 0 ? "border-l border-hairline" : ""}`}>
                      <dt className="text-xs text-neutral-500 sm:text-sm">{stat.label}</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em] sm:text-3xl">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
                {/* Main column: work to win. */}
                <section aria-labelledby="opportunities-heading" className="lg:col-span-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 id="opportunities-heading" className="text-xl font-semibold tracking-[-0.02em]">
                      Recommended opportunities
                    </h2>
                    {professionalOpenRequests.length > 0 ? (
                      <span className="text-sm tabular-nums text-neutral-500">
                        {Math.min(professionalOpenRequests.length, 4)} of {professionalOpenRequests.length}
                      </span>
                    ) : null}
                  </div>

                  {professionalOpenRequests.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center">
                      <p className="font-medium text-ink">No matching requests right now</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
                        New requests matching your services will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="lu-lineup mt-5 grid gap-4">
                      {professionalOpenRequests.slice(0, 4).map((request) => {
                        const isNew =
                          professionalUnreadRequestIds.includes(request.id) && !respondedRequestIds.includes(request.id);
                        const responded = respondedRequestIds.includes(request.id);
                        const meta = [
                          formatPreferredTiming(request),
                          request.timing_flexibility ? formatTimingFlexibility(request.timing_flexibility) : null,
                          formatModeList(request) || null,
                          openRequestOwnerRatings[request.client_id]
                            ? `★ ${openRequestOwnerRatings[request.client_id].average.toFixed(1)} client`
                            : null,
                        ].filter(Boolean);

                        return (
                          <div key={request.id} className="group/req relative">
                          {!responded ? (
                            <button
                              type="button"
                              onClick={() => dismissRequest(request.id)}
                              aria-label={`Dismiss request: ${request.title}`}
                              title="Not for me — clear this request"
                              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover/req:opacity-100"
                            >
                              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                              </svg>
                            </button>
                          ) : null}
                          <Link
                            href={`/requests/${request.id}`}
                            className="group block rounded-2xl border border-hairline bg-surface p-5 pr-12 transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-[0_12px_32px_-18px_rgba(0,0,0,0.25)] sm:p-6 sm:pr-12"
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
                                {formatCategory(request.category)}
                                {request.service_detail &&
 cleanServiceLabel(request.service_detail).toLowerCase() !== formatCategory(request.category).toLowerCase() ? ` · ${cleanServiceLabel(request.service_detail)}` : ""}
                              </span>
                              {request.is_direct_rebook ? (
                                <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                                  {request.original_request_id ? "Rebook" : "Direct request"}
                                </span>
                              ) : null}
                              {isNew ? (
                                <span className="animate-notification-pop shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  New
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 flex items-start justify-between gap-4">
                              <h3 className="text-lg font-semibold tracking-[-0.015em] text-ink">{request.title}</h3>
                              {request.budget ? (
                                <span className="shrink-0 text-lg font-semibold tabular-nums tracking-[-0.01em] text-ink">
                                  {request.budget}
                                </span>
                              ) : null}
                            </div>

                            {request.description ? (
                              <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-neutral-600">{request.description}</p>
                            ) : null}

                            {meta.length > 0 ? (
                              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
                                {meta.map((part, index) => (
                                  <span key={index} className="inline-flex items-center gap-2">
                                    {index > 0 ? <span aria-hidden="true" className="text-neutral-300">·</span> : null}
                                    {part}
                                  </span>
                                ))}
                              </p>
                            ) : null}

                            <UberLocationCard
                              address={request.formatted_address || request.location}
                              lat={request.location_lat}
                              lng={request.location_lng}
                              interactive={false}
                              compact
                              userLat={userLocation?.lat}
                              userLng={userLocation?.lng}
                            />

                            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                              {responded ? (
                                <span className="text-sm font-medium text-neutral-500">Offer sent</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                                  Respond
                                  <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                                </span>
                              )}
                              <span className="text-xs text-neutral-400">View request</span>
                            </div>
                          </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Side column: your schedule and track record, at a glance. */}
                <aside className="space-y-10 lg:col-span-4">
                  <section aria-labelledby="week-heading">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 id="week-heading" className="text-base font-semibold tracking-[-0.01em]">This week</h2>
                      <Link href="/calendar" className="rounded text-sm text-neutral-500 transition-colors hover:text-ink">
                        Calendar →
                      </Link>
                    </div>

                    {professionalWeekAtGlanceWork.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500">
                        Clear week ahead — no work scheduled yet.
                      </p>
                    ) : (
                      <ul className="lu-lineup mt-3 divide-y divide-hairline rounded-2xl border border-hairline bg-surface">
                        {professionalWeekAtGlanceWork.map((item) => (
                          <li key={`${item.source}-${item.id}`}>
                            <Link href={item.href} className="block px-4 py-3.5 transition-colors hover:bg-neutral-50">
                              <div className="flex items-start justify-between gap-3">
                                <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                                <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
                                  {item.status === "completion_requested" ? "Awaiting confirmation" : item.status}
                                </span>
                              </div>
                              {item.subtitle ? <p className="mt-0.5 truncate text-xs text-neutral-500">{item.subtitle}</p> : null}
                              <p className="mt-1 truncate text-xs text-neutral-500">
                                {[item.client_name, item.location].filter(Boolean).join(" · ") ||
                                  (item.source === "booking" ? "Booking" : "Request")}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section aria-labelledby="completed-heading">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 id="completed-heading" className="text-base font-semibold tracking-[-0.01em]">Recently completed</h2>
                      <Link href="/archive" className="rounded text-sm text-neutral-500 transition-colors hover:text-ink">
                        Archive →
                      </Link>
                    </div>
                    {recentProfessionalCompletedWork.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500">
                        Jobs you finish show here for 24 hours, then move to your archive.
                      </p>
                    ) : (
                      <ul className="lu-lineup mt-3 divide-y divide-hairline rounded-2xl border border-hairline bg-surface">
                        {recentProfessionalCompletedWork.slice(0, 4).map((item) => (
                          <li key={`${item.source}-${item.id}`}>
                            <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50">
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                                {item.source === "booking" && item.client_avatar_url ? (
                                  <img loading="lazy" src={item.client_avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : item.source === "request" &&
                                  item.rawRequest.reference_photos &&
                                  item.rawRequest.reference_photos.length > 0 ? (
                                  <img loading="lazy" src={item.rawRequest.reference_photos[0]} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-500">
                                    {item.client_name?.charAt(0).toUpperCase() || "C"}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                                <p className="truncate text-xs text-neutral-500">
                                  {item.client_name ? `${item.client_name} · ` : ""}
                                  {item.completed_at ? formatDateTime(item.completed_at) : formatDateTime(item.created_at)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {cancelledProfessionalBookings.length > 0 ? (
                    <section aria-labelledby="cancelled-heading">
                      <h2 id="cancelled-heading" className="text-base font-semibold tracking-[-0.01em]">Cancelled</h2>
                      <ul className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline bg-surface">
                        {cancelledProfessionalBookings.map((booking) => (
                          <li key={booking.id}>
                            <Link href={`/bookings/${booking.id}`} className="block px-4 py-3.5 transition-colors hover:bg-neutral-50">
                              <p className="truncate text-sm font-semibold text-ink">{cleanServiceLabel(booking.service_name) || "Booked service"}</p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                {formatBookingDate(booking.booking_date)}
                                {booking.refund_status === "refunded" ? " · Client refunded" : ""}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
