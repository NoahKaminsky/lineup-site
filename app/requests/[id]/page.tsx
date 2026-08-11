"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import MarkRequestNotificationRead from "../../components/MarkRequestNotificationRead";
import { getCached, setCached } from "@/app/lib/pageCache";
import { getCustomerRatingsMap, type CustomerRatingSummary } from "@/app/lib/customerRatings";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  categories?: string[] | null;
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
  status: "open" | "accepted" | "completion_requested" | "completed" | string;
  target_professions: string[] | null;
  accepted_professional_id: string | null;
  created_at: string;
  reference_photos: string[] | null;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  preferred_end_time?: string | null;
  timing_flexibility?: string | null;
  scheduled_date?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
};

type RequestOffer = {
  id: string;
  request_id: string;
  professional_id: string;
  message: string | null;
  proposed_price: string | null;
  proposed_date?: string | null;
  proposed_start_time?: string | null;
  proposed_end_time?: string | null;
  matches_requested_time?: boolean | null;
  status: "pending" | "accepted" | "declined" | "not_selected" | "withdrawn" | "payment_pending" | string;
  created_at: string;
  responded_at?: string | null;
  viewed_by_customer?: boolean | null;
  customer_response_message?: string | null;
  professional_name: string | null;
  professional_avatar_url: string | null;
  professional_type: string | null;
  professional_formatted_address?: string | null;
  proposed_service_mode?: string | null;
  average_rating?: number | null;
  review_count?: number;
};

