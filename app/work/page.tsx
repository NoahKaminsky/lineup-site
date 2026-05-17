"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../components/AppNavbar";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
  professional_type?: string | null;
  professional_types?: string[] | null;
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

export default function WorkPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("booked");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookedItems, setBookedItems] = useState<BookedItem[]>([]);
  const [requestAndOfferItems, setRequestAndOfferItems] = useState<RequestAndOfferItem[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isCustomer = isCustomerRole(profile?.role);
  const isProfessional = isProfessionalRole(profile?.role);

  useEffect(() => {
    loadWork();
  }, []);

  async function loadWork() {
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

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, avatar_url, professional_type, professional_types")
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

    const openRequests = allRequests.filter((request) => {
      if (request.status !== "open") return false;
      if (request.is_direct_rebook) return request.preferred_professional_id === userId;
      if (allTypes.length === 0) return true;
      return allTypes.includes(request.category);
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
      completedAt: request.created_at,
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

      if (item.source === "booking") {
        const updates: Partial<BookingRow> = {
          status: nextStatus as BookingStatus,
        };

        if (nextStatus === "completion_requested") {
          updates.completion_requested_at = now;
        }

        if (nextStatus === "completed") {
          updates.completed_at = now;
        }

        if (nextStatus === "cancelled") {
          updates.cancelled_by = profile.id;
          updates.cancelled_at = now;
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
        setMessage("Service marked as completed.");
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
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
        <Navbar />

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
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <Navbar />
        <div className="mx-auto max-w-6xl py-16">
          <p className="text-red-600">Could not load profile.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <Navbar />

      <div className="mx-auto max-w-6xl py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              {isProfessional ? "Work" : "My Services"}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              {isProfessional ? "Manage your work" : "Your services"}
            </h1>
            <p className="mt-3 max-w-2xl text-neutral-600">
              {isProfessional
                ? "Keep track of booked jobs, request activity, offers, and completed work."
                : "Keep track of booked services, requests, offers, and completed appointments."}
            </p>
          </div>

          <div className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
            {isProfessional ? "Professional view" : isCustomer ? "Customer view" : "Account view"}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-2">
          <button
            type="button"
            onClick={() => setActiveTab("booked")}
            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeTab === "booked"
                ? "bg-black text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            Booked ({activeBookedItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeTab === "requests"
                ? "bg-black text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            Requests & Offers ({requestAndOfferItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("completed")}
            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeTab === "completed"
                ? "bg-black text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            Completed ({completedItems.length})
          </button>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            {message}
          </div>
        ) : null}

        <div className="mt-8">
          {activeTab === "requests" ? (
            requestAndOfferItems.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
                {getEmptyMessage()}
              </div>
            ) : (
              <div className="grid gap-4">
                {requestAndOfferItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 flex-1 gap-4">
                        {item.personName ? (
                          <Avatar name={item.personName} url={item.personAvatarUrl} />
                        ) : (
                          <div className="h-12 w-12 shrink-0 rounded-2xl border border-neutral-200 bg-neutral-50" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                              {item.kind === "open_request"
                                ? "Open request"
                                : item.kind === "posted_request"
                                  ? "Posted request"
                                  : item.kind === "offer_sent"
                                    ? "Offer sent"
                                    : "Offer received"}
                            </span>
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                              {item.status}
                            </span>
                          </div>

                          <h2 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">
                            {item.title}
                          </h2>

                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">
                            {item.subtitle}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2 text-sm text-neutral-600">
                            {item.personName ? (
                              <span className="rounded-full bg-neutral-50 px-3 py-1">
                                {isProfessional ? "Client" : "Professional"}: {item.personName}
                              </span>
                            ) : null}

                            {formatPrice(item.price) ? (
                              <span className="rounded-full bg-neutral-50 px-3 py-1">
                                {formatPrice(item.price)}
                              </span>
                            ) : null}

                            {item.date ? (
                              <span className="rounded-full bg-neutral-50 px-3 py-1">
                                {formatDate(item.date)} {item.startTime ? `at ${formatTime(item.startTime)}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/requests/${item.requestId}`}
                        className="rounded-full border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                      >
                        View request
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}

          {activeTab === "booked" ? (
            activeBookedItems.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
                {getEmptyMessage()}
              </div>
            ) : (
              <BookedList
                items={activeBookedItems}
                isProfessional={isProfessional}
                isCustomer={isCustomer}
                actionLoadingId={actionLoadingId}
                getOtherPerson={getOtherPerson}
                updateBookedItemStatus={updateBookedItemStatus}
              />
            )
          ) : null}

          {activeTab === "completed" ? (
            completedItems.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
                {getEmptyMessage()}
              </div>
            ) : (
              <BookedList
                items={completedItems}
                isProfessional={isProfessional}
                isCustomer={isCustomer}
                actionLoadingId={actionLoadingId}
                getOtherPerson={getOtherPerson}
                updateBookedItemStatus={updateBookedItemStatus}
              />
            )
          ) : null}
        </div>
      </div>
    </main>
  );
}

function BookedList({
  items,
  isProfessional,
  isCustomer,
  actionLoadingId,
  getOtherPerson,
  updateBookedItemStatus,
}: {
  items: BookedItem[];
  isProfessional: boolean;
  isCustomer: boolean;
  actionLoadingId: string | null;
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
    <div className="grid gap-4">
      {items.map((item) => {
        const otherPerson = getOtherPerson(item);
        const isLoadingAction = actionLoadingId === `${item.source}-${item.id}`;

        return (
          <div
            key={`${item.source}-${item.id}`}
            className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-1 gap-4">
                <Avatar name={otherPerson.name} url={otherPerson.avatarUrl} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                      {item.source === "booking" ? "Direct booking" : "Accepted request"}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  <h2 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">
                    {item.title}
                  </h2>

                  <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                    <p>
                      <span className="font-medium text-neutral-900">
                        {otherPerson.label}:
                      </span>{" "}
                      {otherPerson.name || "Unknown"}
                    </p>

                    <p>
                      <span className="font-medium text-neutral-900">Time:</span>{" "}
                      {item.date ? formatDate(item.date) : "Time not set"}
                      {item.startTime ? ` at ${formatTime(item.startTime)}` : ""}
                      {item.endTime ? ` - ${formatTime(item.endTime)}` : ""}
                    </p>

                    {item.location ? (
                      <p>
                        <span className="font-medium text-neutral-900">Location:</span>{" "}
                        {item.location}
                      </p>
                    ) : null}

                    {formatMode(item.serviceMode) ? (
                      <p>
                        <span className="font-medium text-neutral-900">Service mode:</span>{" "}
                        {formatMode(item.serviceMode)}
                      </p>
                    ) : null}

                    {formatPrice(item.price) ? (
                      <p>
                        <span className="font-medium text-neutral-900">Budget:</span>{" "}
                        {formatPrice(item.price)}
                      </p>
                    ) : null}

                    {item.status === "completed" ? (
                      <p>
                        <span className="font-medium text-neutral-900">Completed:</span>{" "}
                        {formatDateTime(item.completedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 md:w-52">
                {otherPerson.profileId ? (
                  <Link
                    href={`/profile/${otherPerson.profileId}`}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    {otherPerson.buttonText}
                  </Link>
                ) : null}

                <Link
                  href={item.href}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  View details
                </Link>

                {(item.status === "accepted" || item.status === "confirmed") && isProfessional ? (
                  <button
                    type="button"
                    onClick={() => updateBookedItemStatus(item, "completion_requested")}
                    disabled={isLoadingAction}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isLoadingAction ? "Working..." : "Request completion"}
                  </button>
                ) : null}

                {item.status === "completion_requested" && isCustomer ? (
                  <button
                    type="button"
                    onClick={() => updateBookedItemStatus(item, "completed")}
                    disabled={isLoadingAction}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isLoadingAction ? "Working..." : "Confirm completion"}
                  </button>
                ) : null}

                {item.status === "completion_requested" && isProfessional ? (
                  <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-center text-xs leading-5 text-neutral-500">
                    Waiting for customer confirmation
                  </div>
                ) : null}

                {item.status !== "completed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Cancel this service?")) {
                        updateBookedItemStatus(item, "cancelled");
                      }
                    }}
                    disabled={isLoadingAction}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {isLoadingAction ? "Working..." : "Cancel"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
