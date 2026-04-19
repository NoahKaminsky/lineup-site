"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/app/components/AppNavbar";


type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  service_detail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  service_mode: string | null;
  budget: string | null;
  status: string;
  target_professions: string[] | null;
  accepted_professional_id: string | null;
  created_at: string;
  completed_at?: string | null;
  completion_requested_at?: string | null;
  reference_photos: string[] | null;
  preferred_professional_id?: string | null;
  is_direct_rebook?: boolean | null;
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
      service_mode: string | null;
      budget: string | null;
      created_at: string;
      completed_at: string | null;
      href: string;
      rawRequest: ServiceRequest;
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
      service_mode: null;
      budget: null;
      created_at: string;
      completed_at: string | null;
      href: string;
      rawBooking: ProfessionalWorkBooking;
    };

type ProfileRow = {
  id: string;
  role: string | null;
  professional_type?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
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

export default function RequestsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [professionalBookings, setProfessionalBookings] = useState<
    ProfessionalWorkBooking[]
  >([]);

  const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>([]);
  const [professionalUnreadRequestIds, setProfessionalUnreadRequestIds] =
    useState<string[]>([]);
  const [offerCountsByRequest, setOfferCountsByRequest] = useState<
    Record<string, number>
  >({});
  const [unreadOfferCountsByRequest, setUnreadOfferCountsByRequest] = useState<
    Record<string, number>
  >({});

  const [message, setMessage] = useState("");
  const [bookingActionLoadingId, setBookingActionLoadingId] = useState<
    string | null
  >(null);

  const hasLoadedOnceRef = useRef(false);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hydrateCustomerData = useCallback(
    async (userId: string) => {
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
            "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at"
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

      const enrichedBookings: EnrichedBooking[] = customerBookings.map(
        (booking) => {
          const professional = professionalMap.get(booking.professional_id);

          return {
            ...booking,
            start_time: String(booking.start_time).slice(0, 5),
            end_time: String(booking.end_time).slice(0, 5),
            professional_name: professional?.full_name ?? null,
            professional_avatar_url: professional?.avatar_url ?? null,
            professional_type: professional?.professional_type ?? null,
          };
        }
      );

      setBookings(enrichedBookings);
      setProfessionalBookings([]);
      setProfessionalUnreadRequestIds([]);
      setRespondedRequestIds([]);
    },
    []
  );

  const hydrateProfessionalData = useCallback(
    async (userId: string) => {
      const { data: allRequests, error: allRequestsError } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (allRequestsError) throw new Error(allRequestsError.message);

      const { data: trackedRequests, error: trackedRequestsError } =
        await supabase
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
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at"
        )
        .eq("professional_id", userId)
        .in("status", ["confirmed", "completion_requested", "completed"])
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
    },
    []
  );

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
        .select("role, professional_type")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const typedProfile = profile as ProfileRow;
      const userRole = typedProfile.role;
      setRole(userRole);

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
    loadRequestsLive();
  }, [loadRequestsLive]);

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
    if (!confirm("Cancel this booking?")) return;

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

      const cancelledAt = new Date().toISOString();

      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_by: user.id,
          cancelled_at: cancelledAt,
        })
        .eq("id", bookingId)
        .eq("customer_id", user.id)
        .in("status", ["confirmed", "completion_requested"]);

      if (error) {
        setMessage(error.message);
        return;
      }

      setBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                status: "cancelled",
                cancelled_by: user.id,
                cancelled_at: cancelledAt,
              }
            : booking
        )
      );

      setMessage("Booking cancelled.");
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
    () => requests.filter((request) => request.status !== "completed"),
    [requests]
  );

  const completedRequests = useMemo(
    () => requests.filter((request) => request.status === "completed"),
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

  const professionalOpenRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== "open") return false;
        if (request.is_direct_rebook) {
          return request.preferred_professional_id === userIdFromOpenRequest(request);
        }
        return true;
      }),
    [requests]
  );

  const professionalTrackedRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.accepted_professional_id &&
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
        subtitle: request.service_detail || null,
        description: request.description || null,
        client_name: null,
        client_avatar_url: null,
        location: request.location || null,
        service_mode: request.service_mode || null,
        budget: request.budget || null,
        created_at: request.created_at,
        completed_at: request.completed_at || null,
        href: `/requests/${request.id}`,
        rawRequest: request,
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
        location: null,
        service_mode: null,
        budget: null,
        created_at: booking.created_at,
        completed_at: booking.completed_at || null,
        href: `/bookings/${booking.id}`,
        rawBooking: booking,
      }));

    return [...requestItems, ...bookingItems].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [professionalUpcomingRequests, professionalUpcomingBookings]);

  const unifiedProfessionalCompletedWork = useMemo(() => {
    const requestItems: UnifiedProfessionalWorkItem[] =
      professionalCompletedRequests.map((request) => ({
        id: request.id,
        source: "request",
        status: "completed",
        title: request.title,
        subtitle: request.service_detail || null,
        description: request.description || null,
        client_name: null,
        client_avatar_url: null,
        location: request.location || null,
        service_mode: request.service_mode || null,
        budget: request.budget || null,
        created_at: request.created_at,
        completed_at: request.completed_at || null,
        href: `/requests/${request.id}`,
        rawRequest: request,
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
        location: null,
        service_mode: null,
        budget: null,
        created_at: booking.created_at,
        completed_at: booking.completed_at || null,
        href: `/bookings/${booking.id}`,
        rawBooking: booking,
      }));

    return [...requestItems, ...bookingItems].sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime()
    );
  }, [professionalCompletedRequests, professionalCompletedBookings]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl">
          <Navbar />
          <div className="py-16">
            <p className="text-neutral-500">Loading requests...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="py-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                {isProfessional ? "Work Hub" : "Requests"}
              </p>

              <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
                {isCustomer ? "Your requests." : "Your work."}
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                {isCustomer
                  ? "Track your requests, bookings, and completed services in one place."
                  : "Manage open requests, upcoming work, and completed work in one place."}
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

          {message ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          {!message && isCustomer && requests.length === 0 && bookings.length === 0 ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8">
              <h2 className="text-2xl font-semibold tracking-tight">
                Nothing here yet
              </h2>

              <p className="mt-3 max-w-xl text-neutral-600">
                Once you post a request or book a service, it will appear here.
              </p>

              <div className="mt-6">
                <Link
                  href="/requests/new"
                  className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Submit a request
                </Link>
              </div>
            </div>
          ) : null}

          {!message &&
          isProfessional &&
          professionalOpenRequests.length === 0 &&
          unifiedProfessionalUpcomingWork.length === 0 &&
          unifiedProfessionalCompletedWork.length === 0 ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8">
              <h2 className="text-2xl font-semibold tracking-tight">
                Nothing here yet
              </h2>

              <p className="mt-3 max-w-xl text-neutral-600">
                Open requests, accepted work, and completed work will appear here.
              </p>
            </div>
          ) : null}

          {isCustomer ? (
            <>
              <div className="mt-10">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Active bookings
                </h2>

                {activeBookings.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-neutral-600">
                    No active bookings right now.
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
                              </div>
                            </div>

                            <p className="shrink-0 text-sm text-neutral-500">
                              Created {formatDateTime(booking.created_at)}
                            </p>
                          </div>

                          <div className="mt-6 grid gap-4 md:grid-cols-3">
                            <div className="rounded-2xl border border-neutral-200 p-4">
                              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                Professional
                              </p>
                              <p className="mt-2 text-sm font-medium text-neutral-900">
                                {booking.professional_name || "Not available"}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-neutral-200 p-4">
                              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                Duration
                              </p>
                              <p className="mt-2 text-sm font-medium text-neutral-900">
                                {booking.duration_minutes
                                  ? `${booking.duration_minutes} min`
                                  : "Not provided"}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-neutral-200 p-4">
                              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                Status
                              </p>
                              <p className="mt-2 text-sm font-medium text-neutral-900">
                                {booking.status === "completion_requested"
                                  ? "Awaiting your confirmation"
                                  : booking.status}
                              </p>
                            </div>
                          </div>

                          <div className="mt-6 flex flex-wrap gap-3">
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
                              <button
                                type="button"
                                onClick={() => handleCancelBooking(booking.id)}
                                disabled={isLoadingAction}
                                className="inline-flex rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                              >
                                {isLoadingAction ? "Working..." : "Cancel booking"}
                              </button>
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

                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Location
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {request.location || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Service mode
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {formatMode(request.service_mode) || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Budget
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {request.budget || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Matched to
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {request.is_direct_rebook
                                ? "Direct to requested professional"
                                : request.target_professions?.length
                                ? request.target_professions
                                    .map((item) =>
                                      item
                                        .replaceAll("_", " ")
                                        .replace(/\b\w/g, (char) =>
                                          char.toUpperCase()
                                        )
                                    )
                                    .join(", ")
                                : "Not set"}
                            </p>
                          </div>
                        </div>
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
            </>
          ) : null}

          {isProfessional ? (
            <>
              <div className="mt-10">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Open Requests
                </h2>

                {professionalOpenRequests.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-neutral-600">
                    No open requests right now.
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {professionalOpenRequests.map((request) => (
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
                                  Open
                                </span>

                                {professionalUnreadRequestIds.includes(request.id) &&
                                !respondedRequestIds.includes(request.id) ? (
                                  <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                                    New
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

                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Location
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {request.location || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Service mode
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {formatMode(request.service_mode) || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Budget
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {request.budget || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Status
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {respondedRequestIds.includes(request.id)
                                ? "Responded"
                                : "Ready for response"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6">
                          {request.is_direct_rebook ? (
                            respondedRequestIds.includes(request.id) ? (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
                                Rebook response sent
                              </span>
                            ) : (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
                                Repeat client request
                              </span>
                            )
                          ) : respondedRequestIds.includes(request.id) ? (
                            <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-500">
                              Responded
                            </span>
                          ) : (
                            <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900">
                              Respond now
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
                  Upcoming Work
                </h2>

                {unifiedProfessionalUpcomingWork.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-neutral-600">
                    No upcoming work right now.
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {unifiedProfessionalUpcomingWork.map((item) => (
                      <div
                        key={`${item.source}-${item.id}`}
                        className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
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
                                  {item.client_name?.charAt(0).toUpperCase() || "W"}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 max-w-3xl">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {item.source}
                                </span>

                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {item.status === "completion_requested"
                                    ? "Awaiting confirmation"
                                    : item.status}
                                </span>

                                {item.source === "request" ? (
                                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                    {formatCategory(item.rawRequest.category)}
                                    {item.rawRequest.service_detail
                                      ? ` • ${item.rawRequest.service_detail}`
                                      : ""}
                                  </span>
                                ) : null}
                              </div>

                              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                {item.title}
                              </h2>

                              {item.subtitle ? (
                                <p className="mt-3 text-neutral-600">{item.subtitle}</p>
                              ) : null}

                              {item.description ? (
                                <p className="mt-2 text-neutral-600 line-clamp-3">
                                  {item.description}
                                </p>
                              ) : null}

                              {item.client_name ? (
                                <p className="mt-2 text-neutral-600">
                                  Client: {item.client_name}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <p className="shrink-0 text-sm text-neutral-500">
                            Created {formatDateTime(item.created_at)}
                          </p>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Source
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {item.source === "booking"
                                ? "Direct booking"
                                : "Marketplace request"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Location
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {item.location || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Service mode
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {formatMode(item.service_mode) || "Not provided"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-neutral-200 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Budget / Value
                            </p>
                            <p className="mt-2 text-sm font-medium text-neutral-900">
                              {item.budget || "Not provided"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              {item.source === "booking" ? "View booking" : "View request"}
                            </Link>
                          ) : null}

                          {item.source === "booking" &&
                          item.status === "completion_requested" ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleConfirmBookingCompletion(item.rawBooking.id)
                              }
                              className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                            >
                              Confirm completion
                            </button>
                          ) : null}

                          {item.source === "booking" &&
                          (item.status === "confirmed" ||
                            item.status === "completion_requested") ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(item.rawBooking.id)}
                              className="inline-flex rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                            >
                              Cancel booking
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-14">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Completed Work
                </h2>

                {unifiedProfessionalCompletedWork.length === 0 ? (
                  <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 text-neutral-600">
                    No completed work yet.
                  </div>
                ) : (
                  <div className="mt-6 grid gap-6">
                    {unifiedProfessionalCompletedWork.map((item) => (
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
                                  {item.source}
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
                                <p className="mt-2 text-neutral-600">
                                  Client: {item.client_name}
                                </p>
                              ) : null}
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
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                            >
                              {item.source === "booking" ? "View booking" : "View request"}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}