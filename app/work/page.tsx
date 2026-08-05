"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
  professional_type?: string | null;
  professional_types?: string[] | null;
  service_modes?: string[] | null;
};

type BookingStatus =
  | "confirmed"
  | "completion_requested"
  | "completed"
  | "cancelled";

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
};

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

type OfferRow = {
  id: string;
  request_id: string;
  professional_id: string;
  message: string | null;
  proposed_price: number | null;
  proposed_date: string | null;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  status: string | null;
  created_at: string | null;
};

type BookedItem = {
  id: string;
  source: "booking" | "request";
  status: "accepted" | BookingStatus;
  title: string;
  description: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  serviceMode: string | null;
  price: string | number | null;
  createdAt: string | null;
  completedAt: string | null;
  customerId: string | null;
  professionalId: string | null;
  customerName: string | null;
  customerAvatarUrl: string | null;
  professionalName: string | null;
  professionalAvatarUrl: string | null;
  href: string;
  sortDate: string;
};

type RequestAndOfferItem = {
  id: string;
  kind: "open_request" | "posted_request" | "offer_sent" | "offer_received";
  title: string;
  subtitle: string;
  status: string;
  createdAt: string | null;
  price: string | number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  requestId: string;
  personName: string | null;
  personAvatarUrl: string | null;
  cancelledAt?: string | null;
};

type TabKey = "booked" | "requests" | "completed";

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

function isServiceOver(date: string | null, endTime: string | null) {
  if (!date || !endTime) return false;
  const end = new Date(`${date}T${String(endTime).slice(0, 5)}:00`);
  return new Date() >= end;
}

