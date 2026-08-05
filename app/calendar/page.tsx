"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";

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
  formatted_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_place_id: string | null;
};

type CalendarBooking = BookingRow & {
  client_name: string | null;
  client_avatar_url: string | null;
};

type CalendarCache = {
  role: string;
  bookings: CalendarBooking[];
  subscribed: boolean;
};

function isSubscribedToSchedule(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return subscribed && !!profile.subscription_plan && profile.subscription_plan !== "basic";
}

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

function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
}

function formatDateLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDateLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
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

function getDistanceKm(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null
) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
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

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number | null) {
  if (km == null) return null;
  if (km < 1) return "<1 km away";
  return `${km.toFixed(1)} km away`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function getTodayKey() {
  const now = new Date();
  return getDateKey(now);
}

function getBookingDateTime(booking: CalendarBooking) {
  return new Date(`${booking.booking_date}T${booking.start_time}:00`);
}

function isEveningBooking(booking: CalendarBooking) {
  const hour = Number(String(booking.start_time).slice(0, 2));
  return hour >= 16;
}

function formatDisplayAddress(address: string | null) {
  if (!address?.trim()) return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts.slice(0, 2).join(", " );
  }

  return address;
}

function formatStatusLabel(status: BookingStatus) {
  if (status === "completion_requested") return "Awaiting confirmation";
  if (status === "confirmed") return "Confirmed";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function getGoogleMapsUrl(booking: CalendarBooking) {
  if (typeof booking.location_lat === "number" && typeof booking.location_lng === "number") {
    return `https://www.google.com/maps?q=${booking.location_lat},${booking.location_lng}`;
  }

  if (booking.formatted_address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.formatted_address)}`;
  }

  return null;
}

function BookingCard({
  booking,
  compact = false,
  userLat,
  userLng,
}: {
  booking: CalendarBooking;
  compact?: boolean;
  userLat?: number | null;
  userLng?: number | null;
}) {
  const displayAddress = formatDisplayAddress(booking.formatted_address);
  const mapsUrl = getGoogleMapsUrl(booking);
  const distance = formatDistance(
    getDistanceKm(userLat, userLng, booking.location_lat, booking.location_lng)
  );

  const metaParts = [
    booking.duration_minutes ? `${booking.duration_minutes} min` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/bookings/${booking.id}`}
      className={`block rounded-2xl border border-neutral-200 bg-neutral-50 transition hover:border-neutral-300 hover:bg-white hover:shadow-sm ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-white">
          {booking.client_avatar_url ? (
            <img
              src={booking.client_avatar_url}
              alt={booking.client_name || "Client"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
              {booking.client_name?.charAt(0).toUpperCase() || "C"}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`${compact ? "text-base" : "text-lg"} font-semibold text-neutral-900`}>
              <span className="mr-1.5 text-neutral-400">{isEveningBooking(booking) ? "☾" : "☼"}</span>
              {booking.service_name || "Booked service"}
            </h3>

            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              booking.status === "confirmed" ? "bg-emerald-100 text-emerald-800" :
              booking.status === "completion_requested" ? "bg-amber-100 text-amber-800" :
              booking.status === "completed" ? "bg-neutral-100 text-neutral-600" :
              "bg-white text-neutral-700"
            }`}>
              {formatStatusLabel(booking.status)}
            </span>
          </div>

          <p className="mt-1 text-sm text-neutral-500">
            {booking.client_name || "Unknown client"} · {formatShortDateLabel(booking.booking_date)} · {formatTime(booking.start_time)}–{formatTime(booking.end_time)}
            {metaParts.length > 0 ? ` · ${metaParts.join(" · ")}` : ""}
          </p>

          {displayAddress ? (
            <p className="mt-1.5 truncate text-sm text-neutral-500">
              📍 {displayAddress}
              {distance ? <span className="ml-1.5 text-neutral-400">· {distance}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {mapsUrl ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open(mapsUrl, "_blank", "noopener,noreferrer");
          }}
          className="mt-3 inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Open in Maps
        </button>
      ) : null}
    </Link>
  );
}

