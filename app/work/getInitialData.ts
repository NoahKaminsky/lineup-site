// Server-only initial data for /work — see app/requests/getInitialData.ts for
// the pattern. This is the most involved of the pages converted this pass:
// duplicates bookingToBookedItem()/requestToBookedItem() and the customer/
// professional matching logic from page.tsx verbatim, plus a server-side
// equivalent of getCustomerRatingsMap() (that helper hardcodes the browser
// Supabase client, so it can't be called directly from here).

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";
import { requestMatchesProfessional } from "@/app/lib/professions";

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

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
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
  request_id?: string | null;
  refund_status?: string | null;
};

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
  service_mode: string | null;
  service_modes: string[] | null;
  budget: string | null;
  status: string;
  accepted_professional_id: string | null;
  created_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  preferred_professional_id?: string | null;
  is_direct_rebook?: boolean | null;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
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
  responded_at: string | null;
};

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id, request_id, refund_status";
const OFFER_COLUMNS =
  "id, request_id, professional_id, message, proposed_price, proposed_date, proposed_start_time, proposed_end_time, status, created_at, responded_at";

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
  return category.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
  if (status === "not_selected") return "Outbid";
  return status || "Unknown";
}
function getRequestDateTime(request: ServiceRequest) {
  if (request.scheduled_date && request.scheduled_start_time) {
    return new Date(`${request.scheduled_date}T${String(request.scheduled_start_time).slice(0, 5)}:00`);
  }
  if (request.preferred_date && request.preferred_start_time) {
    return new Date(`${request.preferred_date}T${String(request.preferred_start_time).slice(0, 5)}:00`);
  }
  return new Date(request.created_at);
}
function getBookingDateTime(booking: BookingRow) {
  return new Date(`${booking.booking_date}T${String(booking.start_time).slice(0, 5)}:00`);
}