function formatCategory(category: string | null | undefined) {
  if (!category) return "Service";
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMode(mode: string | null) {
  if (!mode) return null;
  if (mode === "in_shop") return "In shop";
  if (mode === "at_home") return "At home";
  if (mode === "home_studio") return "Home studio";
  return mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTime(time: string | null | undefined) {
  if (!time) return "";

  const cleanTime = String(time).slice(0, 5);
  const [hourString, minuteString] = cleanTime.split(":");
  const hour = Number(hourString);

  if (Number.isNaN(hour)) return cleanTime;

  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minuteString || "00"} ${suffix}`;
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "Date not set";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return "Not available";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPrice(value: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function statusLabel(status: string | null) {
  if (status === "accepted") return "Booked";
  if (status === "confirmed") return "Booked";
  if (status === "completion_requested") return "Completion requested";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "open") return "Open";
  if (status === "pending") return "Pending";
  if (status === "declined") return "Declined";
  return status || "Unknown";
}

function getRequestDateTime(request: ServiceRequest) {
  if (request.scheduled_date && request.scheduled_start_time) {
    return new Date(
      `${request.scheduled_date}T${String(request.scheduled_start_time).slice(0, 5)}:00`
    );
  }

  if (request.preferred_date && request.preferred_start_time) {
    return new Date(
      `${request.preferred_date}T${String(request.preferred_start_time).slice(0, 5)}:00`
    );
  }

  return new Date(request.created_at);
}

function getBookingDateTime(booking: BookingRow) {
  return new Date(`${booking.booking_date}T${String(booking.start_time).slice(0, 5)}:00`);
}

function getInitials(name: string | null | undefined) {
  const value = String(name || "").trim();
  if (!value) return "?";
  return value.charAt(0).toUpperCase();
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {url ? (
        <img src={url} alt={name || "User"} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

type WorkCache = {
  profile: Profile;
  bookedItems: BookedItem[];
  requestAndOfferItems: RequestAndOfferItem[];
};

export default function WorkPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<WorkCache>("work-page"));
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("booked");
  const [profile, setProfile] = useState<Profile | null>(() => getCached<WorkCache>("work-page")?.profile ?? null);
  const [bookedItems, setBookedItems] = useState<BookedItem[]>(() => getCached<WorkCache>("work-page")?.bookedItems ?? []);
  const [requestAndOfferItems, setRequestAndOfferItems] = useState<RequestAndOfferItem[]>(() => getCached<WorkCache>("work-page")?.requestAndOfferItems ?? []);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<BookedItem | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const isCustomer = isCustomerRole(profile?.role);
  const isProfessional = isProfessionalRole(profile?.role);

  useEffect(() => {
    loadWork(!!getCached<WorkCache>("work-page"));
  }, []);

  useEffect(() => {
    if (!loading && profile) {
      setCached<WorkCache>("work-page", { profile, bookedItems, requestAndOfferItems });
    }
  }, [loading, profile, bookedItems, requestAndOfferItems]);

  async function loadWork(silent = false) {
    try {
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

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, avatar_url, professional_type, professional_types, service_modes")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage(profileError?.message || "Could not load your profile.");
        setLoading(false);
        return;
      }

      const currentProfile = profileData as Profile;
      setProfile(currentProfile);

      if (isCustomerRole(currentProfile.role)) {
        await loadCustomerWork(user.id);
      } else if (isProfessionalRole(currentProfile.role)) {
        await loadProfessionalWork(user.id, currentProfile);
      } else {
        setMessage("Invalid account role.");
      }
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong loading your work.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomerWork(userId: string) {
    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("client_id", userId)
      .order("created_at", { ascending: false });

    if (requestError) {
      setMessage(requestError.message);
      setBookedItems([]);
      setRequestAndOfferItems([]);
      return;
    }

    const requests = (requestData || []) as ServiceRequest[];
    const requestIds = requests.map((request) => request.id);

    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id"
      )
      .eq("customer_id", userId)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (bookingError) {
      setMessage(bookingError.message);
      setBookedItems([]);
      setRequestAndOfferItems([]);
      return;
    }

    let offersReceived: OfferRow[] = [];

    if (requestIds.length > 0) {
      const { data: offersData } = await supabase
        .from("request_offers")
        .select(
          "id, request_id, professional_id, message, proposed_price, proposed_date, proposed_start_time, proposed_end_time, status, created_at"
        )
        .in("request_id", requestIds)
        .order("created_at", { ascending: false });

      offersReceived = (offersData || []) as OfferRow[];
    }

    const bookings = (bookingData || []) as BookingRow[];

    const profileIds = Array.from(
      new Set(
        [
          ...bookings.map((booking) => booking.professional_id),
          ...requests.map((request) => request.accepted_professional_id),
          ...offersReceived.map((offer) => offer.professional_id),
        ].filter(Boolean) as string[]
      )
    );

    const profileMap = await getProfileMap(profileIds);
    const requestMap = new Map(requests.map((request) => [request.id, request]));

    const bookingItems = bookings.map((booking) => bookingToBookedItem(booking, profileMap));

    const acceptedRequestItems = requests
      .filter((request) =>
        ["accepted", "confirmed", "completion_requested", "completed"].includes(request.status)
      )
      .map((request) => requestToBookedItem(request, profileMap));

    const postedItems: RequestAndOfferItem[] = requests.map((request) => ({
      id: `posted-${request.id}`,
      kind: "posted_request",
      title: request.title || request.service_detail || formatCategory(request.category),
      subtitle: request.description || request.formatted_address || request.location || "Your request",
      status: statusLabel(request.status),
      createdAt: request.created_at,
      price: request.budget,
      date: request.preferred_date || request.scheduled_date || null,
      startTime: request.preferred_start_time || request.scheduled_start_time || null,
      endTime: request.scheduled_end_time || null,
      requestId: request.id,
      personName: null,
      personAvatarUrl: null,
      cancelledAt: request.cancelled_at || null,
    }));

    const offerItems: RequestAndOfferItem[] = offersReceived.map((offer) => {
      const request = requestMap.get(offer.request_id);
      const professional = profileMap.get(offer.professional_id);

      return {
        id: `offer-received-${offer.id}`,
        kind: "offer_received",
        title: request?.title || request?.service_detail || "Offer received",
        subtitle: offer.message || "A professional sent you an offer.",
        status: statusLabel(offer.status),
        createdAt: offer.created_at,
        price: offer.proposed_price,
        date: offer.proposed_date,
        startTime: offer.proposed_start_time,
        endTime: offer.proposed_end_time,
        requestId: offer.request_id,
        personName: professional?.full_name || professional?.email || "Professional",
        personAvatarUrl: professional?.avatar_url || null,
      };
    });

    setBookedItems([...bookingItems, ...acceptedRequestItems]);
    setRequestAndOfferItems([...postedItems, ...offerItems]);
  }

  async function loadProfessionalWork(userId: string, currentProfile: Profile) {
    const { data: allRequestsData, error: allRequestsError } = await supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (allRequestsError) {
      setMessage(allRequestsError.message);
      setBookedItems([]);
      setRequestAndOfferItems([]);
      return;
    }

    const { data: trackedRequestsData, error: trackedRequestsError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("accepted_professional_id", userId)
      .in("status", ["accepted", "confirmed", "completion_requested", "completed"])
      .order("created_at", { ascending: false });

    if (trackedRequestsError) {
      setMessage(trackedRequestsError.message);
      setBookedItems([]);
      setRequestAndOfferItems([]);
      return;
    }

    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id"
      )
      .eq("professional_id", userId)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (bookingsError) {
      setMessage(bookingsError.message);
      setBookedItems([]);
      setRequestAndOfferItems([]);
      return;
    }

    const { data: offersSentData } = await supabase
      .from("request_offers")
      .select(
        "id, request_id, professional_id, message, proposed_price, proposed_date, proposed_start_time, proposed_end_time, status, created_at"
      )
      .eq("professional_id", userId)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false });

    const allRequests = (allRequestsData || []) as ServiceRequest[];
    const trackedRequests = (trackedRequestsData || []) as ServiceRequest[];
    const bookings = (bookingsData || []) as BookingRow[];
    const offersSent = (offersSentData || []) as OfferRow[];

    const professionalTypes = Array.isArray(currentProfile.professional_types)
      ? currentProfile.professional_types
      : [];
    const professionalType = currentProfile.professional_type ? [currentProfile.professional_type] : [];
    const allTypes = Array.from(new Set([...professionalTypes, ...professionalType]));

    const proServiceModes = Array.isArray(currentProfile.service_modes)
      ? currentProfile.service_modes
      : [];

    const openRequests = allRequests.filter((request) => {
      if (request.status !== "open") return false;
      if (request.is_direct_rebook) return request.preferred_professional_id === userId;
      if (allTypes.length === 0) return true;
      if (!allTypes.includes(request.category)) return false;
      // If the pro has service modes set and the request specifies a mode, must match
      if (proServiceModes.length > 0 && request.service_mode) {
        if (!proServiceModes.includes(request.service_mode)) return false;
      }
      return true;
    });

    const offerRequestIds = Array.from(new Set(offersSent.map((offer) => offer.request_id)));
    const offerRequestMap = new Map<string, ServiceRequest>();

    allRequests.forEach((request) => {
      if (offerRequestIds.includes(request.id)) {
        offerRequestMap.set(request.id, request);
      }
    });

    const profileIds = Array.from(
      new Set(
        [
          ...trackedRequests.map((request) => request.client_id),
          ...bookings.map((booking) => booking.customer_id),
          ...openRequests.map((request) => request.client_id),
          ...Array.from(offerRequestMap.values()).map((request) => request.client_id),
        ].filter(Boolean) as string[]
      )
    );

    const profileMap = await getProfileMap(profileIds);

    const bookingItems = bookings.map((booking) => bookingToBookedItem(booking, profileMap));
    const acceptedRequestItems = trackedRequests.map((request) =>
      requestToBookedItem(request, profileMap)
    );

    const openItems: RequestAndOfferItem[] = openRequests.map((request) => {
      const customer = profileMap.get(request.client_id);

      return {
        id: `open-${request.id}`,
        kind: "open_request",
        title: request.title || request.service_detail || formatCategory(request.category),
        subtitle: request.description || request.formatted_address || request.location || "New client request",
        status: statusLabel(request.status),
        createdAt: request.created_at,
        price: request.budget,
        date: request.preferred_date || null,
        startTime: request.preferred_start_time || null,
        endTime: null,
        requestId: request.id,
        personName: customer?.full_name || customer?.email || "Client",
        personAvatarUrl: customer?.avatar_url || null,
      };
    });

    const offerItems: RequestAndOfferItem[] = offersSent.map((offer) => {
      const request = offerRequestMap.get(offer.request_id);
      const customer = request?.client_id ? profileMap.get(request.client_id) : null;

      return {
        id: `offer-sent-${offer.id}`,
        kind: "offer_sent",
        title: request?.title || request?.service_detail || "Offer sent",
        subtitle: offer.message || "You sent an offer for this request.",
        status: statusLabel(offer.status),
        createdAt: offer.created_at,
        price: offer.proposed_price,
        date: offer.proposed_date,
        startTime: offer.proposed_start_time,
        endTime: offer.proposed_end_time,
        requestId: offer.request_id,
        personName: customer?.full_name || customer?.email || "Client",
        personAvatarUrl: customer?.avatar_url || null,
      };
    });

    setBookedItems([...bookingItems, ...acceptedRequestItems]);
    setRequestAndOfferItems([...openItems, ...offerItems]);
  }

  async function getProfileMap(profileIds: string[]) {
    if (profileIds.length === 0) return new Map<string, Profile>();

    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, avatar_url")
      .in("id", profileIds);

    return new Map(((data || []) as Profile[]).map((item) => [item.id, item]));
  }

  function bookingToBookedItem(booking: BookingRow, profileMap: Map<string, Profile>): BookedItem {
    const customer = profileMap.get(booking.customer_id);
    const professional = profileMap.get(booking.professional_id);
    const dateTime = getBookingDateTime(booking);

    return {
      id: booking.id,
      source: "booking",
      status: booking.status,
      title: booking.service_name || "Booked service",
      description: null,
      date: booking.booking_date,
      startTime: booking.start_time,
      endTime: booking.end_time,
      location: booking.formatted_address || null,
      serviceMode: null,
      price: null,
      createdAt: booking.created_at,
      completedAt: booking.completed_at || booking.created_at,
      customerId: booking.customer_id,
      professionalId: booking.professional_id,
      customerName: customer?.full_name || customer?.email || "Client",
      customerAvatarUrl: customer?.avatar_url || null,
      professionalName: professional?.full_name || professional?.email || "Professional",
      professionalAvatarUrl: professional?.avatar_url || null,
      href: `/bookings/${booking.id}`,
      sortDate: dateTime.toISOString(),
    };
  }

  function requestToBookedItem(request: ServiceRequest, profileMap: Map<string, Profile>): BookedItem {
    const customer = profileMap.get(request.client_id);
    const professional = request.accepted_professional_id
      ? profileMap.get(request.accepted_professional_id)
      : null;
    const dateTime = getRequestDateTime(request);
    const date = request.scheduled_date || request.preferred_date || null;
    const startTime = request.scheduled_start_time || request.preferred_start_time || null;
    const endTime = request.scheduled_end_time || null;

    return {
      id: request.id,
      source: "request",
      status: request.status === "confirmed" ? "confirmed" : (request.status as "accepted" | BookingStatus),
      title: request.title || request.service_detail || formatCategory(request.category),
      description: request.description || null,
      date,
      startTime,
      endTime,
      location: request.formatted_address || request.location || null,
      serviceMode: request.service_mode,
      price: request.budget,
      createdAt: request.created_at,
      completedAt: request.completed_at || null,
      customerId: request.client_id,
      professionalId: request.accepted_professional_id,
      customerName: customer?.full_name || customer?.email || "Client",
      customerAvatarUrl: customer?.avatar_url || null,
      professionalName: professional?.full_name || professional?.email || "Professional",
      professionalAvatarUrl: professional?.avatar_url || null,
      href: `/requests/${request.id}`,
      sortDate: dateTime.toISOString(),
    };
  }

  const activeBookedItems = useMemo(
    () =>
      bookedItems
        .filter(
          (item) =>
            item.status === "accepted" ||
            item.status === "confirmed" ||
            item.status === "completion_requested"
        )
        .sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime()),
    [bookedItems]
  );

  const completedItems = useMemo(
    () =>
      bookedItems
        .filter((item) => item.status === "completed")
        .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()),
    [bookedItems]
  );

  async function updateBookedItemStatus(
    item: BookedItem,
    nextStatus: "completion_requested" | "completed" | "cancelled"
  ) {
    if (!profile) return;

    const actionKey = `${item.source}-${item.id}`;
    setActionLoadingId(actionKey);
    setMessage("");

    try {
      const now = new Date().toISOString();

      if (nextStatus === "cancelled") {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const response = await fetch("/api/bookings/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify(
            item.source === "booking" ? { bookingId: item.id } : { requestId: item.id }
          ),
        });

        const data = await response.json();

        if (!response.ok) {
          setMessage(data?.error || "Could not cancel this booking.");
          return;
        }
      } else if (item.source === "booking") {
        const updates: Partial<BookingRow> = {
          status: nextStatus as BookingStatus,
        };

        if (nextStatus === "completion_requested") {
          updates.completion_requested_at = now;
        }

        if (nextStatus === "completed") {
          updates.completed_at = now;
        }

        let query = supabase.from("bookings").update(updates).eq("id", item.id);

        query = isProfessional
          ? query.eq("professional_id", profile.id)
          : query.eq("customer_id", profile.id);

        const { error } = await query;

        if (error) {
          setMessage(error.message);
          return;
        }
      } else {
        const updates: Record<string, string> = {
          status: nextStatus,
        };

        if (nextStatus === "completion_requested") {
          updates.completion_requested_at = now;
        }

        let query = supabase.from("service_requests").update(updates).eq("id", item.id);

        query = isProfessional
          ? query.eq("accepted_professional_id", profile.id)
          : query.eq("client_id", profile.id);

        const { error } = await query;

        if (error) {
          setMessage(error.message);
          return;
        }
      }

      setBookedItems((prev) =>
        prev
          .map((existing) =>
            existing.source === item.source && existing.id === item.id
              ? {
                  ...existing,
                  status: nextStatus,
                  completedAt: nextStatus === "completed" ? now : existing.completedAt,
                }
              : existing
          )
          .filter((existing) => existing.status !== "cancelled")
      );

      if (nextStatus === "completion_requested") {
        setMessage("Completion requested. Waiting for customer confirmation.");
      } else if (nextStatus === "completed") {
        if (isCustomer) {
          setReviewItem(item);
        } else {
          setMessage("Service marked as completed.");
        }
      } else {
        setMessage("Service cancelled.");
      }
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong updating this service.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSubmitReview() {
    if (!reviewItem || reviewRating === 0) return;
    const professionalId = reviewItem.professionalId;
    if (!professionalId) return;

    setReviewSubmitting(true);
    try {
      await supabase.from("professional_reviews").insert({
        professional_id: professionalId,
        reviewer_id: profile?.id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });
    } catch {
      // best-effort
    } finally {
      setReviewSubmitting(false);
      setReviewItem(null);
      setReviewRating(0);
      setReviewComment("");
      setMessage("Service completed. Thanks for your review!");
    }
  }

  function getOtherPerson(item: BookedItem) {
    if (isProfessional) {
      return {
        label: "Client",
        name: item.customerName,
        avatarUrl: item.customerAvatarUrl,
        profileId: item.customerId,
        buttonText: "View client",
      };
    }

    return {
      label: "Professional",
      name: item.professionalName,
      avatarUrl: item.professionalAvatarUrl,
      profileId: item.professionalId,
      buttonText: "View professional",
    };
  }

  function getEmptyMessage() {
    if (activeTab === "booked") return "No booked services right now.";
    if (activeTab === "requests") {
      return isProfessional
        ? "No open requests or sent offers yet."
        : "No posted requests or received offers yet.";
    }
    return "No completed services yet.";
  }

  if (loading) {
    return (
      <main className="min-h-dvh bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


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

  if (!profile) {
    return (
      <main className="min-h-dvh bg-white px-6 py-10 text-neutral-900">

        <div className="mx-auto max-w-6xl py-16">
          <p className="text-red-600">Could not load profile.</p>
        </div>
      </main>
    );
  }

  const openRequestItems = requestAndOfferItems.filter(
    (item) => (item.kind === "open_request" || item.kind === "posted_request") && item.status !== "Cancelled"
  );
  const offerItems = requestAndOfferItems.filter((item) => item.kind === "offer_sent" || item.kind === "offer_received");
  const cancelledRequestItems = requestAndOfferItems.filter((item) => {
    if ((item.kind !== "open_request" && item.kind !== "posted_request") || item.status !== "Cancelled") {
      return false;
    }
    if (!item.cancelledAt) return false;
    const cancelledAgeMs = Date.now() - new Date(item.cancelledAt).getTime();
    return cancelledAgeMs <= 24 * 60 * 60 * 1000;
  });

  return (
    <>
    <main className="min-h-dvh bg-white px-4 py-6 text-neutral-900 sm:px-6 sm:py-8 lg:px-8">

      <div className="mx-auto max-w-6xl py-4 sm:py-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
            {isProfessional ? "Work" : "My services"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:mt-3 md:text-5xl">
            {isProfessional
              ? `Hey, ${profile.full_name?.split(" ")[0] ?? "there"}`
              : "Your services"}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-500 sm:mt-3 sm:text-base">
            {isProfessional
              ? "Track your upcoming jobs, offers, and completed work."
              : "Track your bookings, requests, and service history."}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-[1.5rem] border border-neutral-200 bg-neutral-100 p-1.5 sm:mt-8">
          {(["booked", "requests", "completed"] as TabKey[]).map((tab) => {
            const labels: Record<TabKey, string> = {
              booked: "Booked",
              requests: "Activity",
              completed: "History",
            };
            const counts: Record<TabKey, number> = {
              booked: activeBookedItems.length,
              requests: openRequestItems.length + offerItems.length,
              completed: completedItems.length + cancelledRequestItems.length,
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  activeTab === tab
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {labels[tab]}
                {counts[tab] > 0 ? (
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab ? "bg-neutral-100 text-neutral-600" : "bg-neutral-200 text-neutral-500"
                  }`}>
                    {counts[tab]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            {message}
          </div>
        ) : null}

        <div className="mt-5 min-h-[60vh] sm:mt-8">
          {activeTab === "requests" ? (
            requestAndOfferItems.length === 0 ? (
              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                    <path d="M6 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="mt-4 font-semibold text-neutral-900">
                  {isProfessional ? "No open requests yet" : "No requests posted yet"}
                </p>
                <p className="mt-1.5 text-sm text-neutral-500">
                  {isProfessional
                    ? "Matching client requests will appear here. Make sure your services and availability are set up."
                    : "Post a request and professionals will send you offers to compare."}
                </p>
                {!isProfessional ? (
                  <Link href="/requests/new" className="mt-5 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                    Post a request
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="space-y-6">
                {openRequestItems.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      {isProfessional ? "Open requests" : "Your requests"}
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 font-bold text-neutral-500">{openRequestItems.length}</span>
                    </p>
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      {openRequestItems.map((item) => (
                        <ActivityCard key={item.id} item={item} isProfessional={isProfessional} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {offerItems.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      {isProfessional ? "Offers sent" : "Offers received"}
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 font-bold text-neutral-500">{offerItems.length}</span>
                    </p>
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      {offerItems.map((item) => (
                        <ActivityCard key={item.id} item={item} isProfessional={isProfessional} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          {activeTab === "booked" ? (
            activeBookedItems.length === 0 ? (
              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                    <path d="M6 2v2M14 2v2M3 8h14M4 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="mt-4 font-semibold text-neutral-900">
                  {isProfessional ? "No booked services" : "Nothing booked yet"}
                </p>
                <p className="mt-1.5 text-sm text-neutral-500">
                  {isProfessional
                    ? "Confirmed jobs and upcoming bookings will appear here."
                    : "Once you accept an offer or make a direct booking, it'll show up here."}
                </p>
              </div>
            ) : (
              <BookedList
                items={activeBookedItems}
                isProfessional={isProfessional}
                isCustomer={isCustomer}
                actionLoadingId={actionLoadingId}
                cancelConfirmId={cancelConfirmId}
                setCancelConfirmId={setCancelConfirmId}
                getOtherPerson={getOtherPerson}
                updateBookedItemStatus={updateBookedItemStatus}
              />
            )
          ) : null}

          {activeTab === "completed" ? (
            completedItems.length === 0 && cancelledRequestItems.length === 0 ? (
              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-400" fill="none">
                    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="mt-4 font-semibold text-neutral-900">No completed services yet</p>
                <p className="mt-1.5 text-sm text-neutral-500">Your service history will build up here over time.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {completedItems.length > 0 ? (
                  <BookedList
                    items={completedItems}
                    isProfessional={isProfessional}
                    isCustomer={isCustomer}
                    actionLoadingId={actionLoadingId}
                    cancelConfirmId={cancelConfirmId}
                    setCancelConfirmId={setCancelConfirmId}
                    getOtherPerson={getOtherPerson}
                    updateBookedItemStatus={updateBookedItemStatus}
                  />
                ) : null}

                {cancelledRequestItems.length > 0 ? (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                      Cancelled requests
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 font-bold text-neutral-500">{cancelledRequestItems.length}</span>
                    </p>
                    <div className="grid gap-2.5 lg:grid-cols-2">
                      {cancelledRequestItems.map((item) => (
                        <ActivityCard key={item.id} item={item} isProfessional={isProfessional} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </main>

    {reviewItem ? (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Service complete
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            How was {reviewItem.professionalName?.split(" ")[0] ?? "your professional"}?
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
              onClick={() => { setReviewItem(null); setMessage("Service completed."); }}
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

function ActivityCard({ item, isProfessional }: { item: RequestAndOfferItem; isProfessional: boolean }) {
  const isOffer = item.kind === "offer_sent" || item.kind === "offer_received";

  const metaParts = [
    item.personName || null,
    item.date ? `${formatDate(item.date)}${item.startTime ? ` · ${formatTime(item.startTime)}` : ""}` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/requests/${item.requestId}`}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      {item.personName ? (
        <Avatar name={item.personName} url={item.personAvatarUrl} />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-2xl border border-neutral-200 bg-neutral-50" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isOffer
              ? "bg-neutral-100 text-neutral-600"
              : "bg-neutral-900 text-white"
          }`}>
            {item.kind === "open_request"
              ? "New request"
              : item.kind === "posted_request"
              ? "Your request"
              : item.kind === "offer_sent"
              ? "Offer sent"
              : "Offer received"}
          </span>
          <span className="text-[11px] text-neutral-400">{item.status}</span>
        </div>

        <h2 className="mt-1 line-clamp-1 text-sm font-semibold tracking-tight text-neutral-900">
          {item.title}
        </h2>

        {metaParts.length > 0 ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
            {metaParts.join(" · ")}
          </p>
        ) : null}
      </div>

      {formatPrice(item.price) ? (
        <span className="shrink-0 text-sm font-semibold text-neutral-900">
          {formatPrice(item.price)}
        </span>
      ) : null}
    </Link>
  );
}

function BookedList({
  items,
  isProfessional,
  isCustomer,
  actionLoadingId,
  cancelConfirmId,
  setCancelConfirmId,
  getOtherPerson,
  updateBookedItemStatus,
}: {
  items: BookedItem[];
  isProfessional: boolean;
  isCustomer: boolean;
  actionLoadingId: string | null;
  cancelConfirmId: string | null;
  setCancelConfirmId: (id: string | null) => void;
  getOtherPerson: (item: BookedItem) => {
    label: string;
    name: string | null;
    avatarUrl: string | null;
    profileId: string | null;
    buttonText: string;
  };
  updateBookedItemStatus: (
    item: BookedItem,
    nextStatus: "completion_requested" | "completed" | "cancelled"
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => {
        const otherPerson = getOtherPerson(item);
        const isLoadingAction = actionLoadingId === `${item.source}-${item.id}`;
        const actionKey = `${item.source}-${item.id}`;

        const timeLabel = item.date
          ? `${formatDate(item.date)}${item.startTime ? ` · ${formatTime(item.startTime)}` : ""}${item.endTime ? `–${formatTime(item.endTime)}` : ""}`
          : "Time not set";

        const metaLine = [
          `${otherPerson.label}: ${otherPerson.name || "Unknown"}`,
          timeLabel,
          formatMode(item.serviceMode),
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={actionKey}
            className="rounded-2xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <Avatar name={otherPerson.name} url={otherPerson.avatarUrl} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      item.status === "completion_requested"
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        : item.status === "completed"
                        ? "bg-neutral-100 text-neutral-500"
                        : "bg-neutral-900 text-white"
                    }`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {item.source === "booking" ? "Direct booking" : "Accepted request"}
                    </span>
                  </div>

                  {formatPrice(item.price) ? (
                    <span className="shrink-0 text-sm font-semibold text-neutral-900">
                      {formatPrice(item.price)}
                    </span>
                  ) : null}
                </div>

                <h2 className="mt-1 line-clamp-1 text-base font-semibold tracking-tight text-neutral-900">
                  {item.title}
                </h2>

                <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
                  {metaLine}
                </p>

                {item.location ? (
                  <p className="mt-1 truncate text-xs text-neutral-400">
                    📍 {item.location}
                  </p>
                ) : null}

                {item.status === "completed" && item.completedAt ? (
                  <p className="mt-1 text-xs text-neutral-400">
                    Completed {formatDateTime(item.completedAt)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
              <Link
                href={item.href}
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              >
                View details
              </Link>

              {otherPerson.profileId ? (
                <Link
                  href={`/profile/${otherPerson.profileId}`}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50"
                >
                  {otherPerson.buttonText}
                </Link>
              ) : null}

              {(item.status === "accepted" || item.status === "confirmed") && isProfessional ? (
                isServiceOver(item.date, item.endTime) ? (
                  <button
                    type="button"
                    onClick={() => updateBookedItemStatus(item, "completion_requested")}
                    disabled={isLoadingAction}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {isLoadingAction ? "Working..." : "Request completion"}
                  </button>
                ) : (
                  <span className="rounded-full bg-neutral-50 px-3 py-2 text-xs text-neutral-400">
                    Available after service ends
                  </span>
                )
              ) : null}

              {item.status === "completion_requested" && isCustomer ? (
                <button
                  type="button"
                  onClick={() => updateBookedItemStatus(item, "completed")}
                  disabled={isLoadingAction}
                  className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {isLoadingAction ? "Working..." : "Confirm completion"}
                </button>
              ) : null}

              {item.status === "completion_requested" && isProfessional ? (
                <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Waiting on customer
                </span>
              ) : null}

              {item.status !== "completed" ? (
                cancelConfirmId === actionKey ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-neutral-500">Cancel this?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelConfirmId(null);
                        updateBookedItemStatus(item, "cancelled");
                      }}
                      disabled={isLoadingAction}
                      className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      Yes, cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelConfirmId(null)}
                      className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50"
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCancelConfirmId(actionKey)}
                    disabled={isLoadingAction}
                    className="ml-auto rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
