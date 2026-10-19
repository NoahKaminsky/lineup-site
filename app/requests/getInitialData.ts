// Server-only initial data for /requests, read with the signed-in user's own
// session (via cookies — see app/lib/serverSupabase.ts), so the first HTML
// response already has real content instead of a loading skeleton.
//
// This intentionally mirrors hydrateCustomerData() / hydrateProfessionalData()
// in RequestsPageClient.tsx query-for-query, rather than sharing code with
// them — those run against the browser Supabase client inside React state
// setters, this runs server-side and returns a plain object. Duplicated on
// purpose: keeping them separate means a change to one can't silently change
// the other's behavior. If you change what one fetches, change both.
//
// One real improvement over the client version: several of its queries don't
// actually depend on each other but were awaited one after another. Here
// they're batched with Promise.all, so a cold load is ~2 round trips instead
// of ~5.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";
import { requestMatchesProfessional, formatProfessions } from "@/app/lib/professions";

type ServiceRequestRow = Record<string, unknown> & {
  id: string;
  client_id: string;
  accepted_professional_id: string | null;
  status: string;
  created_at: string;
  is_direct_rebook?: boolean | null;
  preferred_professional_id?: string | null;
};

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  request_id?: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
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

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, request_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, refund_status";

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

export type RequestsInitialData = {
  role: string | null;
  userId: string;
  userName: string | null;
  requests: ServiceRequestRow[];
  bookings: Record<string, unknown>[];
  professionalBookings: Record<string, unknown>[];
  respondedRequestIds: string[];
  professionalUnreadRequestIds: string[];
  offerCountsByRequest: Record<string, number>;
  unreadOfferCountsByRequest: Record<string, number>;
  // Not part of RequestsCache (the client never persists this one to its
  // cache either — it's always recomputed fresh), but worth seeding from
  // here anyway so a cold load doesn't briefly show a "leave a review"
  // prompt on bookings the user already reviewed.
  reviewedBookingIds: string[];
};

export type RequestsInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: RequestsInitialData; userLocation: { lat: number; lng: number } | null }
  // Role isn't customer or professional, or a query failed — fall back to
  // letting the client component's own loadRequestsLive() do a normal cold
  // load, exactly as it did before this file existed.
  | { kind: "fallback"; userLocation: { lat: number; lng: number } | null };

export async function getInitialRequestsData(): Promise<RequestsInitialResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "redirect", to: "/login" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, professional_type, professional_types, service_modes, full_name, location_lat, location_lng")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return { kind: "redirect", to: "/onboarding" };

  const userLocation =
    typeof profile.location_lat === "number" && typeof profile.location_lng === "number"
      ? { lat: profile.location_lat, lng: profile.location_lng }
      : null;

  const role = profile.role as string | null;

  try {
    if (isCustomerRole(role)) {
      const data = await fetchCustomerData(supabase, user.id, role, profile.full_name ?? null);
      return { kind: "ok", data, userLocation };
    }

    if (isProfessionalRole(role)) {
      const data = await fetchProfessionalData(supabase, user.id, role, profile.full_name ?? null, profile);
      return { kind: "ok", data, userLocation };
    }

    return { kind: "fallback", userLocation };
  } catch (error) {
    // Any query failure here just means the client does its normal fetch
    // instead — never worse than the page behaved before this existed.
    console.error("getInitialRequestsData failed, falling back to client load:", error);
    return { kind: "fallback", userLocation };
  }
}