type RequestOwnerProfile = {
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type ExistingReview = {
  id: string;
  request_id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
};

type ChatMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

type ChatParticipantProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function RequestOfferCheckoutForm({
  offer,
  onPaymentComplete,
}: {
  offer: RequestOffer;
  onPaymentComplete: () => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) {
      setPaymentError("Stripe is still loading. Please try again.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/work`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setPaymentError(result.error.message || "Payment failed. Please try again.");
      setPaymentLoading(false);
      return;
    }

    await onPaymentComplete();
    setPaymentLoading(false);
  }

  return (
    <form onSubmit={handlePaymentSubmit} className="mt-6 space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Offer total
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
          {offer.proposed_price || "Price not provided"}
        </p>
      </div>

      <PaymentElement />

      {paymentError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {paymentError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || !elements || paymentLoading}
        className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {paymentLoading ? "Processing..." : "Confirm and pay"}
      </button>
    </form>
  );
}

type RequestDetailCache = {
  request: ServiceRequest | null;
  offers: RequestOffer[];
};

export default function RequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;
  const cacheKey = `request-detail-${requestId}`;
  const cached = getCached<RequestDetailCache>(cacheKey);

  const [loading, setLoading] = useState(() => !cached);
  const [message, setMessage] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewerLat, setViewerLat] = useState<number | null>(null);
  const [viewerLng, setViewerLng] = useState<number | null>(null);

  const [request, setRequest] = useState<ServiceRequest | null>(() => cached?.request ?? null);
  const [offers, setOffers] = useState<RequestOffer[]>(() => cached?.offers ?? []);
  const [requestOwner, setRequestOwner] = useState<RequestOwnerProfile | null>(
    null
  );
  const [requestOwnerRating, setRequestOwnerRating] = useState<CustomerRatingSummary | null>(null);
  const [chatProfiles, setChatProfiles] = useState<
    Record<string, ChatParticipantProfile>
  >({});

  const [hasSubmittedOffer, setHasSubmittedOffer] = useState(false);
  const [unreadOfferIds, setUnreadOfferIds] = useState<string[]>([]);

  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");
  const [declineLoading, setDeclineLoading] = useState(false);

  const [editingReofferId, setEditingReofferId] = useState<string | null>(null);
  const [reofferMessage, setReofferMessage] = useState("");
  const [reofferPrice, setReofferPrice] = useState("");
  const [reofferLoading, setReofferLoading] = useState(false);
  const [withdrawingOfferId, setWithdrawingOfferId] = useState<string | null>(null);
  const [cancelingRequest, setCancelingRequest] = useState(false);
  const [confirmingCancelRequest, setConfirmingCancelRequest] = useState(false);
  const [cancelingBooking, setCancelingBooking] = useState(false);
  const [confirmingCancelBooking, setConfirmingCancelBooking] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);

  const [showBookingSuccessModal, setShowBookingSuccessModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [selectedOfferForPayment, setSelectedOfferForPayment] =
    useState<RequestOffer | null>(null);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(
    null
  );

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const normalizedRole = role?.toLowerCase().trim() || "";
  const isCustomer = normalizedRole.includes("customer");
  const isProfessional = !!normalizedRole && !normalizedRole.includes("customer");

  const isAcceptedProfessional = useMemo(() => {
    if (!request || !currentUserId) return false;
    return currentUserId === request.accepted_professional_id;
  }, [request, currentUserId]);

  const canAccessChat = useMemo(() => {
    if (!request || !currentUserId || !request.accepted_professional_id) {
      return false;
    }

    return (
      currentUserId === request.client_id ||
      currentUserId === request.accepted_professional_id
    );
  }, [request, currentUserId]);

  const isChatReadOnly = request?.status === "completed";

  function formatCategory(category: string) {
    return category
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatMode(mode: string | null) {
    if (!mode) return "Not provided";
    if (mode === "in_shop") return "In shop";
    if (mode === "at_home") return "At home";
    if (mode === "home_studio") return "Home studio";
    return mode.replaceAll("_", " ");
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatChatTime(dateString: string) {
    return new Date(dateString).toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDateOnly(dateString: string) {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-CA", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(timeString: string) {
    const [hourString, minute] = timeString.split(":");
    const hour = Number(hourString);
    const suffix = hour >= 12 ? "PM" : "AM";
    const twelveHour = hour % 12 || 12;
    return `${twelveHour}:${minute} ${suffix}`;
  }

  function timeToMinutes(timeString: string) {
    const [hours, minutes] = String(timeString).slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
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

  async function handleCancelBooking() {
    if (!request || !currentUserId) return;
    if (request.status !== "accepted" && request.status !== "completion_requested") return;

    if (!confirmingCancelBooking) {
      setConfirmingCancelBooking(true);
      return;
    }

    setConfirmingCancelBooking(false);
    setCancelingBooking(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ requestId: request.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Could not cancel this booking.");
        return;
      }

      setRequest((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      setMessage(
        data.refundStatus === "refunded"
          ? "Booking cancelled and a full refund has been issued."
          : data.refundStatus === "failed"
          ? "Booking cancelled, but the refund didn't go through — we've been notified and will follow up."
          : "Booking cancelled."
      );
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong cancelling this booking.");
    } finally {
      setCancelingBooking(false);
    }
  }

  function getStatusLabel(status: string) {
    if (status === "open") return "Open";
    if (status === "accepted") return "Accepted";
    if (status === "payment_pending") return "Payment pending";
    if (status === "completion_requested") return "Completion requested";
    if (status === "completed") return "Completed";
    if (status === "declined") return "Declined";
    if (status === "not_selected") return "Outbid";
    return status.replaceAll("_", " ");
  }

  function formatProfessionalType(value: string | null) {
    if (!value) return "Beauty professional";
    return value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatRating(value?: number | null, count?: number) {
    if (typeof value === "number" && count) {
      return `${value.toFixed(1)} ★ (${count} ${count === 1 ? "review" : "reviews"})`;
    }
    return "No reviews yet";
  }

  function formatDisplayAddress(currentRequest: ServiceRequest | null) {
    const rawAddress =
      currentRequest?.formatted_address || currentRequest?.location || "";

    if (!rawAddress.trim()) return "Not provided";

    return rawAddress.trim();
  }

  function getGoogleMapsUrl(
    lat?: number | null,
    lng?: number | null,
    address?: string | null
  ) {
    if (typeof lat === "number" && typeof lng === "number") {
      return `https://www.google.com/maps?q=${lat},${lng}`;
    }

    if (address?.trim()) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        address.trim()
      )}`;
    }

    return null;
  }

  function getGoogleMapsEmbedUrl(
    lat?: number | null,
    lng?: number | null,
    address?: string | null
  ) {
    if (typeof lat === "number" && typeof lng === "number") {
      return `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
    }

    if (address?.trim()) {
      return `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&z=16&output=embed`;
    }

    return null;
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

  function getDistanceLabel(currentRequest: ServiceRequest | null) {
    if (
      typeof viewerLat !== "number" ||
      typeof viewerLng !== "number" ||
      typeof currentRequest?.location_lat !== "number" ||
      typeof currentRequest?.location_lng !== "number"
    ) {
      return null;
    }

    const distance = getDistanceKm(
      viewerLat,
      viewerLng,
      currentRequest.location_lat,
      currentRequest.location_lng
    );

    if (!Number.isFinite(distance)) return null;

    if (distance < 1) {
      return `${Math.round(distance * 1000)} m away`;
    }

    return `${distance.toFixed(1)} km away`;
  }

  function getScheduledSummary(currentRequest: ServiceRequest | null) {
    if (
      !currentRequest?.scheduled_date ||
      !currentRequest?.scheduled_start_time ||
      !currentRequest?.scheduled_end_time
    ) {
      return null;
    }

    return `${formatDateOnly(currentRequest.scheduled_date)} • ${formatTime(
      currentRequest.scheduled_start_time
    )} - ${formatTime(currentRequest.scheduled_end_time)}`;
  }

  function getPreferredSummary(currentRequest: ServiceRequest | null) {
    if (!currentRequest) return null;

    if (currentRequest.timing_flexibility === "anytime") {
      return "Anytime";
    }

    if (
      currentRequest.preferred_date &&
      currentRequest.preferred_start_time &&
      currentRequest.preferred_end_time
    ) {
      return `${formatDateOnly(currentRequest.preferred_date)} • ${formatTime(
        currentRequest.preferred_start_time
      )} - ${formatTime(currentRequest.preferred_end_time)}`;
    }

    if (
      currentRequest.preferred_date &&
      currentRequest.preferred_start_time
    ) {
      return `${formatDateOnly(currentRequest.preferred_date)} • ${formatTime(
        currentRequest.preferred_start_time
      )}`;
    }

    if (currentRequest.preferred_date) {
      return formatDateOnly(currentRequest.preferred_date);
    }

    return null;
  }

  function getOfferTimingSummary(offer: RequestOffer) {
    if (
      offer.proposed_date &&
      offer.proposed_start_time &&
      offer.proposed_end_time
    ) {
      return `${formatDateOnly(offer.proposed_date)} • ${formatTime(
        String(offer.proposed_start_time).slice(0, 5)
      )} - ${formatTime(String(offer.proposed_end_time).slice(0, 5))}`;
    }

    if (offer.proposed_date && offer.proposed_start_time) {
      return `${formatDateOnly(offer.proposed_date)} • ${formatTime(
        String(offer.proposed_start_time).slice(0, 5)
      )}`;
    }

    if (offer.proposed_date) {
      return formatDateOnly(offer.proposed_date);
    }

    return null;
  }

  useEffect(() => {
    if (typeof viewerLat === "number" && typeof viewerLng === "number") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setViewerLat(position.coords.latitude);
        setViewerLng(position.coords.longitude);
      },
      () => {
        // Browser location is optional. Professionals with a saved business
        // location will still see distance based on their profile coordinates.
      }
    );
  }, [viewerLat, viewerLng]);

  const loadRequestLive = useCallback(async (options?: { silent?: boolean }) => {
    if (!requestId) return;

    const silent = options?.silent ?? false;

    if (!silent) setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      return;
    }

    setCurrentUserId(user.id);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, professional_type, location_lat, location_lng")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setMessage("Could not load profile.");
      setLoading(false);
      return;
    }

    setRole(profile.role);

    if (typeof (profile as any).location_lat === "number") {
      setViewerLat((profile as any).location_lat);
    }

    if (typeof (profile as any).location_lng === "number") {
      setViewerLng((profile as any).location_lng);
    }

    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      setMessage("Request not found or you do not have access.");
      setLoading(false);
      return;
    }

    setRequest(requestData);

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", requestData.client_id)
      .single();

    setRequestOwner(ownerProfile ?? null);

    if (isProfessional && requestData.client_id) {
      const ratingsMap = await getCustomerRatingsMap([requestData.client_id]);
      setRequestOwnerRating(ratingsMap[requestData.client_id] ?? null);
    } else {
      setRequestOwnerRating(null);
    }

    let offersQuery = supabase
      .from("request_offers")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    if (isProfessional) {
      offersQuery = offersQuery.eq("professional_id", user.id);
    }

    const { data: offersData, error: offersError } = await offersQuery;

    let enrichedOffers: RequestOffer[] = [];

    if (!offersError && offersData) {
      const alreadyOffered = offersData.some(
        (offer) =>
          offer.professional_id === user.id &&
          (offer.status === "pending" || offer.status === "accepted") &&
          offer.status !== "withdrawn"
      );

      setHasSubmittedOffer(alreadyOffered);

      const professionalIds = [
        ...new Set(offersData.map((offer) => offer.professional_id)),
      ];

      let profilesMap = new Map<
        string,
        {
          full_name: string | null;
          avatar_url: string | null;
          professional_type: string | null;
          formatted_address: string | null;
        }
      >();

      let ratingsMap = new Map<
        string,
        {
          average_rating: number | null;
          review_count: number;
        }
      >();

      if (professionalIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, professional_type, formatted_address")
          .in("id", professionalIds);

        if (profileData) {
          profilesMap = new Map(
            profileData.map((profileRow) => [
              profileRow.id,
              {
                full_name: profileRow.full_name ?? null,
                avatar_url: profileRow.avatar_url ?? null,
                professional_type: profileRow.professional_type ?? null,
                formatted_address: (profileRow as any).formatted_address ?? null,
              },
            ])
          );
        }

        const { data: reviewsData } = await supabase
          .from("professional_reviews")
          .select("professional_id, rating")
          .in("professional_id", professionalIds);

        if (reviewsData) {
          const grouped = new Map<string, number[]>();

          for (const review of reviewsData) {
            const existing = grouped.get(review.professional_id) ?? [];
            existing.push(Number(review.rating));
            grouped.set(review.professional_id, existing);
          }

          ratingsMap = new Map(
            Array.from(grouped.entries()).map(([professionalId, ratings]) => {
              const total = ratings.reduce((sum, value) => sum + value, 0);
              const avg = ratings.length ? total / ratings.length : null;

              return [
                professionalId,
                {
                  average_rating: avg,
                  review_count: ratings.length,
                },
              ];
            })
          );
        }
      }

      enrichedOffers = offersData.filter((o) => o.status !== "withdrawn").map((offer) => {
        const pro = profilesMap.get(offer.professional_id);
        const ratingData = ratingsMap.get(offer.professional_id);

        return {
          ...offer,
          professional_name: pro?.full_name ?? null,
          professional_avatar_url: pro?.avatar_url ?? null,
          professional_type: pro?.professional_type ?? null,
          professional_formatted_address: pro?.formatted_address ?? null,
          average_rating: ratingData?.average_rating ?? null,
          review_count: ratingData?.review_count ?? 0,
        };
      });

      setOffers(enrichedOffers);

      if (isCustomer) {
        const ids = offersData
          .filter((offer) => !offer.viewed_by_customer)
          .map((offer) => offer.id);

        setUnreadOfferIds(ids);

        await supabase
          .from("request_offers")
          .update({ viewed_by_customer: true })
          .eq("request_id", requestId)
          .eq("viewed_by_customer", false);
      } else {
        setUnreadOfferIds([]);
      }
    } else {
      setOffers([]);
      setHasSubmittedOffer(false);
      setUnreadOfferIds([]);
    }

    const acceptedOffer = enrichedOffers.find((offer) => offer.status === "accepted");

    if (requestData.status === "completed" && isCustomer && acceptedOffer) {
      const { data: existingReviewData } = await supabase
        .from("professional_reviews")
        .select("id, request_id, professional_id, reviewer_id, rating, comment")
        .eq("request_id", requestData.id)
        .eq("reviewer_id", user.id)
        .maybeSingle();

      if (existingReviewData) {
        setExistingReview(existingReviewData);
        setReviewRating(existingReviewData.rating);
        setReviewComment(existingReviewData.comment ?? "");
      } else {
        setExistingReview(null);
        setReviewRating(5);
        setReviewComment("");
      }
    } else {
      setExistingReview(null);
    }

    const canAccessChatNow =
      !!requestData.accepted_professional_id &&
      (user.id === requestData.client_id ||
        user.id === requestData.accepted_professional_id);

    if (canAccessChatNow) {
      const { data: bookingRow } = await supabase
        .from("bookings")
        .select("id")
        .eq("request_id", requestId)
        .maybeSingle();

      const bookingIdForChat = bookingRow?.id ?? null;
      setChatBookingId(bookingIdForChat);

      if (bookingIdForChat) {
        const { data: messagesData, error: messagesError } = await supabase
          .from("booking_messages")
          .select("id, booking_id, sender_id, message, created_at")
          .eq("booking_id", bookingIdForChat)
          .order("created_at", { ascending: true });

        if (!messagesError && messagesData) {
          setChatMessages(messagesData);

          const senderIds = [...new Set(messagesData.map((msg) => msg.sender_id))];
          if (senderIds.length > 0) {
            const { data: senderProfiles } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", senderIds);

            if (senderProfiles) {
              const profileMap: Record<string, ChatParticipantProfile> = {};
              senderProfiles.forEach((p) => {
                profileMap[p.id] = {
                  id: p.id,
                  full_name: p.full_name ?? null,
                  avatar_url: p.avatar_url ?? null,
                };
              });
              setChatProfiles(profileMap);
            }
          }
        } else {
          setChatMessages([]);
          setChatProfiles({});
        }
      } else {
        setChatMessages([]);
        setChatProfiles({});
      }
    } else {
      setChatBookingId(null);
      setChatMessages([]);
      setChatProfiles({});
    }

    setCached<RequestDetailCache>(cacheKey, { request: requestData, offers: enrichedOffers });
    setLoading(false);
  }, [requestId, router, isCustomer, isProfessional, cacheKey]);

  useEffect(() => {
    loadRequestLive({ silent: !!cached });
  }, [loadRequestLive]);

  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`request-detail-live-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${requestId}`,
        },
        async () => {
          await loadRequestLive({ silent: true });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_offers",
          filter: `request_id=eq.${requestId}`,
        },
        async () => {
          await loadRequestLive({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, loadRequestLive]);

  useEffect(() => {
    if (!requestId || !currentUserId || !request?.accepted_professional_id || !chatBookingId) return;

    const canAccessCurrentChat =
      currentUserId === request.client_id ||
      currentUserId === request.accepted_professional_id;

    if (!canAccessCurrentChat) return;

    const channel = supabase
      .channel(`booking-messages-${chatBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_messages",
          filter: `booking_id=eq.${chatBookingId}`,
        },
        async (payload) => {
          const incoming = payload.new as ChatMessage;

          setChatMessages((prev) => {
            if (prev.some((msg) => msg.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (!chatProfiles[incoming.sender_id]) {
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .eq("id", incoming.sender_id)
              .single();

            if (senderProfile) {
              setChatProfiles((prev) => ({
                ...prev,
                [senderProfile.id]: {
                  id: senderProfile.id,
                  full_name: senderProfile.full_name ?? null,
                  avatar_url: senderProfile.avatar_url ?? null,
                },
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    requestId,
    currentUserId,
    request?.accepted_professional_id,
    request?.client_id,
    chatProfiles,
    chatBookingId,
  ]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  async function handleAcceptOffer(offerId: string) {
    if (!request || !isCustomer || request.status !== "open") return;

    setMessage("");
    setAcceptingOfferId(offerId);

    const acceptedOffer = offers.find((offer) => offer.id === offerId);

    if (!acceptedOffer) {
      setMessage("Offer not found.");
      setAcceptingOfferId(null);
      return;
    }

    if (
      !acceptedOffer.proposed_date ||
      !acceptedOffer.proposed_start_time ||
      !acceptedOffer.proposed_end_time
    ) {
      setMessage("This offer needs a date, start time, and end time before it can be accepted.");
      setAcceptingOfferId(null);
      return;
    }

    if (!acceptedOffer.proposed_price?.trim()) {
      setMessage("This offer needs a valid price before it can be accepted.");
      setAcceptingOfferId(null);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Not authenticated. Please log out and log back in.");
      }

      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          flowType: "request_offer",
          offerId: acceptedOffer.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Could not start payment.");
      }

      if (!data?.clientSecret) {
        throw new Error("Payment was created without a client secret.");
      }

      setSelectedOfferForPayment(acceptedOffer);
      setPaymentClientSecret(data.clientSecret);
      setShowPaymentModal(true);
      setMessage("");
    } catch (error: any) {
      setMessage(error?.message || "Something went wrong starting payment.");
    } finally {
      setAcceptingOfferId(null);
    }
  }

  async function handleDeclineOffer(offerId: string) {
    if (!declineMessage.trim()) {
      setMessage("Please enter a reason for declining this offer.");
      return;
    }

    setMessage("");
    setDeclineLoading(true);

    const respondedAt = new Date().toISOString();

    const { error } = await supabase
      .from("request_offers")
      .update({
        status: "declined",
        customer_response_message: declineMessage.trim(),
        responded_at: respondedAt,
      })
      .eq("id", offerId)
      .eq("request_id", requestId);

    if (error) {
      setMessage(error.message);
      setDeclineLoading(false);
      return;
    }

    await supabase.from("notifications").delete().eq("offer_id", offerId);

    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === offerId
          ? {
              ...offer,
              status: "declined",
              customer_response_message: declineMessage.trim(),
              responded_at: respondedAt,
            }
          : offer
      )
    );

    setDecliningOfferId(null);
    setDeclineMessage("");
    setDeclineLoading(false);
    setMessage("Offer declined.");
  }

  async function handleReoffer(offerId: string) {
    if (!reofferMessage.trim()) {
      setMessage("Please enter an updated offer message.");
      return;
    }

    if (!reofferPrice.trim()) {
      setMessage("Please enter an updated price.");
      return;
    }

    setMessage("");
    setReofferLoading(true);

    const { error } = await supabase
      .from("request_offers")
      .update({
        message: reofferMessage.trim(),
        proposed_price: reofferPrice.trim(),
        status: "pending",
        customer_response_message: null,
        viewed_by_customer: false,
        responded_at: null,
      })
      .eq("id", offerId)
      .eq("request_id", requestId);

    if (error) {
      setMessage(error.message);
      setReofferLoading(false);
      return;
    }

    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === offerId
          ? {
              ...offer,
              message: reofferMessage.trim(),
              proposed_price: reofferPrice.trim(),
              status: "pending",
              customer_response_message: null,
              viewed_by_customer: false,
              responded_at: null,
            }
          : offer
      )
    );

    setEditingReofferId(null);
    setReofferMessage("");
    setReofferPrice("");
    setReofferLoading(false);
    setHasSubmittedOffer(true);
    setMessage("Re-offer submitted.");
  }

  async function handleWithdrawOffer(offerId: string) {
    if (!currentUserId) return;

    setWithdrawingOfferId(offerId);

    const { error } = await supabase
      .from("request_offers")
      .update({ status: "withdrawn" })
      .eq("id", offerId)
      .eq("professional_id", currentUserId);

    if (error) {
      setMessage(error.message);
      setWithdrawingOfferId(null);
      return;
    }

    fetch("/api/notifications/clear-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
    }).catch(() => {});

    setOffers((prev) => prev.filter((o) => o.id !== offerId));
    setHasSubmittedOffer(false);
    setWithdrawingOfferId(null);
  }

  async function handleCancelRequest() {
    if (!request || !currentUserId || !isCustomer || request.status !== "open") return;

    if (!confirmingCancelRequest) {
      setConfirmingCancelRequest(true);
      return;
    }

    setConfirmingCancelRequest(false);
    setCancelingRequest(true);
    setMessage("");

    const { error } = await supabase
      .from("service_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", request.id)
      .eq("client_id", currentUserId)
      .eq("status", "open");

    if (error) {
      setMessage(error.message);
      setCancelingRequest(false);
      return;
    }

    const pendingOfferProfessionalIds = [
      ...new Set(
        offers.filter((offer) => offer.status === "pending").map((offer) => offer.professional_id)
      ),
    ];

    if (pendingOfferProfessionalIds.length > 0) {
      await supabase
        .from("request_offers")
        .update({
          status: "declined",
          customer_response_message: "The customer cancelled this request.",
          responded_at: new Date().toISOString(),
        })
        .eq("request_id", request.id)
        .eq("status", "pending");

      await supabase.from("notifications").insert(
        pendingOfferProfessionalIds.map((professionalId) => ({
          user_id: professionalId,
          request_id: request.id,
          is_read: false,
          type: "request_cancelled",
          title: `A request you offered on was cancelled${
            request.title ? `: ${request.title}` : ""
          }`,
        }))
      );
    }

    // Clear the original "new request" pings for matching pros — the request no longer exists.
    fetch("/api/notifications/clear-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: request.id }),
    }).catch(() => {});

    // Clear our own now-stale "you received an offer" notifications for this request.
    await supabase.from("notifications").delete().eq("request_id", request.id).eq("type", "offer");

    setRequest((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    setOffers((prev) =>
      prev.map((offer) =>
        offer.status === "pending"
          ? {
              ...offer,
              status: "declined",
              customer_response_message: "The customer cancelled this request.",
              responded_at: new Date().toISOString(),
            }
          : offer
      )
    );
    setMessage("Request cancelled.");
    setCancelingRequest(false);
  }

  async function handleRequestCompletion() {
    if (!request || !isAcceptedProfessional || request.status !== "accepted") {
      return;
    }

    if (request.scheduled_date && request.scheduled_end_time &&
        !isServiceOver(request.scheduled_date, request.scheduled_end_time)) {
      setMessage(`You can request completion after ${formatTime(request.scheduled_end_time)} when the service ends.`);
      return;
    }

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
      body: JSON.stringify({ requestId: request.id, action: "request" }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.error || "Could not request completion.");
      return;
    }

    if (currentUserId && chatBookingId) {
      await supabase.from("booking_messages").insert([
        {
          booking_id: chatBookingId,
          sender_id: currentUserId,
          message: "Completion requested. Waiting for customer confirmation.",
        },
      ]);
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: "completion_requested",
          }
        : prev
    );

    setMessage("Completion request sent. Waiting for customer confirmation.");
  }

  async function handleConfirmCompletion() {
    if (!request || !isCustomer || request.status !== "completion_requested") {
      return;
    }

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
      body: JSON.stringify({ requestId: request.id, action: "confirm" }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.error || "Could not confirm completion.");
      return;
    }

    if (currentUserId && chatBookingId) {
      await supabase.from("booking_messages").insert([
        {
          booking_id: chatBookingId,
          sender_id: currentUserId,
          message: "Service confirmed as completed.",
        },
      ]);
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: "completed",
          }
        : prev
    );

    if (data.needsReview) {
      setMessage("Service confirmed as completed. Leave a review below to let others know how it went.");
    } else {
      setMessage("Service confirmed as completed.");
    }
  }

  async function handleSubmitReview() {
    if (!request) return;

    const acceptedOffer = offers.find((offer) => offer.status === "accepted");

    if (!acceptedOffer) {
      setMessage("No accepted professional found for this request.");
      return;
    }

    setSubmittingReview(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in to leave a review.");
      setSubmittingReview(false);
      return;
    }

    const { data, error } = await supabase
      .from("professional_reviews")
      .insert([
        {
          request_id: request.id,
          booking_id: chatBookingId || null,
          professional_id: acceptedOffer.professional_id,
          reviewer_id: user.id,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        },
      ])
      .select("id, request_id, professional_id, reviewer_id, rating, comment")
      .single();

    if (error) {
      setMessage(error.message);
      setSubmittingReview(false);
      return;
    }

    setExistingReview(data);
    setMessage("Review submitted.");
    setSubmittingReview(false);
  }

  async function handleSendChatMessage() {
    if (!request || !currentUserId || !newChatMessage.trim()) return;
    if (!canAccessChat || !chatBookingId) return;
    if (request.status === "completed") return;

    setSendingChatMessage(true);
    setMessage("");

    const messageToSend = newChatMessage.trim();
    setNewChatMessage("");

    const { error } = await supabase.from("booking_messages").insert([
      {
        booking_id: chatBookingId,
        sender_id: currentUserId,
        message: messageToSend,
      },
    ]);

    if (error) {
      setMessage(error.message);
      setNewChatMessage(messageToSend);
      setSendingChatMessage(false);
      return;
    }

    setSendingChatMessage(false);
  }

  const acceptedOffer = useMemo(() => {
    return offers.find((offer) => offer.status === "accepted") ?? null;
  }, [offers]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      if (a.status === "accepted" && b.status !== "accepted") return -1;
      if (a.status !== "accepted" && b.status === "accepted") return 1;
      if (unreadOfferIds.includes(a.id) && !unreadOfferIds.includes(b.id)) return -1;
      if (!unreadOfferIds.includes(a.id) && unreadOfferIds.includes(b.id)) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [offers, unreadOfferIds]);

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

          <div className="mt-8 grid grid-cols-3 gap-2 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-2">
            <div className="h-11 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-11 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-11 animate-pulse rounded-2xl bg-neutral-100" />
          </div>

          <div className="mt-8 grid gap-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
                    <div className="min-w-0 flex-1">
                      <div className="flex gap-2">
                        <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-100" />
                        <div className="h-6 w-28 animate-pulse rounded-full bg-neutral-100" />
                      </div>
                      <div className="mt-4 h-7 w-2/3 animate-pulse rounded-xl bg-neutral-200" />
                      <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-neutral-100" />
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 md:w-52">
                    <div className="h-10 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-10 animate-pulse rounded-full bg-neutral-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-5xl py-16">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            ← Back to requests
          </Link>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Request not found."}
          </div>
        </div>
      </main>
    );
  }

  const scheduledSummary = getScheduledSummary(request);
  const preferredSummary = getPreferredSummary(request);

  const resolvedRequestServiceMode = acceptedOffer?.proposed_service_mode || request.service_mode;

  const usesProLocation =
    resolvedRequestServiceMode === "in_shop" || resolvedRequestServiceMode === "home_studio";

  const proLocationAddress = usesProLocation
    ? acceptedOffer?.professional_formatted_address ?? null
    : null;

  const effectiveAddress = usesProLocation
    ? proLocationAddress
    : (request.formatted_address || request.location || null);

  const displayAddress = usesProLocation
    ? (proLocationAddress ?? null)
    : formatDisplayAddress(request);

  const distanceLabel = getDistanceLabel(request);
  const mapsUrl = getGoogleMapsUrl(
    usesProLocation ? null : request.location_lat,
    usesProLocation ? null : request.location_lng,
    effectiveAddress
  );
  const mapEmbedUrl = getGoogleMapsEmbedUrl(
    usesProLocation ? null : request.location_lat,
    usesProLocation ? null : request.location_lng,
    effectiveAddress
  );

  return (
    <>

      <main className="min-h-screen bg-white px-6 pb-10 pt-6 text-neutral-900">
        <MarkRequestNotificationRead requestId={requestId} />

        <div className="mx-auto max-w-6xl py-6">
          <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="bg-black px-6 py-8 text-white md:px-8 md:py-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                    {(request.categories?.length ? request.categories : [request.category])
                      .map((c) => formatCategory(c))
                      .join(" + ")}
                    {request.service_detail ? ` • ${request.service_detail}` : ""}
                  </span>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-black">
                    {getStatusLabel(request.status)}
                  </span>

                  {offers.length > 0 ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                      {offers.length} offer{offers.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                {isCustomer && request.status === "open" ? (
                  confirmingCancelRequest ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/70">Cancel this request?</span>
                      <button
                        type="button"
                        onClick={handleCancelRequest}
                        disabled={cancelingRequest}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
                      >
                        {cancelingRequest ? "Cancelling..." : "Yes, cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelRequest(false)}
                        className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                      >
                        Never mind
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCancelRequest}
                      className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                    >
                      Cancel request
                    </button>
                  )
                ) : null}
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight md:text-5xl">
                {request.title}
              </h1>

              {request.description ? (
                <p className="mt-5 max-w-3xl text-base leading-8 text-white/75 md:text-lg">
                  {request.description}
                </p>
              ) : null}

              {requestOwner ? (
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-full border border-white/20 bg-white/10">
                    {requestOwner.avatar_url ? (
                      <img
                        src={requestOwner.avatar_url}
                        alt={requestOwner.full_name || "Customer"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-medium text-white/80">
                        {requestOwner.full_name?.charAt(0).toUpperCase() || "C"}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-white/60">Posted by</p>
                    <p className="font-semibold text-white">
                      {requestOwner.full_name || "Customer"}
                    </p>
                    {requestOwnerRating ? (
                      <p className="mt-0.5 text-xs text-white/70">
                        ★ {requestOwnerRating.average.toFixed(1)} ({requestOwnerRating.count} rating
                        {requestOwnerRating.count === 1 ? "" : "s"} from pros)
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid items-start gap-4 px-4 py-5 sm:px-6 md:px-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Preferred time
                  </p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {preferredSummary || "Not provided"}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {acceptedOffer ? "Service mode" : "Open to"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {acceptedOffer
                      ? formatMode(resolvedRequestServiceMode)
                      : (request.service_modes?.length
                          ? request.service_modes
                          : request.service_mode
                          ? [request.service_mode]
                          : []
                        )
                          .map(formatMode)
                          .join(" or ") || "Not provided"}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Budget
                  </p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {request.budget || "Not provided"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      {usesProLocation ? "Professional's location" : "Location"}
                    </p>
                    {usesProLocation && !proLocationAddress ? (
                      <p className="mt-2 text-sm text-neutral-500">
                        Shown once an offer is accepted.
                      </p>
                    ) : (
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-neutral-900">
                        📍 {displayAddress}
                      </p>
                    )}
                    {distanceLabel && !usesProLocation ? (
                      <p className="mt-1 text-xs font-medium text-neutral-500">
                        {distanceLabel}
                      </p>
                    ) : null}
                  </div>

                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 justify-center rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </div>

                {mapEmbedUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                    <iframe
                      title="Request location map"
                      src={mapEmbedUrl}
                      width="100%"
                      height="180"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="block h-[150px] w-full border-0 sm:h-[190px] lg:h-[210px]"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {scheduledSummary ? (
              <div className="px-4 pb-5 sm:px-6 md:px-8">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Scheduled service time
                  </p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {scheduledSummary}
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              {acceptedOffer ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Accepted professional
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                        This request has a winner
                      </h2>
                    </div>

                    <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                      Accepted
                    </span>
                  </div>

                  <Link
                    href={`/profile/${acceptedOffer.professional_id}`}
                    className="mt-6 flex items-center gap-4 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5 transition hover:opacity-90"
                  >
                    <div className="h-16 w-16 overflow-hidden rounded-full border border-neutral-200 bg-white">
                      {acceptedOffer.professional_avatar_url ? (
                        <img
                          src={acceptedOffer.professional_avatar_url}
                          alt={acceptedOffer.professional_name || "Professional"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                          {acceptedOffer.professional_name?.charAt(0).toUpperCase() || "P"}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-neutral-900">
                        {acceptedOffer.professional_name || "Professional"}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {formatProfessionalType(acceptedOffer.professional_type)}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {formatRating(
                          acceptedOffer.average_rating,
                          acceptedOffer.review_count
                        )}
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">
                        {acceptedOffer.proposed_price || "Price not provided"}
                      </p>
                      {getOfferTimingSummary(acceptedOffer) ? (
                        <p className="mt-2 text-sm text-neutral-600">
                          {getOfferTimingSummary(acceptedOffer)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </section>
              ) : null}

              {request.reference_photos && request.reference_photos.length > 0 ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Reference photos
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                        Visual inspiration
                      </h2>
                    </div>

                    <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                      {request.reference_photos.length} photo
                      {request.reference_photos.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {request.reference_photos.map((photoUrl, index) => (
                      <button
                        key={`${photoUrl}-${index}`}
                        type="button"
                        onClick={() => setSelectedPhoto(photoUrl)}
                        className={`overflow-hidden rounded-[1.5rem] border border-neutral-200 transition hover:opacity-90 ${
                          index === 0 ? "sm:col-span-2" : ""
                        }`}
                      >
                        <img
                          src={photoUrl}
                          alt={`Reference ${index + 1}`}
                          className={`w-full object-cover ${index === 0 ? "h-56" : "h-40"}`}
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section id="offers" className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Offers
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                      {isCustomer ? "Choose the right professional" : "Offer activity"}
                    </h2>
                  </div>

                  {sortedOffers.length > 0 ? (
                    <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                      {sortedOffers.length} total
                    </span>
                  ) : null}
                </div>

                <p className="mt-4 leading-7 text-neutral-600">
                  {isCustomer
                    ? "Compare the offers below and choose the best fit based on price, time, message, and trust."
                    : "This is where your offer activity and customer decisions appear."}
                </p>

                {sortedOffers.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm text-neutral-600">No offers yet.</p>
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    {sortedOffers.map((offer) => {
                      const isAccepted = offer.status === "accepted";
                      const offerTiming = getOfferTimingSummary(offer);

                      return (
                        <div
                          key={offer.id}
                          className={`overflow-hidden rounded-[1.75rem] border shadow-sm ${
                            isAccepted
                              ? "border-black bg-black text-white"
                              : "border-neutral-200 bg-white text-neutral-900"
                          }`}
                        >
                          <div className="p-5 sm:p-6">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                              <Link
                                href={`/profile/${offer.professional_id}`}
                                className="flex min-w-0 items-center gap-3 transition hover:opacity-80"
                              >
                                <div
                                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-full border ${
                                    isAccepted
                                      ? "border-white/15 bg-white/10"
                                      : "border-neutral-200 bg-neutral-100"
                                  }`}
                                >
                                  {offer.professional_avatar_url ? (
                                    <img
                                      src={offer.professional_avatar_url}
                                      alt={offer.professional_name || "Professional"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div
                                      className={`flex h-full w-full items-center justify-center text-sm font-semibold ${
                                        isAccepted ? "text-white/80" : "text-neutral-500"
                                      }`}
                                    >
                                      {offer.professional_name?.charAt(0).toUpperCase() || "P"}
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <p className={`text-xl font-semibold ${isAccepted ? "text-white" : "text-neutral-900"}`}>
                                    {offer.professional_name || "Professional"}
                                  </p>
                                  <p className={`mt-1 text-sm ${isAccepted ? "text-white/65" : "text-neutral-500"}`}>
                                    {formatProfessionalType(offer.professional_type)}
                                  </p>
                                  <p className={`mt-1 text-sm ${isAccepted ? "text-white/75" : "text-neutral-600"}`}>
                                    {formatRating(offer.average_rating, offer.review_count)}
                                  </p>
                                </div>
                              </Link>

                              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  {isCustomer && unreadOfferIds.includes(offer.id) ? (
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${isAccepted ? "bg-white text-black" : "bg-black text-white"}`}>
                                      New
                                    </span>
                                  ) : null}

                                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${isAccepted ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                                    {getStatusLabel(offer.status)}
                                  </span>
                                </div>

                                <p className={`text-3xl font-semibold tracking-tight ${isAccepted ? "text-white" : "text-neutral-900"}`}>
                                  {offer.proposed_price || "Price not provided"}
                                </p>
                              </div>
                            </div>

                            {offerTiming ? (
                              <div className={`mt-5 rounded-2xl border p-4 ${isAccepted ? "border-white/10 bg-white/10" : "border-neutral-200 bg-neutral-50"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${isAccepted ? "text-white/55" : "text-neutral-500"}`}>
                                  {request.timing_flexibility === "anytime"
                                    ? "Suggested time"
                                    : offer.matches_requested_time
                                    ? "Confirmed customer time"
                                    : "Suggested time"}
                                </p>
                                <p className={`mt-2 text-sm font-semibold ${isAccepted ? "text-white" : "text-neutral-900"}`}>
                                  {offerTiming}
                                </p>
                              </div>
                            ) : null}

                            {usesProLocation && offer.professional_formatted_address ? (
                              <div className={`mt-5 rounded-2xl border p-4 ${isAccepted ? "border-white/10 bg-white/10" : "border-neutral-200 bg-neutral-50"}`}>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${isAccepted ? "text-white/55" : "text-neutral-500"}`}>
                                  Their location
                                </p>
                                <p className={`mt-2 text-sm font-semibold ${isAccepted ? "text-white" : "text-neutral-900"}`}>
                                  📍 {offer.professional_formatted_address}
                                </p>
                              </div>
                            ) : null}

                            {offer.message ? (
                              <div className={`mt-4 rounded-2xl p-4 text-sm leading-7 ${isAccepted ? "bg-white/10 text-white/80" : "bg-neutral-50 text-neutral-600"}`}>
                                {offer.message}
                              </div>
                            ) : null}

                            {offer.status === "declined" && offer.customer_response_message ? (
                              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                                  Customer feedback
                                </p>
                                <p className="mt-2 text-sm leading-6 text-amber-900">
                                  {offer.customer_response_message}
                                </p>
                              </div>
                            ) : null}

                            <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 text-xs ${isAccepted ? "text-white/50" : "text-neutral-500"}`}>
                              <p>Submitted {formatDate(offer.created_at)}</p>
                              <Link
                                href={`/profile/${offer.professional_id}`}
                                className={`font-semibold ${isAccepted ? "text-white" : "text-neutral-900"}`}
                              >
                                View profile
                              </Link>
                            </div>
                          </div>

                        {isProfessional &&
                        request.status === "open" &&
                        offer.status === "pending" ? (
                          <div className={`border-t px-5 py-4 sm:px-6 ${isAccepted ? "border-white/10" : "border-neutral-100"}`}>
                            <button
                              type="button"
                              onClick={() => handleWithdrawOffer(offer.id)}
                              disabled={withdrawingOfferId === offer.id}
                              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                            >
                              {withdrawingOfferId === offer.id ? "Withdrawing..." : "Withdraw offer"}
                            </button>
                          </div>
                        ) : null}

                        {isProfessional &&
                        request.status === "open" &&
                        offer.status === "declined" ? (
                          <div className="border-t border-neutral-100 px-5 py-4 sm:px-6 space-y-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReofferId(offer.id);
                                setReofferMessage(offer.message ?? "");
                                setReofferPrice(offer.proposed_price ?? "");
                              }}
                              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              Re-offer
                            </button>

                            {editingReofferId === offer.id ? (
                              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                <div>
                                  <label className="text-sm font-medium text-neutral-900">
                                    Updated message
                                  </label>
                                  <textarea
                                    value={reofferMessage}
                                    onChange={(e) => setReofferMessage(e.target.value)}
                                    rows={4}
                                    placeholder="Update your offer based on the customer’s feedback."
                                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                                  />
                                </div>

                                <div className="mt-4">
                                  <label className="text-sm font-medium text-neutral-900">
                                    Updated price
                                  </label>
                                  <input
                                    type="text"
                                    value={reofferPrice}
                                    onChange={(e) => setReofferPrice(e.target.value)}
                                    placeholder="Enter updated price"
                                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                                  />
                                </div>

                                <div className="mt-4 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleReoffer(offer.id)}
                                    disabled={reofferLoading}
                                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                                  >
                                    {reofferLoading ? "Submitting..." : "Submit re-offer"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingReofferId(null);
                                      setReofferMessage("");
                                      setReofferPrice("");
                                    }}
                                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {isCustomer &&
                        request.status === "open" &&
                        (offer.status === "pending" || offer.status === "payment_pending") ? (
                          <div className="border-t border-neutral-100 px-5 py-4 sm:px-6 space-y-3">
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => handleAcceptOffer(offer.id)}
                                disabled={acceptingOfferId === offer.id}
                                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                              >
                                {acceptingOfferId === offer.id
                                  ? "Preparing payment..."
                                  : offer.status === "payment_pending"
                                  ? "Continue payment"
                                  : "Accept offer"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDecliningOfferId(offer.id);
                                  setDeclineMessage("");
                                }}
                                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                              >
                                Decline offer
                              </button>
                            </div>

                            {decliningOfferId === offer.id ? (
                              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                <label className="text-sm font-medium text-neutral-900">
                                  Why are you declining this offer?
                                </label>

                                <textarea
                                  value={declineMessage}
                                  onChange={(e) => setDeclineMessage(e.target.value)}
                                  rows={4}
                                  placeholder="Example: Timing doesn’t work for me, price is too high, or I’m looking for a different fit."
                                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                                />

                                <div className="mt-3 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleDeclineOffer(offer.id)}
                                    disabled={declineLoading}
                                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                                  >
                                    {declineLoading ? "Declining..." : "Submit decline"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDecliningOfferId(null);
                                      setDeclineMessage("");
                                    }}
                                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              {message ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                  {message}
                </div>
              ) : null}

              {isCustomer ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Matched professionals
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Who this request is visible to
                  </h2>

                  <p className="mt-4 leading-7 text-neutral-600">
                    This request is currently shown only to matching professionals
                    based on the service category selected.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {request.target_professions?.length ? (
                      request.target_professions.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700"
                        >
                          {item
                            .replaceAll("_", " ")
                            .replace(/\b\w/g, (char) => char.toUpperCase())}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700">
                        Not set
                      </span>
                    )}
                  </div>
                </section>
              ) : null}

              <section
                id="request-chat"
                className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Chat
                </p>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                  Live conversation
                </h2>

                <p className="mt-4 leading-7 text-neutral-600">
                  {canAccessChat
                    ? "Message your match directly in real time."
                    : "Chat opens once an offer is accepted."}
                </p>

                {!canAccessChat ? (
                  <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                    Chat is only available to the customer and the accepted professional.
                  </div>
                ) : null}

                {isChatReadOnly && canAccessChat ? (
                  <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                    This chat is now read-only because the request has been completed.
                  </div>
                ) : null}

                {canAccessChat ? (
                  <>
                    <div
                      ref={chatScrollRef}
                      className="mt-6 max-h-96 space-y-4 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                    >
                      {chatMessages.length === 0 ? (
                        <p className="text-sm text-neutral-500">No messages yet.</p>
                      ) : (
                        chatMessages.map((chat) => {
                          const isMine = chat.sender_id === currentUserId;
                          const sender = chatProfiles[chat.sender_id];
                          const isSystemMessage =
                            chat.message.startsWith("Offer accepted after payment.") ||
                            chat.message ===
                              "Completion requested. Waiting for customer confirmation." ||
                            chat.message === "Service confirmed as completed.";

                          if (isSystemMessage) {
                            return (
                              <div key={chat.id} className="flex justify-center">
                                <div className="max-w-[90%] rounded-full border border-neutral-200 bg-white px-4 py-2 text-center text-xs font-medium text-neutral-600">
                                  {chat.message}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={chat.id}
                              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`flex max-w-[85%] items-end gap-3 ${
                                  isMine ? "flex-row-reverse" : "flex-row"
                                }`}
                              >
                                <div className="h-9 w-9 overflow-hidden rounded-full border border-neutral-200 bg-white">
                                  {sender?.avatar_url ? (
                                    <img
                                      src={sender.avatar_url}
                                      alt={sender.full_name || "User"}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                                      {sender?.full_name?.charAt(0).toUpperCase() || "U"}
                                    </div>
                                  )}
                                </div>

                                <div
                                  className={`rounded-2xl px-4 py-3 text-sm ${
                                    isMine
                                      ? "bg-black text-white"
                                      : "border border-neutral-200 bg-white text-neutral-900"
                                  }`}
                                >
                                  <p
                                    className={`mb-1 text-xs font-medium ${
                                      isMine ? "text-neutral-300" : "text-neutral-500"
                                    }`}
                                  >
                                    {isMine ? "You" : sender?.full_name || "User"}
                                  </p>
                                  <p>{chat.message}</p>
                                  <p
                                    className={`mt-2 text-xs ${
                                      isMine ? "text-neutral-300" : "text-neutral-500"
                                    }`}
                                  >
                                    {formatChatTime(chat.created_at)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 flex gap-3">
                      <textarea
                        value={newChatMessage}
                        onChange={(e) => setNewChatMessage(e.target.value)}
                        rows={3}
                        disabled={isChatReadOnly}
                        placeholder={
                          isChatReadOnly
                            ? "This chat is now read-only because the service is completed."
                            : "Send a message..."
                        }
                        className="flex-1 rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
                      />

                      <button
                        type="button"
                        onClick={handleSendChatMessage}
                        disabled={isChatReadOnly || sendingChatMessage || !newChatMessage.trim() || !chatBookingId}
                        className="self-end rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                      >
                        {isChatReadOnly ? "Completed" : sendingChatMessage ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </>
                ) : null}
              </section>

              {isCustomer && request.status === "completion_requested" ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Customer actions
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Confirm completion
                  </h2>

                  <p className="mt-4 leading-7 text-neutral-600">
                    Your professional marked the service as done. Confirm to finalise the booking.
                  </p>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={handleConfirmCompletion}
                      className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                    >
                      Confirm completion
                    </button>
                  </div>
                </section>
              ) : null}

              {isProfessional && request.status === "open" ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Professional actions
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Respond to this request
                  </h2>

                  <p className="mt-4 leading-7 text-neutral-600">
                    Send your offer with your timing, price, and why you’re a good fit.
                  </p>

                  <div className="mt-6">
                    {hasSubmittedOffer ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                        You already have an active offer on this request.
                      </div>
                    ) : (
                      <Link
                        href={`/requests/${request.id}/respond`}
                        className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        Respond to request
                      </Link>
                    )}
                  </div>
                </section>
              ) : null}

              {isAcceptedProfessional && request.status === "accepted" ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Professional actions
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Complete this service
                  </h2>

                  <p className="mt-4 leading-7 text-neutral-600">
                    Once the service is finished, send a completion request to the customer.
                  </p>

                  <div className="mt-6">
                    {request.scheduled_date && request.scheduled_end_time &&
                    !isServiceOver(request.scheduled_date, request.scheduled_end_time) ? (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-500">
                        Available after {formatTime(request.scheduled_end_time)} when the service ends
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestCompletion}
                        className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        Mark service complete
                      </button>
                    )}
                  </div>
                </section>
              ) : null}

              {isAcceptedProfessional && request.status === "completion_requested" ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
                  Completion request sent. Waiting for customer confirmation.
                </section>
              ) : null}

              {(isCustomer || isAcceptedProfessional) &&
              (request.status === "accepted" || request.status === "completion_requested") &&
              request.scheduled_date && request.scheduled_start_time ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Booking
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Need to cancel?
                  </h2>

                  {!canCancelBooking(request.scheduled_date, request.scheduled_start_time) ? (
                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-neutral-500">
                      This booking is within {CANCELLATION_CUTOFF_HOURS} hours of the appointment and
                      can no longer be cancelled. Message the {isCustomer ? "professional" : "client"}{" "}
                      directly if something&apos;s come up.
                    </div>
                  ) : confirmingCancelBooking ? (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm text-neutral-600">Cancel and refund in full?</span>
                      <button
                        type="button"
                        onClick={handleCancelBooking}
                        disabled={cancelingBooking}
                        className="inline-flex rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {cancelingBooking ? "Working..." : "Yes, cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancelBooking(false)}
                        className="inline-flex rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-50"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelBooking}
                        disabled={cancelingBooking}
                        className="inline-flex w-fit rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Cancel booking
                      </button>
                      <p className="text-xs text-neutral-400">
                        Full refund if cancelled before{" "}
                        {formatCancellationCutoff(request.scheduled_date, request.scheduled_start_time)}.
                      </p>
                    </div>
                  )}
                </section>
              ) : null}

              {isProfessional &&
              request.status === "completed" &&
              isAcceptedProfessional ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
                  This service has been completed.
                </section>
              ) : null}

              {isCustomer && request.status === "completed" ? (
                <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Review
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    {existingReview ? "Your review" : "Leave a review"}
                  </h2>

                  <p className="mt-4 leading-7 text-neutral-600">
                    Share how the service went so future customers can make a confident choice.
                  </p>

                  {existingReview ? (
                    <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                      <p className="text-lg font-semibold text-neutral-900">
                        {"★".repeat(existingReview.rating)}
                        {"☆".repeat(5 - existingReview.rating)}
                      </p>

                      {existingReview.comment ? (
                        <p className="mt-3 leading-7 text-neutral-600">
                          {existingReview.comment}
                        </p>
                      ) : (
                        <p className="mt-3 text-neutral-500">No written comment added.</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      <div>
                        <label className="text-sm font-medium text-neutral-900">
                          Rating
                        </label>
                        <select
                          value={reviewRating}
                          onChange={(e) => setReviewRating(Number(e.target.value))}
                          className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                        >
                          <option value={5}>5 - Excellent</option>
                          <option value={4}>4 - Good</option>
                          <option value={3}>3 - Okay</option>
                          <option value={2}>2 - Poor</option>
                          <option value={1}>1 - Bad</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-neutral-900">
                          Comment
                        </label>
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          rows={5}
                          placeholder="How was the service, professionalism, communication, and result?"
                          className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSubmitReview}
                        disabled={submittingReview}
                        className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                      >
                        {submittingReview ? "Submitting..." : "Submit review"}
                      </button>
                    </div>
                  )}

                  {request.accepted_professional_id ? (
                    <div className="mt-6 border-t border-neutral-200 pt-6">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Book again
                      </p>

                      <p className="mt-3 leading-7 text-neutral-600">
                        Want the same professional again? Send them a direct rebook request instead of posting to the full marketplace.
                      </p>

                      <div className="mt-4">
                        <Link
                          href={`/requests/new?rebook=1&pro=${request.accepted_professional_id}&request=${request.id}`}
                          className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                        >
                          Book again
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-sm font-medium text-black"
            >
              Close
            </button>

            <img
              src={selectedPhoto}
              alt="Reference full size"
              className="max-h-[90vh] max-w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}
      
      {showPaymentModal && paymentClientSecret && selectedOfferForPayment ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Secure payment
                </p>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  Confirm your booking
                </h2>

                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Payment is processed securely through Stripe. Your booking will be confirmed after payment succeeds.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentClientSecret(null);
                  setSelectedOfferForPayment(null);
                }}
                className="shrink-0 rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-600">
              <span className="font-semibold text-neutral-900">Cancellation policy:</span> you can cancel
              for a full refund up until 24 hours before the appointment. Cancellations inside that
              24-hour window aren&apos;t refundable.
            </div>

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentClientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    borderRadius: "16px",
                    colorText: "#111111",
                    colorPrimary: "#111111",
                  },
                },
              }}
            >
              <RequestOfferCheckoutForm
                offer={selectedOfferForPayment}
                onPaymentComplete={async () => {
                  setShowPaymentModal(false);
                  setPaymentClientSecret(null);
                  setSelectedOfferForPayment(null);
                  setMessage("Payment successful — confirming your booking...");

                  // Poll until the webhook updates the request to "accepted"
                  let confirmed = false;
                  for (let i = 0; i < 15; i++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    const { data: latest } = await supabase
                      .from("service_requests")
                      .select("status")
                      .eq("id", requestId)
                      .single();
                    if (latest?.status === "accepted") {
                      confirmed = true;
                      break;
                    }
                  }

                  await loadRequestLive({ silent: true });
                  if (confirmed) setMessage("");
                  setShowBookingSuccessModal(true);
                }}
              />
            </Elements>
          </div>
        </div>
      ) : null}

      {showBookingSuccessModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-7 shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">
              Booking confirmed
            </h2>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              Your booking has been confirmed successfully.
              You can now message the professional directly to coordinate
              arrival details, preparation, timing, or questions.
            </p>

            {acceptedOffer ? (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">
                  {acceptedOffer.professional_name || "Professional"}
                </p>

                <p className="mt-1 text-sm text-neutral-500">
                  {acceptedOffer.proposed_price || "Price not provided"}
                </p>

                {getOfferTimingSummary(acceptedOffer) ? (
                  <p className="mt-2 text-sm text-neutral-600">
                    {getOfferTimingSummary(acceptedOffer)}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowBookingSuccessModal(false);

                  requestAnimationFrame(() => {
                    const chatSection = document.getElementById("request-chat");

                    if (chatSection) {
                      chatSection.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }
                  });
                }}
                className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Message professional
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowBookingSuccessModal(false);
                  router.push("/work");
                }}
                className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                View bookings
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}