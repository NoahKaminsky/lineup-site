"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import BookingChat from "@/app/components/BookingChat";
import { getCached, setCached } from "@/app/lib/pageCache";
import { containsProfanity } from "@/app/lib/profanityFilter";

import {
  CANCELLATION_CUTOFF_HOURS as CUTOFF_HOURS,
  canCancelForRefund,
  formatCancellationDeadline,
  hasAppointmentEnded,
} from "@/app/lib/bookingTime";
import { DrawnCheck, MaskLine, formatMomentPrice } from "@/app/components/moments/Moments";
import { cleanServiceLabel } from "@/app/lib/serviceLabel";
import { useHashTarget } from "@/app/lib/useHashTarget";
type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "completion_requested"
  | "completed";

type BookingRow = {
  id: string;
  request_id?: string | null;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  created_at: string;
  service_id: string | null;
  service_name: string | null;
  service_mode?: string | null;
  source?: string | null;
  duration_minutes: number | null;
  service_price?: string | number | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  completion_requested_at: string | null;
  completed_at: string | null;
  formatted_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  professional_type?: string | null;
  professional_types?: string[] | null;
};

type BookingDetailCache = {
  viewerId: string | null;
  viewerRole: string | null;
  booking: BookingRow | null;
  professional: ProfileRow | null;
  customer: ProfileRow | null;
};

function normalizeRole(role: string | null | undefined) {
  return role?.toLowerCase().trim() || "";
}

function isCustomerRole(role: string | null | undefined) {
  return normalizeRole(role).includes("customer");
}

function isServiceOver(bookingDate: string, endTime: string) {
  // Booking zone, not the viewer's device zone (see app/lib/bookingTime).
  return hasAppointmentEnded(bookingDate, endTime);
}

const CANCELLATION_CUTOFF_HOURS = CUTOFF_HOURS;

function canCancelBooking(bookingDate: string, startTime: string) {
  return canCancelForRefund(bookingDate, startTime);
}

function formatCancellationCutoff(bookingDate: string, startTime: string) {
  return formatCancellationDeadline(bookingDate, startTime);
}

function formatBookingDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return "Not provided";
  return new Date(dateString).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(time: string) {
  const [hourString, minute] = time.split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
}

