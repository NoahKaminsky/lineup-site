"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import BookingChat from "@/app/components/BookingChat";
import { getCached, setCached } from "@/app/lib/pageCache";
import { containsProfanity } from "@/app/lib/profanityFilter";

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
  const end = new Date(`${bookingDate}T${String(endTime).slice(0, 5)}:00`);
  return new Date() >= end;
}

const CANCELLATION_CUTOFF_HOURS = 24;

function canCancelBooking(bookingDate: string, startTime: string) {
  const start = new Date(`${bookingDate}T${String(startTime).slice(0, 5)}:00`);
  const hoursUntilStart = (start.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntilStart >= CANCELLATION_CUTOFF_HOURS;
}

function formatCancellationCutoff(bookingDate: string, startTime: string) {
  const start = new Date(`${bookingDate}T${String(startTime).slice(0, 5)}:00`);
  const cutoff = new Date(start.getTime() - CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000);
  return cutoff.toLocaleString("en-CA", {
    weekday: "long",
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
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


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

        <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
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

        <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
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
  const [professional, setProfessional] = useState<ProfileRow | null>(() => cached?.professional ?? null);
  const [customer, setCustomer] = useState<ProfileRow | null>(() => cached?.customer ?? null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    async function loadBooking() {
      try {
        setLoading(true);
        setMessage("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
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
            "id, request_id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, service_mode, source, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id"
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

    if (bookingId) {
      loadBooking();
    }
  }, [bookingId, router]);

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
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
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

  return (
    <>
    <main className="min-h-screen bg-white px-6 pb-28 pt-10 text-neutral-900">
      <div className="mx-auto max-w-5xl">


        <div className="py-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Booking
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
                {booking.service_name || "Booked service"}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-neutral-600">
                {formatBookingDate(booking.booking_date)} • {formatTime(booking.start_time)} -{" "}
                {formatTime(booking.end_time)}
              </p>
            </div>

            <Link
              href={viewerIsCustomerRole ? "/requests" : "/calendar"}
              className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Back
            </Link>
          </div>

          {message ? (
            <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              {message}
            </div>
          ) : null}

          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                Booking
              </span>

              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                {formatStatus(booking.status)}
              </span>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Service
                </p>
                <p className="mt-3 text-lg font-semibold text-neutral-900">
                  {booking.service_name || "Booked service"}
                </p>
                {booking.duration_minutes ? (
                  <p className="mt-1 text-sm text-neutral-500">{booking.duration_minutes} min</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Appointment type
                </p>
                <p className="mt-3 text-lg font-semibold text-neutral-900">
                  {formatServiceMode(booking.service_mode)}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {booking.source === "direct_booking" ? "Direct booking" : booking.source || "Booking"}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Professional
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                    {professional?.avatar_url ? (
                      <img
                        src={professional.avatar_url}
                        alt={professional.full_name || "Professional"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                        {professional?.full_name?.charAt(0).toUpperCase() || "P"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">
                      {professional?.full_name || "Professional"}
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {formatProfessionalTypes(professional)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Client
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                    {customer?.avatar_url ? (
                      <img
                        src={customer.avatar_url}
                        alt={customer.full_name || "Client"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                        {customer?.full_name?.charAt(0).toUpperCase() || "C"}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="font-medium text-neutral-900">
                      {customer?.full_name || "Client"}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {isViewerCustomer ? "You" : "Customer"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 p-5 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Location
                </p>
                <p className="mt-3 text-lg font-medium text-neutral-900">
                  📍 {bookingAddress}
                </p>

                {mapEmbedUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                    <iframe
                      title="Booking location map"
                      src={mapEmbedUrl}
                      width="100%"
                      height="220"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      className="block w-full border-0"
                    />
                  </div>
                ) : null}

                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </div>

              <div className="rounded-2xl border border-neutral-200 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Time
                </p>
                <p className="mt-3 text-lg font-medium text-neutral-900">
                  {formatBookingDate(booking.booking_date)}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Created
                </p>
                <p className="mt-3 text-lg font-medium text-neutral-900">
                  {formatDateTime(booking.created_at)}
                </p>
              </div>

              {booking.completion_requested_at ? (
                <div className="rounded-2xl border border-neutral-200 p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Completion requested
                  </p>
                  <p className="mt-3 text-lg font-medium text-neutral-900">
                    {formatDateTime(booking.completion_requested_at)}
                  </p>
                </div>
              ) : null}

              {booking.completed_at ? (
                <div className="rounded-2xl border border-neutral-200 p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Completed
                  </p>
                  <p className="mt-3 text-lg font-medium text-neutral-900">
                    {formatDateTime(booking.completed_at)}
                  </p>
                </div>
              ) : null}
            </div>

            {booking.status === "confirmed" ? (
              <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-sm font-semibold text-neutral-900">
                  {isViewerProfessional
                    ? "Once you've finished the service, come back here."
                    : "Once the service is done, you'll confirm it here."}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-neutral-600">
                  {isViewerProfessional
                    ? "Tap “Request completion” below and your client will be asked to confirm — that's what releases your payout."
                    : "Your professional will tap “Request completion” after the appointment, then you'll confirm it right here so they get paid."}
                </p>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {isViewerProfessional && booking.status === "confirmed" ? (
                isServiceOver(booking.booking_date, booking.end_time) ? (
                  <button
                    type="button"
                    onClick={handleRequestCompletion}
                    disabled={actionLoading === "request-completion"}
                    className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {actionLoading === "request-completion"
                      ? "Requesting..."
                      : "Request completion"}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-500">
                    Available after {formatTime(booking.end_time)} when the service ends
                  </div>
                )
              ) : null}

              {isViewerCustomer && booking.status === "completion_requested" ? (
                <button
                  type="button"
                  onClick={handleConfirmCompletion}
                  disabled={actionLoading === "confirm"}
                  className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {actionLoading === "confirm" ? "Confirming..." : "Confirm completion"}
                </button>
              ) : null}

              {(booking.status === "confirmed" || booking.status === "completion_requested") &&
              (isViewerCustomer || isViewerProfessional) ? (
                !canCancelBooking(booking.booking_date, booking.start_time) ? (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-500">
                    This booking is within {CANCELLATION_CUTOFF_HOURS} hours of the appointment and
                    can no longer be cancelled. Message the {isViewerCustomer ? "professional" : "client"}{" "}
                    directly if something&apos;s come up.
                  </div>
                ) : confirmingCancel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-600">Cancel and refund in full?</span>
                    <button
                      type="button"
                      onClick={handleCancelBooking}
                      disabled={actionLoading === "cancel"}
                      className="inline-flex rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {actionLoading === "cancel" ? "Working..." : "Yes, cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(false)}
                      className="inline-flex rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={handleCancelBooking}
                      disabled={actionLoading === "cancel"}
                      className="inline-flex w-fit rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      Cancel booking
                    </button>
                    <p className="text-xs text-neutral-400">
                      Full refund if cancelled before{" "}
                      {formatCancellationCutoff(booking.booking_date, booking.start_time)}.
                    </p>
                  </div>
                )
              ) : null}

              {isViewerCustomer && professional?.id ? (
                <Link
                  href={`/profile/${professional.id}`}
                  className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  View professional
                </Link>
              ) : null}

              {isViewerProfessional && customer?.id ? (
                <Link
                  href={`/profile/${customer.id}`}
                  className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  View client
                </Link>
              ) : null}

              {booking.status === "confirmed" || booking.status === "completion_requested" ? (
                <button
                  type="button"
                  onClick={scrollToBookingChat}
                  className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                >
                  {isViewerCustomer ? "Message professional" : "Message client"}
                </button>
              ) : null}
            </div>
          </div>

          <div
            id="booking-chat"
            className="mt-10 scroll-mt-28 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Messaging
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {isViewerCustomer ? "Message professional" : "Message client"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Keep arrival details, prep notes, timing changes, and questions attached to this booking.
                </p>
              </div>

              {booking.status === "confirmed" || booking.status === "completion_requested" ? (
                <span className="w-fit rounded-full bg-black px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                  Active chat
                </span>
              ) : booking.status === "cancelled" ? (
                <span className="w-fit rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700">
                  Cancelled
                </span>
              ) : (
                <span className="w-fit rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  {formatStatus(booking.status)}
                </span>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
              {booking.status === "confirmed" || booking.status === "completion_requested"
                ? isViewerCustomer
                  ? "Message the professional about arrival details, prep notes, or timing changes."
                  : "Message the client about arrival details, prep notes, or timing changes."
                : isViewerCustomer
                ? "Use this chat to message the professional after your booking is confirmed."
                : "Use this chat to message the client after the booking is confirmed."}
            </div>

            <div className="mt-6">
              <BookingChat bookingId={booking.id} viewerId={viewerId} />
            </div>
          </div>
        </div>
      </div>
    </main>

    {showReviewModal ? (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Service complete
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            How was {professional?.full_name?.split(" ")[0] ?? "your professional"}?
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Your review helps other customers and supports the professional.
          </p>

          <div className="mt-6 flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewRating(star)}
                className="text-3xl transition hover:scale-110"
                aria-label={`Rate ${star} stars`}
              >
                <span className={star <= reviewRating ? "text-black" : "text-neutral-200"}>
                  ★
                </span>
              </button>
            ))}
          </div>

          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Share details about your experience (optional)"
            rows={3}
            className="mt-5 w-full resize-none rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
          />

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleSubmitReview}
              disabled={reviewRating === 0 || reviewSubmitting}
              className="flex-1 rounded-full bg-black py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {reviewSubmitting ? "Submitting..." : "Submit review"}
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