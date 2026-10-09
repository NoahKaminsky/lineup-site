// Server-only initial data for /calendar — see app/requests/getInitialData.ts
// for the pattern. Deliberately leaves out the booking-usage fetch
// (/api/professional/booking-usage) — it's already a non-blocking,
// fire-and-forget call on the client and only matters for subscribed
// professionals, not worth duplicating server-side for this pass.

import { createSupabaseServerClient } from "@/app/lib/serverSupabase";

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
  formatted_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
};

const BOOKING_COLUMNS =
  "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id";

function normalizeRole(role: string | null | undefined) {
  return role?.toLowerCase().trim() || "";
}
function isCustomerRole(role: string | null | undefined) {
  return normalizeRole(role).includes("customer");
}
function isProfessionalRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return !normalized.includes("customer") && !!normalized;
}
function isSubscribedToSchedule(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed = profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return subscribed && !!profile.subscription_plan && profile.subscription_plan !== "basic";
}

export type CalendarInitialData = {
  role: string;
  bookings: Record<string, unknown>[];
  subscribed: boolean;
};

export type CalendarInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: CalendarInitialData }
  | { kind: "fallback" };

export async function getInitialCalendarData(): Promise<CalendarInitialResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "redirect", to: "/login" };

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, subscription_status, subscription_plan")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) return { kind: "fallback" };

    const role = profile.role as string | null;

    if (isCustomerRole(role)) return { kind: "redirect", to: "/requests" };
    if (!isProfessionalRole(role)) return { kind: "fallback" };

    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("professional_id", user.id)
      .in("status", ["confirmed", "completion_requested", "completed"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (bookingsError) throw new Error(bookingsError.message);

    const rawBookings = (bookingsData as BookingRow[]) || [];
    const customerIds = [...new Set(rawBookings.map((b) => b.customer_id).filter(Boolean))];

    const { data: customerProfiles, error: customerProfilesError } =
      customerIds.length > 0
        ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", customerIds)
        : { data: [], error: null };

    if (customerProfilesError) throw new Error(customerProfilesError.message);

    const customerMap = new Map(
      ((customerProfiles as { id: string; full_name: string | null; avatar_url: string | null }[]) || []).map((c) => [
        c.id,
        c,
      ])
    );

    const bookings = rawBookings.map((booking) => {
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
      kind: "ok",
      data: { role: role ?? "", bookings, subscribed: isSubscribedToSchedule(profile) },
    };
  } catch (error) {
    console.error("getInitialCalendarData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}