export default function CalendarPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<CalendarCache>("calendar-page"));
  const [role, setRole] = useState<string | null>(() => getCached<CalendarCache>("calendar-page")?.role ?? null);
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState<CalendarBooking[]>(() => getCached<CalendarCache>("calendar-page")?.bookings ?? []);
  const [subscribed, setSubscribed] = useState(() => getCached<CalendarCache>("calendar-page")?.subscribed ?? false);
  const [bookingUsage, setBookingUsage] = useState<{ count: number; cap: number | null } | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const hasLoadedOnceRef = useRef(false);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mobileDayRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const loadCalendarData = useCallback(
    async (options?: { silent?: boolean }) => {
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, subscription_status, subscription_plan")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const userRole = profile.role as string | null;
      const subscribedNow = isSubscribedToSchedule(profile);
      setRole(userRole);
      setSubscribed(subscribedNow);

      if (subscribedNow) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        fetch("/api/professional/booking-usage", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        })
          .then((res) => res.json())
          .then((json) => {
            if (typeof json.count === "number") {
              setBookingUsage({ count: json.count, cap: json.cap ?? null });
            }
          })
          .catch(() => {});
      }

      if (isCustomerRole(userRole)) {
        router.push("/requests");
        return;
      }

      if (!isProfessionalRole(userRole)) {
        setMessage("Invalid account role.");
        setLoading(false);
        return;
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at, formatted_address, location_lat, location_lng, location_place_id"
        )
        .eq("professional_id", user.id)
        .in("status", ["confirmed", "completion_requested", "completed"])
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (bookingsError) {
        setMessage(bookingsError.message);
        setLoading(false);
        return;
      }

      const rawBookings = (bookingsData as BookingRow[]) || [];
      const customerIds = [...new Set(rawBookings.map((booking) => booking.customer_id).filter(Boolean))];

      let customerMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();

      if (customerIds.length > 0) {
        const { data: customerProfiles, error: customerProfilesError } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", customerIds);

        if (customerProfilesError) {
          setMessage(customerProfilesError.message);
          setLoading(false);
          return;
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

      const enriched: CalendarBooking[] = rawBookings.map((booking) => {
        const customer = customerMap.get(booking.customer_id);
        return {
          ...booking,
          start_time: String(booking.start_time).slice(0, 5),
          end_time: String(booking.end_time).slice(0, 5),
          client_name: customer?.full_name ?? null,
          client_avatar_url: customer?.avatar_url ?? null,
        };
      });

      setBookings(enriched);
      setCached<CalendarCache>("calendar-page", { role: userRole ?? "", bookings: enriched, subscribed: subscribedNow });
      setLoading(false);
      hasLoadedOnceRef.current = true;
    },
    [router]
  );

  useEffect(() => {
    loadCalendarData({ silent: !!getCached<CalendarCache>("calendar-page") });
  }, [loadCalendarData]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // Distance is optional. Calendar still works without browser location.
      }
    );
  }, []);

  useEffect(() => {
    if (!role) return;

    const queueSilentReload = () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      reloadTimeoutRef.current = setTimeout(() => {
        loadCalendarData({ silent: hasLoadedOnceRef.current });
      }, 250);
    };

    const channel = supabase
      .channel("calendar-live")
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
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [role, loadCalendarData]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, CalendarBooking[]> = {};

    bookings.forEach((booking) => {
      if (!map[booking.booking_date]) map[booking.booking_date] = [];
      map[booking.booking_date].push(booking);
    });

    Object.keys(map).forEach((dateKey) => {
      map[dateKey].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    return map;
  }, [bookings]);

  const monthCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const startWeekday = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const cells: Array<{ key: string; date: Date | null; isCurrentMonth: boolean }> = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ key: `empty-start-${i}`, date: null, isCurrentMonth: false });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      cells.push({ key: getDateKey(date), date, isCurrentMonth: true });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ key: `empty-end-${cells.length}`, date: null, isCurrentMonth: false });
    }

    return cells;
  }, [currentMonth]);

  const mobileCalendarDays = useMemo(() => {
    return monthCells.filter((cell) => cell.date).map((cell) => cell.date as Date);
  }, [monthCells]);

  const selectedDateBookings = useMemo(() => bookingsByDate[selectedDate]?.slice() || [], [bookingsByDate, selectedDate]);

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return bookings
      .filter((booking) => {
        if (booking.status === "completed") return false;
        return getBookingDateTime(booking) >= now;
      })
      .sort((a, b) => getBookingDateTime(a).getTime() - getBookingDateTime(b).getTime());
  }, [bookings]);

  const completionRequestedBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.status === "completion_requested")
      .sort((a, b) => getBookingDateTime(a).getTime() - getBookingDateTime(b).getTime());
  }, [bookings]);

  const completedBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.status === "completed")
      .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime());
  }, [bookings]);

  const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const todayKey = getTodayKey();

  useEffect(() => {
    mobileDayRefs.current[selectedDate]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDate, currentMonth]);

  function goToPreviousMonth() {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(nextMonth);
    setSelectedDate(getDateKey(nextMonth));
  }

  function goToNextMonth() {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(nextMonth);
    setSelectedDate(getDateKey(nextMonth));
  }

  function goToToday() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), 1);
    setCurrentMonth(today);
    setSelectedDate(getTodayKey());
  }

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

  if (!subscribed) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-neutral-400" fill="none" aria-hidden="true">
              <path d="M7 4v3M17 4v3M4.5 9.5h15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Calendar
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            The schedule is a paid feature
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-neutral-500">
            Upgrade from Basic to Apprentice, Pro, or Master to set your weekly availability and manage bookings from a calendar.
          </p>
          <Link
            href="/subscription"
            className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            View plans
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">


        <div className="py-8 sm:py-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Calendar
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
                Your schedule.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 sm:mt-6 sm:text-lg sm:leading-8">
                View confirmed bookings, upcoming appointments, and completed work in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/requests"
                className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          {message ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          {bookingUsage && bookingUsage.cap !== null ? (
            <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-900">
                  {bookingUsage.count} of {bookingUsage.cap} requests used this month
                </p>
                {bookingUsage.count >= bookingUsage.cap ? (
                  <Link
                    href="/subscription"
                    className="rounded-full bg-black px-3.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  >
                    Upgrade for unlimited
                  </Link>
                ) : bookingUsage.count >= bookingUsage.cap - 3 ? (
                  <Link
                    href="/subscription"
                    className="text-xs font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                  >
                    Almost at your limit — upgrade plan
                  </Link>
                ) : null}
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    bookingUsage.count >= bookingUsage.cap ? "bg-red-500" : "bg-neutral-900"
                  }`}
                  style={{ width: `${Math.min((bookingUsage.count / bookingUsage.cap) * 100, 100)}%` }}
                />
              </div>
              {bookingUsage.count >= bookingUsage.cap ? (
                <p className="mt-2 text-xs text-red-600">
                  You've reached your monthly request limit. New requests can't be booked until next month or you upgrade. Direct calendar bookings are unaffected.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* MOBILE CALENDAR APP STYLE */}
          <div className="mt-8 block md:hidden">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                    Month
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatMonthYear(currentMonth)}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 text-lg font-medium transition active:scale-95"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="flex h-11 items-center justify-center rounded-full border border-neutral-200 px-4 text-sm font-semibold transition active:scale-95"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 text-lg font-medium transition active:scale-95"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="-mx-5 mt-6 overflow-hidden">
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5 pb-3 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {mobileCalendarDays.map((date) => {
                    const dateKey = getDateKey(date);
                    const dayBookings = bookingsByDate[dateKey] || [];
                    const isSelected = selectedDate === dateKey;
                    const isToday = todayKey === dateKey;

                    return (
                      <button
                        key={dateKey}
                        ref={(element) => {
                          mobileDayRefs.current[dateKey] = element;
                        }}
                        type="button"
                        onClick={() => setSelectedDate(dateKey)}
                        className="flex min-w-[58px] snap-center flex-col items-center gap-2 text-center transition active:scale-[0.97]"
                      >
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isSelected ? "text-neutral-900" : "text-neutral-500"
                          }`}
                        >
                          {date.toLocaleDateString("en-CA", { weekday: "short" })}
                        </span>

                        <span
                          className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-lg font-semibold transition ${
                            isSelected
                              ? "border-black bg-black text-white shadow-md"
                              : isToday
                              ? "border-neutral-900 bg-white text-neutral-900"
                              : "border-neutral-200 bg-neutral-50 text-neutral-700"
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        <span className="flex h-2 items-center justify-center">
                          {dayBookings.length > 0 ? (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isSelected ? "bg-black" : "bg-neutral-400"
                              }`}
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                    Selected day
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    {selectedDate === todayKey ? "Today" : formatDateLabel(selectedDate)}
                  </h2>
                  {selectedDate === todayKey ? (
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatDateLabel(selectedDate)}
                    </p>
                  ) : null}
                </div>

                <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700">
                  {selectedDateBookings.length}
                </span>
              </div>

              {selectedDateBookings.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                  No bookings for this day.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {selectedDateBookings.map((booking) => (
                    <div key={booking.id} className="grid grid-cols-[58px_1fr] gap-3">
                      <div className="pt-1 text-right">
                        <p className="text-sm font-semibold text-neutral-900">
                          {formatTime(booking.start_time)}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {formatTime(booking.end_time)}
                        </p>
                      </div>

                      <div className="relative border-l border-neutral-200 pl-4">
                        <span className="absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full bg-black" />
                        <BookingCard booking={booking} compact userLat={userLocation?.lat} userLng={userLocation?.lng} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Upcoming</h2>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                    {upcomingBookings.length}
                  </span>
                </div>

                {upcomingBookings.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                    No upcoming bookings.
                  </div>
                ) : (
                  <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {upcomingBookings.map((booking) => (
                      <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Awaiting confirmation</h2>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                    {completionRequestedBookings.length}
                  </span>
                </div>

                {completionRequestedBookings.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                    No bookings awaiting completion confirmation.
                  </div>
                ) : (
                  <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {completionRequestedBookings.map((booking) => (
                      <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Recently completed</h2>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                    {completedBookings.length}
                  </span>
                </div>

                {completedBookings.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                    No completed bookings yet.
                  </div>
                ) : (
                  <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {completedBookings.map((booking) => (
                      <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DESKTOP/TABLET CALENDAR */}
          <div className="mt-8 hidden gap-8 md:grid xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {formatMonthYear(currentMonth)}
                  </h2>
                  <p className="mt-2 text-sm text-neutral-500">Tap a day to view bookings.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-lg font-medium transition hover:bg-neutral-50"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold transition hover:bg-neutral-50"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-lg font-medium transition hover:bg-neutral-50"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-7 gap-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-3">
                {monthCells.map((cell) => {
                  if (!cell.date) {
                    return (
                      <div
                        key={cell.key}
                        className="min-h-[108px] rounded-2xl border border-transparent bg-transparent"
                      />
                    );
                  }

                  const dateKey = getDateKey(cell.date);
                  const dayBookings = bookingsByDate[dateKey] || [];
                  const isSelected = selectedDate === dateKey;
                  const isToday = todayKey === dateKey;
                  const confirmedCount = dayBookings.filter(
                    (booking) => booking.status === "confirmed"
                  ).length;
                  const completionRequestedCount = dayBookings.filter(
                    (booking) => booking.status === "completion_requested"
                  ).length;
                  const completedCount = dayBookings.filter(
                    (booking) => booking.status === "completed"
                  ).length;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      className={`min-h-[108px] rounded-2xl border p-3 text-left transition ${
                        isSelected
                          ? "border-black bg-black text-white"
                          : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isSelected
                              ? "text-white"
                              : isToday
                              ? "text-neutral-900"
                              : "text-neutral-800"
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>
                        {isToday ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isSelected ? "bg-white text-black" : "bg-neutral-900 text-white"
                            }`}
                          >
                            Today
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {confirmedCount > 0 ? (
                          <div
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                              isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"
                            }`}
                          >
                            {confirmedCount} upcoming
                          </div>
                        ) : null}
                        {completionRequestedCount > 0 ? (
                          <div
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                              isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"
                            }`}
                          >
                            {completionRequestedCount} awaiting
                          </div>
                        ) : null}
                        {completedCount > 0 ? (
                          <div
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                              isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"
                            }`}
                          >
                            {completedCount} completed
                          </div>
                        ) : null}
                        {dayBookings.length === 0 ? (
                          <div
                            className={`text-[11px] ${
                              isSelected ? "text-white/70" : "text-neutral-400"
                            }`}
                          >
                            No bookings
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex h-[58vh] min-h-[420px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex shrink-0 items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{selectedDateLabel}</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {selectedDateBookings.length} booking
                      {selectedDateBookings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                {selectedDateBookings.length === 0 ? (
                  <div className="mt-6 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-500">
                    No bookings for this day.
                  </div>
                ) : (
                  <div
                    className={`mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                      selectedDateBookings.length <= 2 ? "flex flex-col justify-center" : ""
                    }`}
                  >
                    {selectedDateBookings.map((booking) => (
                      <BookingCard booking={booking} key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-1">
                <div className="flex max-h-[420px] min-h-[140px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <div className="flex shrink-0 items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">Upcoming</h2>
                    {upcomingBookings.length > 0 ? (
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                        {upcomingBookings.length}
                      </span>
                    ) : null}
                  </div>
                  {upcomingBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                      No upcoming bookings.
                    </div>
                  ) : (
                    <div className="mt-5 min-h-0 space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {upcomingBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex max-h-[420px] min-h-[140px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <div className="flex shrink-0 items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">
                      Awaiting confirmation
                    </h2>
                    {completionRequestedBookings.length > 0 ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                        {completionRequestedBookings.length}
                      </span>
                    ) : null}
                  </div>
                  {completionRequestedBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                      No bookings awaiting completion confirmation.
                    </div>
                  ) : (
                    <div className="mt-5 min-h-0 space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {completionRequestedBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex max-h-[420px] min-h-[140px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                  <div className="flex shrink-0 items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">
                      Recently completed
                    </h2>
                    {completedBookings.length > 0 ? (
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                        {completedBookings.length}
                      </span>
                    ) : null}
                  </div>
                  {completedBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
                      No completed bookings yet.
                    </div>
                  ) : (
                    <div className="mt-5 min-h-0 space-y-3 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {completedBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