function bookingToBookedItem(booking: BookingRow, profileMap: Map<string, Profile>) {
  const customer = profileMap.get(booking.customer_id);
  const professional = profileMap.get(booking.professional_id);
  const dateTime = getBookingDateTime(booking);

  return {
    id: booking.id,
    source: "booking" as const,
    originRequestId: booking.request_id || null,
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
    cancelledAt: booking.cancelled_at || null,
    refundStatus: booking.refund_status || null,
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

function requestToBookedItem(request: ServiceRequest, profileMap: Map<string, Profile>) {
  const customer = profileMap.get(request.client_id);
  const professional = request.accepted_professional_id ? profileMap.get(request.accepted_professional_id) : null;
  const dateTime = getRequestDateTime(request);
  const date = request.scheduled_date || request.preferred_date || null;
  const startTime = request.scheduled_start_time || request.preferred_start_time || null;
  const endTime = request.scheduled_end_time || null;

  return {
    id: request.id,
    source: "request" as const,
    originRequestId: null,
    status: request.status === "confirmed" ? "confirmed" : request.status,
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
    cancelledAt: request.cancelled_at || null,
    refundStatus: null,
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

type BookedItemResult = ReturnType<typeof bookingToBookedItem> | ReturnType<typeof requestToBookedItem>;

export type WorkInitialData = {
  profile: Profile;
  bookedItems: BookedItemResult[];
  requestAndOfferItems: Record<string, unknown>[];
  customerRatings: Record<string, number>;
};

export type WorkInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: WorkInitialData }
  | { kind: "fallback" };

export async function getInitialWorkData(): Promise<WorkInitialResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "redirect", to: "/login" };

  try {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, avatar_url, professional_type, professional_types, service_modes")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) return { kind: "fallback" };

    const profile = profileData as Profile;

    if (isCustomerRole(profile.role)) {
      return { kind: "ok", data: await fetchCustomerWork(supabase, user.id, profile) };
    }
    if (isProfessionalRole(profile.role)) {
      return { kind: "ok", data: await fetchProfessionalWork(supabase, user.id, profile) };
    }

    return { kind: "fallback" };
  } catch (error) {
    console.error("getInitialWorkData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}

async function getProfileMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profileIds: string[]
) {
  if (profileIds.length === 0) return new Map<string, Profile>();
  const { data } = await supabase.from("profiles").select("id, email, full_name, role, avatar_url").in("id", profileIds);
  return new Map(((data || []) as Profile[]).map((item) => [item.id, item]));
}

async function fetchCustomerWork(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  profile: Profile
): Promise<WorkInitialData> {
  const [{ data: requestData, error: requestError }, { data: bookingData, error: bookingError }] = await Promise.all([
    supabase.from("service_requests").select("*").eq("client_id", userId).order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("customer_id", userId)
      .in("status", ["confirmed", "completion_requested", "completed", "cancelled"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (requestError) throw new Error(requestError.message);
  if (bookingError) throw new Error(bookingError.message);

  const requests = (requestData || []) as ServiceRequest[];
  const requestIds = requests.map((r) => r.id);
  const bookings = (bookingData || []) as BookingRow[];

  const { data: offersData, error: offersError } =
    requestIds.length > 0
      ? await supabase.from("request_offers").select(OFFER_COLUMNS).in("request_id", requestIds).order("created_at", { ascending: false })
      : { data: [], error: null };

  if (offersError) throw new Error(offersError.message);

  const offersReceived = (offersData || []) as OfferRow[];
  const requestMap = new Map(requests.map((r) => [r.id, r]));

  const profileIds = Array.from(
    new Set(
      [
        ...bookings.map((b) => b.professional_id),
        ...requests.map((r) => r.accepted_professional_id),
        ...offersReceived.map((o) => o.professional_id),
      ].filter(Boolean) as string[]
    )
  );

  const profileMap = await getProfileMap(supabase, profileIds);

  const bookingItems = bookings.map((b) => bookingToBookedItem(b, profileMap));
  const bookedRequestIds = new Set(bookings.map((b) => b.request_id).filter(Boolean));

  const acceptedRequestItems = requests
    .filter((r) => ["accepted", "confirmed", "completion_requested", "completed"].includes(r.status) && !bookedRequestIds.has(r.id))
    .map((r) => requestToBookedItem(r, profileMap));

  const postedItems = requests.map((request) => ({
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

  const offerItems = offersReceived.map((offer) => {
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
      requestStatus: request?.status || null,
      respondedAt: offer.responded_at,
      rawOfferStatus: offer.status,
    };
  });

  return {
    profile,
    bookedItems: [...bookingItems, ...acceptedRequestItems],
    requestAndOfferItems: [...postedItems, ...offerItems],
    customerRatings: {},
  };
}

async function fetchProfessionalWork(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  profile: Profile
): Promise<WorkInitialData> {
  const [
    { data: allRequestsData, error: allRequestsError },
    { data: trackedRequestsData, error: trackedRequestsError },
    { data: bookingsData, error: bookingsError },
    { data: offersSentData },
  ] = await Promise.all([
    supabase.from("service_requests").select("*").order("created_at", { ascending: false }),
    supabase
      .from("service_requests")
      .select("*")
      .eq("accepted_professional_id", userId)
      .in("status", ["accepted", "confirmed", "completion_requested", "completed", "cancelled"])
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("professional_id", userId)
      .in("status", ["confirmed", "completion_requested", "completed", "cancelled"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase.from("request_offers").select(OFFER_COLUMNS).eq("professional_id", userId).neq("status", "withdrawn").order("created_at", { ascending: false }),
  ]);

  if (allRequestsError) throw new Error(allRequestsError.message);
  if (trackedRequestsError) throw new Error(trackedRequestsError.message);
  if (bookingsError) throw new Error(bookingsError.message);

  const allRequests = (allRequestsData || []) as ServiceRequest[];
  const trackedRequests = (trackedRequestsData || []) as ServiceRequest[];
  const bookings = (bookingsData || []) as BookingRow[];
  const offersSent = (offersSentData || []) as OfferRow[];

  // Shared rule (app/lib/professions.ts) — see WorkPageClient.tsx.
  const openRequests = allRequests.filter(
    (request) => request.status === "open" && requestMatchesProfessional(request, { ...profile, id: userId })
  );

  const offerRequestIds = Array.from(new Set(offersSent.map((o) => o.request_id)));
  const offerRequestMap = new Map<string, ServiceRequest>();
  allRequests.forEach((request) => {
    if (offerRequestIds.includes(request.id)) offerRequestMap.set(request.id, request);
  });

  const profileIds = Array.from(
    new Set(
      [
        ...trackedRequests.map((r) => r.client_id),
        ...bookings.map((b) => b.customer_id),
        ...openRequests.map((r) => r.client_id),
        ...Array.from(offerRequestMap.values()).map((r) => r.client_id),
      ].filter(Boolean) as string[]
    )
  );

  const completedBookingIds = bookings.filter((b) => b.status === "completed").map((b) => b.id);
  const bookedRequestIdsForRatings = new Set(bookings.map((b) => b.request_id).filter(Boolean));
  const completedRequestIds = trackedRequests
    .filter((r) => r.status === "completed" && !bookedRequestIdsForRatings.has(r.id))
    .map((r) => r.id);

  const openRequestClientIds = Array.from(new Set(openRequests.map((r) => r.client_id).filter(Boolean)));

  // profileMap, open-request-owner ratings, and this professional's own
  // customer-ratings-given all only depend on the batch above, not on each
  // other -- fetch all three together.
  const [profileMap, openRequestOwnerRatings, existingRatingsResult] = await Promise.all([
    getProfileMap(supabase, profileIds),
    getCustomerRatingsMapServer(supabase, openRequestClientIds),
    completedBookingIds.length > 0 || completedRequestIds.length > 0
      ? supabase
          .from("customer_reviews")
          .select("booking_id, request_id, rating")
          .eq("reviewer_id", userId)
          .or(
            [
              completedBookingIds.length > 0 ? `booking_id.in.(${completedBookingIds.join(",")})` : null,
              completedRequestIds.length > 0 ? `request_id.in.(${completedRequestIds.join(",")})` : null,
            ]
              .filter(Boolean)
              .join(",")
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingRatingsResult.error) throw new Error(existingRatingsResult.error.message);

  const customerRatings: Record<string, number> = {};
  ((existingRatingsResult.data as { booking_id: string | null; request_id: string | null; rating: number }[] | null) || []).forEach(
    (row) => {
      if (row.booking_id) customerRatings[`booking-${row.booking_id}`] = row.rating;
      if (row.request_id) customerRatings[`request-${row.request_id}`] = row.rating;
    }
  );

  const bookingItems = bookings.map((b) => bookingToBookedItem(b, profileMap));
  const bookedRequestIds = new Set(bookings.map((b) => b.request_id).filter(Boolean));
  const acceptedRequestItems = trackedRequests
    .filter((r) => !bookedRequestIds.has(r.id))
    .map((r) => requestToBookedItem(r, profileMap));

  const openItems = openRequests.map((request) => {
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
      personRating: openRequestOwnerRatings[request.client_id] ?? null,
    };
  });

  const offerItems = offersSent.map((offer) => {
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
      requestStatus: request?.status || null,
      respondedAt: offer.responded_at,
      rawOfferStatus: offer.status,
    };
  });

  return {
    profile,
    bookedItems: [...bookingItems, ...acceptedRequestItems],
    requestAndOfferItems: [...openItems, ...offerItems],
    customerRatings,
  };
}

// Server-side equivalent of app/lib/customerRatings.ts's getCustomerRatingsMap
// -- that helper hardcodes the browser Supabase client, so it can't be
// called directly here. Returns the richer {average, count} shape the client
// component actually expects for personRating.
async function getCustomerRatingsMapServer(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  customerIds: string[]
): Promise<Record<string, { average: number; count: number }>> {
  const uniqueIds = Array.from(new Set(customerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase.from("customer_reviews").select("customer_id, rating").in("customer_id", uniqueIds);
  if (error || !data) return {};

  const totals = new Map<string, { sum: number; count: number }>();
  data.forEach((row: { customer_id: string; rating: number }) => {
    const entry = totals.get(row.customer_id) || { sum: 0, count: 0 };
    entry.sum += row.rating;
    entry.count += 1;
    totals.set(row.customer_id, entry);
  });

  const result: Record<string, { average: number; count: number }> = {};
  totals.forEach((value, customerId) => {
    result[customerId] = { average: value.sum / value.count, count: value.count };
  });
  return result;
}