function formatServiceMode(value: string | null | undefined) {
  if (!value) return "Not specified";
  if (value === "in_shop") return "In shop";
  if (value === "home_studio") return "Home studio";
  if (value === "at_home") return "At home";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(value: BookingStatus) {
  if (value === "completion_requested") return "Awaiting client confirmation";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatProfessionalType(value: string | null | undefined) {
  if (!value) return "Beauty professional";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatProfessionalTypes(profile: ProfileRow | null | undefined) {
  const types = profile?.professional_types?.length
    ? profile.professional_types
    : profile?.professional_type
    ? [profile.professional_type]
    : [];

  if (types.length === 0) return "Beauty professional";

  const MAX_SHOWN = 2;
  const shown = types.slice(0, MAX_SHOWN).map(formatProfessionalType).join(" · ");
  const remaining = types.length - MAX_SHOWN;
  return remaining > 0 ? `${shown} +${remaining} more` : shown;
}

function formatDisplayAddress(address: string | null | undefined) {
  const rawAddress = String(address || "").trim();
  return rawAddress || "Location not provided";
}

function toValidCoordinate(value: number | string | null | undefined) {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function hasUsableCoordinates(lat: number | string | null | undefined, lng: number | string | null | undefined) {
  const cleanLat = toValidCoordinate(lat);
  const cleanLng = toValidCoordinate(lng);

  // Google defaults to the world map when it receives empty/bad coords.
  // 0,0 is also not a valid real booking location for LineUp.
  if (cleanLat === null || cleanLng === null) return false;
  if (cleanLat === 0 && cleanLng === 0) return false;

  return true;
}

function getGoogleMapsUrl(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
  address?: string | null
) {
  if (hasUsableCoordinates(lat, lng)) {
    return `https://www.google.com/maps?q=${toValidCoordinate(lat)},${toValidCoordinate(lng)}`;
  }

  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      address.trim()
    )}`;
  }

  return null;
}

function getGoogleMapsEmbedUrl(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
  address?: string | null
) {
  // Use the old maps.google.com embed URL. It is more reliable for no-key iframe embeds
  // than google.com/maps?...&output=embed, which can fall back to the world map.
  const cleanAddress = address?.trim();

  if (cleanAddress) {
    return `https://maps.google.com/maps?hl=en&q=${encodeURIComponent(
      cleanAddress
    )}&z=16&output=embed`;
  }

  if (hasUsableCoordinates(lat, lng)) {
    return `https://maps.google.com/maps?hl=en&q=${toValidCoordinate(lat)},${toValidCoordinate(
      lng
    )}&z=16&output=embed`;
  }

  return null;
}


function BookingLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


      <div className="mx-auto max-w-5xl py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl">
            <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-neutral-200 md:h-16" />
            <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded-full bg-neutral-100" />
            <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          </div>

          <div className="h-11 w-24 animate-pulse rounded-full bg-neutral-100" />
        </div>

        <div className="mt-10 rounded-panel border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="h-7 w-24 animate-pulse rounded-full bg-neutral-100" />
            <div className="h-7 w-36 animate-pulse rounded-full bg-neutral-100" />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
              >
                <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
                <div className="mt-3 h-6 w-48 animate-pulse rounded-xl bg-neutral-100" />
                <div className="mt-2 h-4 w-32 animate-pulse rounded-full bg-neutral-100" />
              </div>
            ))}

            <div className="rounded-2xl border border-neutral-200 p-5 md:col-span-2">
              <div className="h-4 w-24 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-3 h-6 w-72 animate-pulse rounded-xl bg-neutral-100" />
              <div className="mt-4 h-56 w-full animate-pulse rounded-2xl bg-neutral-100" />
            </div>

            {[1, 2, 3, 4].map((item) => (
              <div
                key={`detail-${item}`}
                className="rounded-2xl border border-neutral-200 p-5"
              >
                <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
                <div className="mt-3 h-6 w-44 animate-pulse rounded-xl bg-neutral-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-panel border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-20 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-3 h-8 w-56 animate-pulse rounded-xl bg-neutral-200" />
          <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded-full bg-neutral-100" />
          <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      </div>
    </main>
  );
}


export default function BookingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id as string;

  const cacheKey = `booking-detail-${bookingId}`;
  const cached = getCached<BookingDetailCache>(cacheKey);

  const [loading, setLoading] = useState(() => !cached);
  const [message, setMessage] = useState("");

  const [viewerId, setViewerId] = useState<string | null>(() => cached?.viewerId ?? null);
  const [viewerRole, setViewerRole] = useState<string | null>(() => cached?.viewerRole ?? null);

  const [booking, setBooking] = useState<BookingRow | null>(() => cached?.booking ?? null);
  // "Message" links from lists land here as #booking-chat.
  useHashTarget(!loading && !!booking);
  const [professional, setProfessional] = useState<ProfileRow | null>(() => cached?.professional ?? null);
  const [customer, setCustomer] = useState<ProfileRow | null>(() => cached?.customer ?? null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  async function loadBooking(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    try {
      if (!silent) setLoading(true);
      setMessage("");

      const user = await getSignedInUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setViewerId(user.id);

      const { data: viewerProfile, error: viewerProfileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .single();

      if (viewerProfileError || !viewerProfile) {
        setMessage("Could not load your profile.");
        setLoading(false);
        return;
      }

      setViewerRole(viewerProfile.role);

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id, request_id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, service_mode, source, duration_minutes, service_price, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id"
        )
        .eq("id", bookingId)
        .single();

      if (bookingError || !bookingData) {
        setMessage("Booking not found.");
        setLoading(false);
        return;
      }

      const normalizedBooking = {
        ...bookingData,
        start_time: String(bookingData.start_time).slice(0, 5),
        end_time: String(bookingData.end_time).slice(0, 5),
      } as BookingRow;

      const canAccess =
        user.id === normalizedBooking.customer_id ||
        user.id === normalizedBooking.professional_id;

      if (!canAccess) {
        setMessage("You do not have access to this booking.");
        setLoading(false);
        return;
      }

      setBooking(normalizedBooking);

      const [professionalRes, customerRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role, professional_type, professional_types")
          .eq("id", normalizedBooking.professional_id)
          .single(),
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role, professional_type, professional_types")
          .eq("id", normalizedBooking.customer_id)
          .single(),
      ]);

      const resolvedProfessional = professionalRes.data ? (professionalRes.data as ProfileRow) : null;
      const resolvedCustomer = customerRes.data ? (customerRes.data as ProfileRow) : null;

      if (resolvedProfessional) setProfessional(resolvedProfessional);
      if (resolvedCustomer) setCustomer(resolvedCustomer);

      setCached<BookingDetailCache>(cacheKey, {
        viewerId: user.id,
        viewerRole: viewerProfile.role,
        booking: normalizedBooking,
        professional: resolvedProfessional,
        customer: resolvedCustomer,
      });

      setLoading(false);
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong loading this booking.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bookingId) {
      loadBooking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;

    const channel = supabase
      .channel(`booking-detail-live-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => {
          loadBooking({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Lets other pages (e.g. the dashboard's quick "confirm completion" action)
  // send the customer here with ?review=1 to pick up the review prompt, since
  // this page owns the review modal rather than every entry point duplicating it.
  useEffect(() => {
    if (!booking || booking.status !== "completed" || !viewerId) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("review") !== "1") return;

    let cancelled = false;

    (async () => {
      const { data: existingReview } = await supabase
        .from("professional_reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (!cancelled && !existingReview) {
        // A star tapped on the dashboard arrives as ?rating=N.
        const preset = Number(params.get("rating"));
        if (preset >= 1 && preset <= 5) setReviewRating(preset);
        setShowReviewModal(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [booking, viewerId]);

  const isViewerCustomer = !!booking && viewerId === booking.customer_id;
  const isViewerProfessional = !!booking && viewerId === booking.professional_id;
  const viewerIsCustomerRole = isCustomerRole(viewerRole);

  function scrollToBookingChat() {
    requestAnimationFrame(() => {
      const chatSection = document.getElementById("booking-chat");

      if (chatSection) {
        chatSection.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

  async function handleConfirmCompletion() {
    if (!booking || !isViewerCustomer || booking.status !== "completion_requested") {
      return;
    }

    try {
      setActionLoading("confirm");
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId: booking.id, action: "confirm" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not confirm completion.");
        return;
      }

      const completedAt = new Date().toISOString();

      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              completed_at: completedAt,
            }
          : prev
      );

      if (data.needsReview) {
        setShowReviewModal(true);
      } else {
        setMessage("Booking marked as completed.");
      }
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong confirming completion.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSubmitReview() {
    if (!booking || !viewerId || reviewRating === 0) return;

    if (containsProfanity(reviewComment)) {
      setMessage("Please remove inappropriate language from your review before submitting.");
      return;
    }

    setReviewSubmitting(true);

    try {
      const { error } = await supabase.from("professional_reviews").insert({
        professional_id: booking.professional_id,
        reviewer_id: viewerId,
        booking_id: booking.id,
        request_id: booking.request_id || null,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });

      if (error) {
        setMessage(`Couldn't submit your review: ${error.message}`);
        return;
      }

      setMessage("Booking completed. Thanks for your review!");
    } catch (error) {
      console.error(error);
      setMessage("Couldn't submit your review — please try again.");
    } finally {
      setReviewSubmitting(false);
      setShowReviewModal(false);
    }
  }

  async function handleRequestCompletion() {
    if (!booking || !isViewerProfessional || booking.status !== "confirmed") {
      return;
    }

    try {
      setActionLoading("request-completion");
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId: booking.id, action: "request" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not request completion.");
        return;
      }

      const completionRequestedAt = new Date().toISOString();

      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: "completion_requested",
              completion_requested_at: completionRequestedAt,
            }
          : prev
      );

      setMessage("Completion request sent.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong requesting completion.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelBooking() {
    if (
      !booking ||
      (viewerId !== booking.customer_id && viewerId !== booking.professional_id) ||
      (booking.status !== "confirmed" && booking.status !== "completion_requested")
    ) {
      return;
    }

    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }

    setConfirmingCancel(false);

    try {
      setActionLoading("cancel");
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not cancel this booking.");
        return;
      }

      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: "cancelled",
              cancelled_by: viewerId || null,
              cancelled_at: data.cancelledAt,
            }
          : prev
      );

      setMessage(
        data.refundStatus === "refunded"
          ? "Booking cancelled and a full refund has been issued."
          : data.refundStatus === "failed"
          ? "Booking cancelled, but the refund didn't go through — we've been notified and will follow up."
          : "Booking cancelled. It will no longer appear in active dashboards."
      );
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong cancelling this booking.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <BookingLoadingSkeleton />;
  }

  if (!booking) {
    return (
      <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10 text-neutral-900">
        <div className="mx-auto max-w-5xl">

          <div className="py-16">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              {message || "Booking not found."}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const bookingAddress = formatDisplayAddress(booking.formatted_address);
  const mapsUrl = getGoogleMapsUrl(
    booking.location_lat,
    booking.location_lng,
    booking.formatted_address
  );
  const mapEmbedUrl = getGoogleMapsEmbedUrl(
    booking.location_lat,
    booking.location_lng,
    booking.formatted_address
  );

  const isLive = booking.status === "confirmed" || booking.status === "completion_requested";
  const otherPerson = isViewerCustomer ? professional : customer;
  const otherRole = isViewerCustomer ? "Your professional" : "Your client";
  // Where it happens, worded for whoever is looking.
  const whereLabel = (() => {
    const mode = booking.service_mode;
    if (mode === "in_shop") return isViewerProfessional ? "At your shop" : "At their shop";
    if (mode === "home_studio") return isViewerProfessional ? "At your home studio" : "At their home studio";
    if (mode === "at_home") return isViewerProfessional ? "At the client's place" : "At your place";
    return formatServiceMode(mode);
  })();
  const statusLine =
    booking.status === "confirmed"
      ? "Booked"
      : booking.status === "completion_requested"
      ? "Waiting for confirmation"
      : formatStatus(booking.status);

  return (
    <>
    <main className="min-h-screen bg-paper px-4 pb-36 pt-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={viewerIsCustomerRole ? "/work" : "/calendar"}
            className="inline-flex items-center gap-1.5 rounded-full px-1 py-2 text-sm font-medium text-neutral-500 transition hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {viewerIsCustomerRole ? "Bookings" : "Calendar"}
          </Link>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isLive ? "bg-ink text-white" : booking.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {statusLine}
          </span>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</div>
        ) : null}

        {/* The booking at a glance: what, when, with whom, where. */}
        <section className="lu-dialog-in mt-4 rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-36px_rgba(0,0,0,0.3)] ring-1 ring-ink/[0.07] sm:p-8">
          <h1 className="text-[1.9rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-4xl">
            {cleanServiceLabel(booking.service_name) || "Booked service"}
          </h1>
          <p className="mt-2 text-lg text-neutral-600">
            {formatBookingDate(booking.booking_date)} · {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-ink/[0.06]">
              {otherPerson?.avatar_url ? (
                <img loading="lazy" src={otherPerson.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
                  {otherPerson?.full_name?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{otherPerson?.full_name || (isViewerCustomer ? "Professional" : "Client")}</p>
              <p className="truncate text-sm text-neutral-500">
                {otherRole}
                {isViewerCustomer && formatProfessionalTypes(professional) ? ` · ${formatProfessionalTypes(professional)}` : ""}
              </p>
            </div>
            {otherPerson?.id ? (
              <Link
                href={`/profile/${otherPerson.id}`}
                className="shrink-0 text-sm font-medium text-neutral-500 underline-offset-2 hover:text-ink hover:underline"
              >
                View profile
              </Link>
            ) : null}
          </div>

          {isLive || mapsUrl ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {isLive ? (
                <button
                  type="button"
                  onClick={scrollToBookingChat}
                  className={`inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 ${mapsUrl ? "" : "col-span-2"}`}
                >
                  Message
                </button>
              ) : null}
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-ink transition hover:bg-neutral-50 ${isLive ? "" : "col-span-2"}`}
                >
                  Directions
                </a>
              ) : null}
            </div>
          ) : null}

          <dl className="mt-6 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
            <div className="flex items-start justify-between gap-6 py-4">
              <dt className="shrink-0 text-sm text-neutral-500">Where</dt>
              <dd className="min-w-0 text-right text-sm">
                <span className="block font-medium text-ink">{whereLabel}</span>
                {bookingAddress ? <span className="mt-0.5 block text-neutral-500">{bookingAddress}</span> : null}
                {mapEmbedUrl ? (
                  <details className="group mt-2 text-left">
                    <summary className="cursor-pointer list-none text-right text-xs font-medium text-neutral-500 hover:text-ink">
                      <span className="group-open:hidden">Show map</span>
                      <span className="hidden group-open:inline">Hide map</span>
                    </summary>
                    <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-ink/[0.06]">
                      <iframe
                        title="Booking location map"
                        src={mapEmbedUrl}
                        width="100%"
                        height="200"
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        className="block w-full border-0"
                      />
                    </div>
                  </details>
                ) : null}
              </dd>
            </div>
            {booking.service_price !== null && booking.service_price !== undefined && booking.service_price !== "" ? (
              <div className="flex items-baseline justify-between gap-6 py-4">
                <dt className="text-sm text-neutral-500">Price</dt>
                <dd className="text-sm font-medium tabular-nums text-ink">{formatMomentPrice(booking.service_price)}</dd>
              </div>
            ) : null}
            {booking.duration_minutes ? (
              <div className="flex items-baseline justify-between gap-6 py-4">
                <dt className="text-sm text-neutral-500">Length</dt>
                <dd className="text-sm font-medium text-ink">{booking.duration_minutes} min</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {/* What needs doing, only when something does. */}
        {isViewerCustomer && booking.status === "completion_requested" ? (
          // The one step that releases the professional's payout.
          <section className="lu-dialog-in mt-4 rounded-[28px] bg-ink p-6 text-white sm:p-7">
            <p className="text-xs font-medium text-white/60">Action needed</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">
              {professional?.full_name?.split(" ")[0] ?? "Your professional"} marked this done.
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/70">
              If your service is finished, confirm it below. That&apos;s what pays them out, and then you can leave a
              review.
            </p>
            <button
              type="button"
              onClick={handleConfirmCompletion}
              disabled={actionLoading === "confirm"}
              className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-neutral-200 disabled:opacity-60"
            >
              {actionLoading === "confirm" ? "Confirming…" : "Confirm service completed"}
            </button>
          </section>
        ) : null}

        {isViewerProfessional && booking.status === "confirmed" ? (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
            <div className="min-w-0">
              <p className="font-semibold text-ink">Finished the service?</p>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Mark it complete and your client confirms. That releases your payout.
              </p>
            </div>
            {isServiceOver(booking.booking_date, booking.end_time) ? (
              <button
                type="button"
                onClick={handleRequestCompletion}
                disabled={actionLoading === "request-completion"}
                className="inline-flex shrink-0 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {actionLoading === "request-completion" ? "Requesting…" : "Mark service complete"}
              </button>
            ) : (
              <span className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-500">
                Available after {formatTime(booking.end_time)}
              </span>
            )}
          </section>
        ) : null}

        {isViewerCustomer && booking.status === "confirmed" ? (
          <p className="mt-4 px-2 text-sm leading-6 text-neutral-500">
            After the appointment your professional marks it done, then you confirm it here so they get paid.
          </p>
        ) : null}

        {/* Messages: right under the booking, not at the bottom of the page. */}
        <section
          id="booking-chat"
          className="mt-4 scroll-mt-24 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Messages</h2>
            <p className="text-xs text-neutral-400">
              {isLive ? `With ${otherPerson?.full_name?.split(" ")[0] || (isViewerCustomer ? "your professional" : "your client")}` : formatStatus(booking.status)}
            </p>
          </div>
          <BookingChat bookingId={booking.id} viewerId={viewerId} />
        </section>

        {/* Manage: cancellation and the record. */}
        <section className="mt-4 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Manage</h2>
          {isLive && (isViewerCustomer || isViewerProfessional) ? (
            <div className="mt-4">
              {!canCancelBooking(booking.booking_date, booking.start_time) ? (
                <p className="text-sm leading-6 text-neutral-500">
                  This booking is within {CANCELLATION_CUTOFF_HOURS} hours of the appointment and can no longer be
                  cancelled. Message the {isViewerCustomer ? "professional" : "client"} directly if something&apos;s come
                  up.
                </p>
              ) : confirmingCancel ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-neutral-600">Cancel and refund in full?</span>
                  <button
                    type="button"
                    onClick={handleCancelBooking}
                    disabled={actionLoading === "cancel"}
                    className="inline-flex rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {actionLoading === "cancel" ? "Working…" : "Yes, cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(false)}
                    className="inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-neutral-500">
                    Free cancellation until {formatCancellationCutoff(booking.booking_date, booking.start_time)}.
                  </p>
                  <button
                    type="button"
                    onClick={handleCancelBooking}
                    disabled={actionLoading === "cancel"}
                    className="inline-flex rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Cancel booking
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <dl className="mt-4 space-y-1 text-xs text-neutral-400">
            <div>
              <dt className="inline">Booked </dt>
              <dd className="inline">{formatDateTime(booking.created_at)}</dd>
            </div>
            {booking.completion_requested_at ? (
              <div>
                <dt className="inline">Marked done </dt>
                <dd className="inline">{formatDateTime(booking.completion_requested_at)}</dd>
              </div>
            ) : null}
            {booking.completed_at ? (
              <div>
                <dt className="inline">Completed </dt>
                <dd className="inline">{formatDateTime(booking.completed_at)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </main>

    {showReviewModal ? (
      <div className="lu-fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4">
        <div className="lu-sheet-in w-full max-w-md rounded-t-[28px] bg-white p-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:rounded-[28px] sm:p-8">
          <DrawnCheck size={44} />
          <h2 className="mt-6 text-[1.6rem] font-semibold leading-[1.08] tracking-[-0.035em]">
            <MaskLine delay={120}>Service complete.</MaskLine>
            <MaskLine delay={200} className="text-neutral-500">
              How was {professional?.full_name?.split(" ")[0] ?? "your professional"}?
            </MaskLine>
          </h2>
          <p className="mt-3 text-sm text-neutral-500">
            Your review helps other clients choose, and builds their track record.
          </p>

          <div className="mt-6 flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={reviewRating === star}
                onClick={() => setReviewRating(star)}
                className="rounded-full p-1 transition hover:scale-110"
                aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
              >
                <svg
                  // Re-keyed when selection changes so filled stars pop in turn.
                  key={star <= reviewRating ? `on-${reviewRating}` : "off"}
                  viewBox="0 0 24 24"
                  className={`h-9 w-9 ${star <= reviewRating ? "text-ink" : "text-neutral-200"}`}
                  style={
                    star <= reviewRating
                      ? { animation: `lu-check-pop 380ms var(--ease-arrive) ${(star - 1) * 45}ms backwards` }
                      : undefined
                  }
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1l-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"
                  />
                </svg>
              </button>
            ))}
          </div>

          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Share details about your experience (optional)"
            rows={3}
            className="mt-5 w-full resize-none rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-ink"
          />

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleSubmitReview}
              disabled={reviewRating === 0 || reviewSubmitting}
              className="flex-1 rounded-full bg-ink py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
            >
              {reviewSubmitting ? "Submitting…" : "Submit review"}
            </button>
            <button
              type="button"
              onClick={() => { setShowReviewModal(false); setMessage("Booking completed."); }}
              className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}