async function fetchCustomerData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  role: string | null,
  userName: string | null
): Promise<RequestsInitialData> {
  const [{ data: requestsData, error: requestsError }, { data: bookingsData, error: bookingsError }] =
    await Promise.all([
      supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("customer_id", userId)
        .order("booking_date", { ascending: false })
        .order("start_time", { ascending: false }),
    ]);

  if (requestsError) throw new Error(requestsError.message);
  if (bookingsError) throw new Error(bookingsError.message);

  const requests = (requestsData as ServiceRequestRow[]) || [];
  const rawBookings = (bookingsData as BookingRow[]) || [];

  const requestIds = requests.map((r) => r.id);
  const professionalIds = [...new Set(rawBookings.map((b) => b.professional_id).filter(Boolean))];
  const completedBookingIds = rawBookings.filter((b) => b.status === "completed").map((b) => b.id);

  const [offersResult, professionalProfilesResult, reviewedRowsResult] = await Promise.all([
    requestIds.length > 0
      ? supabase.from("request_offers").select("id, request_id, viewed_by_customer").in("request_id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    professionalIds.length > 0
      ? supabase.from("profiles").select("id, full_name, avatar_url, professional_type, professional_types").in("id", professionalIds)
      : Promise.resolve({ data: [], error: null }),
    completedBookingIds.length > 0
      ? supabase
          .from("professional_reviews")
          .select("booking_id")
          .eq("reviewer_id", userId)
          .in("booking_id", completedBookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (offersResult.error) throw new Error(offersResult.error.message);
  if (professionalProfilesResult.error) throw new Error(professionalProfilesResult.error.message);
  // reviewedRowsResult failing isn't worth failing the whole page for — it
  // only affects whether a "leave a review" prompt shows, so just treat it
  // as empty on error instead of throwing.
  const reviewedBookingIds = (
    (reviewedRowsResult.data as { booking_id: string }[] | null) || []
  )
    .map((row) => row.booking_id)
    .filter(Boolean);

  const offerCountsByRequest: Record<string, number> = {};
  const unreadOfferCountsByRequest: Record<string, number> = {};
  (offersResult.data as { request_id: string; viewed_by_customer: boolean | null }[] | null || []).forEach(
    (offer) => {
      offerCountsByRequest[offer.request_id] = (offerCountsByRequest[offer.request_id] || 0) + 1;
      if (!offer.viewed_by_customer) {
        unreadOfferCountsByRequest[offer.request_id] = (unreadOfferCountsByRequest[offer.request_id] || 0) + 1;
      }
    }
  );

  const professionalMap = new Map(
    (
      (professionalProfilesResult.data as
        | { id: string; full_name: string | null; avatar_url: string | null; professional_type: string | null; professional_types?: string[] | null }[]
        | null) || []
    ).map((pro) => [pro.id, pro])
  );

  const bookings = rawBookings.map((booking) => {
    const professional = professionalMap.get(booking.professional_id);
    return {
      ...booking,
      start_time: String(booking.start_time).slice(0, 5),
      end_time: String(booking.end_time).slice(0, 5),
      professional_name: professional?.full_name ?? null,
      professional_avatar_url: professional?.avatar_url ?? null,
      professional_type: professional ? formatProfessions(professional, "") || null : null,
    };
  });

  return {
    role,
    userId,
    userName,
    requests,
    bookings,
    professionalBookings: [],
    respondedRequestIds: [],
    professionalUnreadRequestIds: [],
    offerCountsByRequest,
    unreadOfferCountsByRequest,
    reviewedBookingIds,
  };
}

async function fetchProfessionalData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  role: string | null,
  userName: string | null,
  proProfile: { professional_type?: string | null; professional_types?: string[] | null; service_modes?: string[] | null }
): Promise<RequestsInitialData> {
  const [
    { data: allRequestsData, error: allRequestsError },
    { data: trackedRequestsData, error: trackedRequestsError },
    { data: offersData, error: offersError },
    { data: notificationsData, error: notificationsError },
    { data: professionalBookingsData, error: professionalBookingsError },
  ] = await Promise.all([
    supabase.from("service_requests").select("*").order("created_at", { ascending: false }),
    supabase
      .from("service_requests")
      .select("*")
      .eq("accepted_professional_id", userId)
      .in("status", ["accepted", "completion_requested", "completed"])
      .order("created_at", { ascending: false }),
    supabase.from("request_offers").select("request_id").eq("professional_id", userId),
    supabase.from("notifications").select("request_id").eq("user_id", userId).eq("is_read", false),
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("professional_id", userId)
      .in("status", ["confirmed", "completion_requested", "completed", "cancelled"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (allRequestsError) throw new Error(allRequestsError.message);
  if (trackedRequestsError) throw new Error(trackedRequestsError.message);
  if (offersError) throw new Error(offersError.message);
  if (professionalBookingsError) throw new Error(professionalBookingsError.message);
  // notificationsError: same treatment as the client version — log and
  // continue with an empty list rather than failing the whole page.
  if (notificationsError) console.error("Error loading unread notifications:", notificationsError);

  const mergedRequestsMap = new Map<string, ServiceRequestRow>();
  ((allRequestsData as ServiceRequestRow[]) ?? []).forEach((item) => mergedRequestsMap.set(item.id, item));
  ((trackedRequestsData as ServiceRequestRow[]) ?? []).forEach((item) => mergedRequestsMap.set(item.id, item));

  const requests = Array.from(mergedRequestsMap.values())
    .filter((request) => {
      // Jobs this pro already won always stay; open requests only if they're
      // for one of this pro's professions (see app/lib/professions.ts).
      if (request.accepted_professional_id === userId) return true;
      return (
        request.status === "open" &&
        requestMatchesProfessional(request as Parameters<typeof requestMatchesProfessional>[0], { ...proProfile, id: userId })
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const respondedRequestIds = Array.from(
    new Set(((offersData ?? []) as { request_id: string | null }[]).map((o) => o.request_id).filter((id): id is string => !!id))
  );

  const professionalUnreadRequestIds = Array.from(
    new Set(
      ((notificationsData ?? []) as { request_id: string | null }[])
        .map((n) => n.request_id)
        .filter((id): id is string => !!id)
    )
  );

  const rawBookings = (professionalBookingsData as BookingRow[]) || [];
  const customerIds = [...new Set(rawBookings.map((b) => b.customer_id).filter(Boolean))];

  const { data: customerProfilesData, error: customerProfilesError } =
    customerIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", customerIds)
      : { data: [], error: null };

  if (customerProfilesError) throw new Error(customerProfilesError.message);

  const customerMap = new Map(
    ((customerProfilesData as { id: string; full_name: string | null; avatar_url: string | null }[]) || []).map(
      (c) => [c.id, c]
    )
  );

  const professionalBookings = rawBookings.map((booking) => {
    const customer = customerMap.get(booking.customer_id);
    return {
      ...booking,
      start_time: String(booking.start_time).slice(0, 5),
      end_time: String(booking.end_time).slice(0, 5),
      client_name: customer?.full_name ?? null,
      client_avatar_url: customer?.avatar_url ?? null,
    };
  });

  return {
    role,
    userId,
    userName,
    requests,
    bookings: [],
    professionalBookings,
    respondedRequestIds,
    professionalUnreadRequestIds,
    offerCountsByRequest: {},
    unreadOfferCountsByRequest: {},
    reviewedBookingIds: [],
  };
}
