"use client";

import { deferRefresh } from "@/app/lib/deferRefresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VerificationBanner from "@/app/components/VerificationBanner";
import DayZoomArea from "@/app/components/DayZoom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { getCached, setCached } from "@/app/lib/pageCache";
import type { CalendarInitialData } from "./getInitialData";

import { ChevronLeft, ChevronRight, MapPin, Moon, Sun } from "lucide-react";
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
      className={`group block rounded-xl border border-hairline bg-surface transition-[border-color,box-shadow] duration-200 hover:border-neutral-300 hover:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.25)] ${
        compact ? "p-3.5" : "p-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100">
          {booking.client_avatar_url ? (
            <img loading="lazy" src={booking.client_avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
              {booking.client_name?.charAt(0).toUpperCase() || "C"}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={`flex min-w-0 items-center gap-1.5 ${compact ? "text-sm" : "text-[15px]"} font-semibold text-ink`}>
              {isEveningBooking(booking) ? (
                <Moon aria-label="Evening" className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
              ) : (
                <Sun aria-label="Daytime" className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
              )}
              <span className="truncate">{booking.service_name || "Booked service"}</span>
            </p>

            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                booking.status === "completion_requested"
                  ? "text-ink ring-1 ring-inset ring-ink"
                  : booking.status === "completed"
                  ? "bg-neutral-100 text-neutral-500"
                  : "bg-neutral-100 text-ink"
              }`}
            >
              {formatStatusLabel(booking.status)}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[13px] tabular-nums text-neutral-500">
            {booking.client_name || "Unknown client"} · {formatShortDateLabel(booking.booking_date)} · {formatTime(booking.start_time)}–{formatTime(booking.end_time)}
            {metaParts.length > 0 ? ` · ${metaParts.join(" · ")}` : ""}
          </p>

          {displayAddress ? (
            <p className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-neutral-500">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{displayAddress}</span>
              {distance ? <span className="shrink-0 text-neutral-400">· {distance}</span> : null}
            </p>
          ) : null}

          {mapsUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                window.open(mapsUrl, "_blank", "noopener,noreferrer");
              }}
              className="mt-2 rounded text-xs font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            >
              Open in Maps
            </button>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

type CalendarPageClientProps = {
  initialData: CalendarInitialData | null;
};

export default function CalendarPageClient({ initialData }: CalendarPageClientProps) {
  const router = useRouter();

  const seed: CalendarCache | null =
    getCached<CalendarCache>("calendar-page") ?? (initialData as unknown as CalendarCache | null);

  const [loading, setLoading] = useState(() => !seed);
  const [role, setRole] = useState<string | null>(() => seed?.role ?? null);
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState<CalendarBooking[]>(() => seed?.bookings ?? []);
  const [subscribed, setSubscribed] = useState(() => seed?.subscribed ?? false);
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

      const user = await getSignedInUser();

      if (!user) {
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
    return deferRefresh(!!seed, () => loadCalendarData({ silent: !!seed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Finished work leaves the calendar (it's under "Recently completed"
      // for a day, then in the archive); the grid is for what's ahead.
      if (booking.status === "completed") return;
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

  // The list only shows the last 24 hours; older work lives in /archive.
  // (Completed bookings are not shown on the month grid.)
  const recentCompletedBookings = useMemo(
    () =>
      completedBookings.filter(
        (booking) => Date.now() - new Date(booking.completed_at || booking.created_at).getTime() <= 24 * 60 * 60 * 1000
      ),
    [completedBookings]
  );

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
      <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8" aria-busy="true">
        <div className="mx-auto max-w-6xl py-6 sm:py-8">
          <div className="h-3 w-20 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-4 h-9 w-56 animate-pulse rounded-lg bg-neutral-200" />
          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            <div className="h-[460px] animate-pulse rounded-2xl bg-neutral-200/60 lg:col-span-8" />
            <div className="hidden space-y-3 lg:col-span-4 lg:block">
              <div className="h-6 w-40 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-24 animate-pulse rounded-xl bg-neutral-200/60" />
              <div className="h-24 animate-pulse rounded-xl bg-neutral-200/50" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!subscribed) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-neutral-400" fill="none" aria-hidden="true">
              <path d="M7 4v3M17 4v3M4.5 9.5h15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Calendar
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
            The schedule is a paid feature
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-neutral-500">
            Upgrade from Basic to Apprentice, Pro, or Master to set your weekly availability and manage bookings from a calendar.
          </p>
          <Link
            href="/subscription"
            className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            View plans
          </Link>
        </div>
      </main>
    );
  }

  const monthNav = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={goToPreviousMonth}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 ring-1 ring-inset ring-ink/10 transition-colors hover:bg-neutral-50 hover:text-ink"
        aria-label="Previous month"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={goToToday}
        className="h-9 rounded-full px-3.5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/10 transition-colors hover:bg-neutral-50"
      >
        Today
      </button>
      <button
        type="button"
        onClick={goToNextMonth}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 ring-1 ring-inset ring-ink/10 transition-colors hover:bg-neutral-50 hover:text-ink"
        aria-label="Next month"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );

  // What the hovered day zooms into: the full day, Apple-Calendar style.
  function renderDayLens(dateKey: string) {
    const dayBookings = bookingsByDate[dateKey] || [];
    const date = new Date(`${dateKey}T00:00:00`);
    return (
      <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.06),0_28px_64px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        <div className="flex items-end justify-between gap-3 border-b border-hairline px-4 pb-3 pt-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              {date.toLocaleDateString("en-CA", { weekday: "long" })}
              {dateKey === todayKey ? " · Today" : ""}
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-[-0.03em] text-ink">
              {date.getDate()}
              <span className="ml-1.5 text-base font-medium text-neutral-400">
                {date.toLocaleDateString("en-CA", { month: "short" })}
              </span>
            </p>
          </div>
          <span className="pb-1 text-sm tabular-nums text-neutral-500">
            {dayBookings.length} booking{dayBookings.length === 1 ? "" : "s"}
          </span>
        </div>

        {dayBookings.length === 0 ? (
          <p className="px-4 py-5 text-sm text-neutral-500">Nothing booked. A free day.</p>
        ) : (
          <ol className="lu-lineup max-h-[260px] divide-y divide-hairline overflow-y-auto overscroll-contain">
            {dayBookings.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="grid grid-cols-[46px_1fr] gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
                >
                  <span className="pt-0.5 text-right tabular-nums">
                    <span className="block text-[13px] font-semibold text-ink">{formatTime(booking.start_time)}</span>
                    <span className="block text-[11px] text-neutral-400">{formatTime(booking.end_time)}</span>
                  </span>
                  <span className="min-w-0 border-l-2 border-ink pl-3">
                    <span className="block truncate text-sm font-semibold text-ink">{booking.service_name || "Booked service"}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {booking.client_name || "Client"} · {formatStatusLabel(booking.status)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <div className="border-t border-hairline px-4 py-2.5">
          <button
            type="button"
            onClick={() => setSelectedDate(dateKey)}
            className="rounded text-xs font-medium text-ink underline decoration-ink/20 underline-offset-4 transition-colors hover:decoration-ink"
          >
            Open this day
          </button>
        </div>
      </div>
    );
  }

  // Day agenda as a timeline: time on the left, the booking on the rail.
  const dayAgenda =
    selectedDateBookings.length === 0 ? (
      <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
        Nothing booked{selectedDate === todayKey ? " today" : " this day"}.
      </p>
    ) : (
      <ol className="lu-lineup mt-4 space-y-3">
        {selectedDateBookings.map((booking) => (
          <li key={booking.id} className="grid grid-cols-[52px_1fr] gap-3">
            <div className="pt-3 text-right tabular-nums">
              <p className="text-[13px] font-semibold text-ink">{formatTime(booking.start_time)}</p>
              <p className="text-[11px] text-neutral-400">{formatTime(booking.end_time)}</p>
            </div>
            <div className="relative min-w-0 border-l border-hairline pl-3">
              <span aria-hidden="true" className="absolute -left-[4.5px] top-4 h-2 w-2 rounded-full bg-ink" />
              <BookingCard booking={booking} compact userLat={userLocation?.lat} userLng={userLocation?.lng} />
            </div>
          </li>
        ))}
      </ol>
    );

  const bookingLists = [
    { key: "upcoming", title: "Upcoming", items: upcomingBookings, empty: "No upcoming bookings." },
    { key: "awaiting", title: "Awaiting confirmation", items: completionRequestedBookings, empty: "Nothing waiting on a client." },
    { key: "completed", title: "Recently completed", items: recentCompletedBookings, empty: "Completed jobs show here for 24 hours, then move to your archive." },
  ];

  const listsSection = (
    <div className="space-y-8">
      {bookingLists.map((list) => (
        <section key={list.key} aria-labelledby={`list-${list.key}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`list-${list.key}`} className="text-base font-semibold tracking-[-0.01em]">
              {list.title}
            </h2>
            {list.items.length > 0 ? (
              <span className="text-sm tabular-nums text-neutral-500">{list.items.length}</span>
            ) : null}
          </div>
          {list.items.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">{list.empty}</p>
          ) : (
            <div className="lu-lineup mt-3 max-h-[420px] space-y-2.5 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {list.items.map((booking) => (
                <BookingCard booking={booking} compact key={booking.id} userLat={userLocation?.lat} userLng={userLocation?.lng} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl py-6 sm:py-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Calendar</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Your schedule</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
            Confirmed bookings, upcoming appointments, and completed work in one place.
          </p>
        </div>

        <VerificationBanner />

        {message ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {bookingUsage && bookingUsage.cap !== null ? (
          <div className="mt-6 rounded-2xl border border-hairline bg-surface px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium tabular-nums text-ink">
                {bookingUsage.count} of {bookingUsage.cap} requests used this month
              </p>
              {bookingUsage.count >= bookingUsage.cap ? (
                <Link
                  href="/subscription"
                  className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
                >
                  Upgrade for unlimited
                </Link>
              ) : bookingUsage.count >= bookingUsage.cap - 3 ? (
                <Link
                  href="/subscription"
                  className="rounded text-xs font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-4 hover:text-ink"
                >
                  Almost at your limit — upgrade plan
                </Link>
              ) : null}
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-premium ${
                  bookingUsage.count >= bookingUsage.cap ? "bg-red-500" : "bg-ink"
                }`}
                style={{ width: `${Math.min((bookingUsage.count / bookingUsage.cap) * 100, 100)}%` }}
              />
            </div>
            {bookingUsage.count >= bookingUsage.cap ? (
              <p className="mt-2 text-xs text-red-600">
                You&apos;ve reached your monthly request limit. New requests can&apos;t be booked until next month or you upgrade. Direct calendar bookings are unaffected.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── Phone: day strip + timeline + lists ───────────────────────── */}
        <div className="mt-8 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">{formatMonthYear(currentMonth)}</h2>
            {monthNav}
          </div>

          <div className="-mx-4 mt-4">
            <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-smooth px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    aria-pressed={isSelected}
                    aria-label={`${formatDateLabel(dateKey)}, ${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"}`}
                    onClick={() => setSelectedDate(dateKey)}
                    className={`flex w-12 shrink-0 snap-center flex-col items-center gap-1 rounded-2xl py-2 transition-colors duration-200 ${
                      isSelected ? "bg-ink text-white" : "text-ink active:bg-ink/[0.05]"
                    }`}
                  >
                    <span className={`text-[10px] font-medium uppercase tracking-[0.06em] ${isSelected ? "text-white/70" : "text-neutral-500"}`}>
                      {date.toLocaleDateString("en-CA", { weekday: "narrow" })}
                    </span>
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${
                        !isSelected && isToday ? "ring-1 ring-ink" : ""
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${
                        dayBookings.length > 0 ? (isSelected ? "bg-white" : "bg-ink") : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <section aria-labelledby="day-heading-mobile" className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="day-heading-mobile" className="text-base font-semibold tracking-[-0.01em]">
                {selectedDate === todayKey ? "Today" : formatDateLabel(selectedDate)}
              </h2>
              <span className="text-sm tabular-nums text-neutral-500">
                {selectedDateBookings.length} booking{selectedDateBookings.length === 1 ? "" : "s"}
              </span>
            </div>
            <div key={selectedDate} className="lu-fade-in">{dayAgenda}</div>
          </section>

          <div className="mt-10 border-t border-hairline pt-8">{listsSection}</div>
        </div>

        {/* ── Tablet / desktop: month grid + agenda column ──────────────── */}
        <div className="mt-8 hidden gap-8 md:grid lg:grid-cols-12">
          <section aria-labelledby="month-heading" className="lg:col-span-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="month-heading" className="text-xl font-semibold tracking-[-0.02em]">
                {formatMonthYear(currentMonth)}
              </h2>
              {monthNav}
            </div>

            <DayZoomArea renderLens={renderDayLens} lensWidth={320} className="mt-4">
              <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_28px_56px_-36px_rgba(0,0,0,0.3)]">
                <div className="grid grid-cols-7 border-b border-hairline bg-paper/50">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                      {day}
                    </div>
                  ))}
                </div>

                <div key={formatMonthYear(currentMonth)} className="lu-fade-in grid grid-cols-7 gap-px bg-hairline">
                  {monthCells.map((cell, index) => {
                    const isWeekend = index % 7 === 0 || index % 7 === 6;
                    if (!cell.date) {
                      return <div key={cell.key} className="min-h-[118px] bg-paper/70" />;
                    }

                    const dateKey = getDateKey(cell.date);
                    const dayBookings = bookingsByDate[dateKey] || [];
                    const isSelected = selectedDate === dateKey;
                    const isToday = todayKey === dateKey;
                    const isPast = dateKey < todayKey;

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        data-zoom-key={dateKey}
                        aria-pressed={isSelected}
                        aria-label={`${formatDateLabel(dateKey)}, ${dayBookings.length} booking${dayBookings.length === 1 ? "" : "s"}`}
                        onClick={() => setSelectedDate(dateKey)}
                        className={`relative flex min-h-[118px] flex-col items-stretch gap-1 p-2 text-left transition-colors duration-150 hover:bg-neutral-50 ${
                          isWeekend ? "bg-paper/40" : "bg-surface"
                        } ${isSelected ? "z-10 shadow-[inset_0_0_0_2px_#0a0a0a]" : ""}`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center self-start rounded-full text-sm tabular-nums ${
                            isToday
                              ? "bg-ink font-semibold text-white"
                              : isPast
                              ? "font-medium text-neutral-400"
                              : "font-medium text-ink"
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>

                        {/* Preview of the day's bookings, right in the month view. */}
                        {dayBookings.slice(0, 2).map((booking) => (
                          <span
                            key={booking.id}
                            className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11px] leading-tight ${
                              booking.status === "completed"
                                ? "bg-neutral-100/70 text-neutral-400"
                                : booking.status === "completion_requested"
                                ? "bg-surface text-ink ring-1 ring-inset ring-ink/25"
                                : "bg-neutral-100 text-ink"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-3 w-[3px] shrink-0 rounded-full ${booking.status === "completed" ? "bg-neutral-300" : "bg-ink"}`}
                            />
                            <span className="shrink-0 tabular-nums text-neutral-500">{formatTime(booking.start_time)}</span>
                            <span className="truncate font-medium">{booking.service_name || "Booking"}</span>
                          </span>
                        ))}
                        {dayBookings.length > 2 ? (
                          <span className="px-1.5 text-[11px] font-medium text-neutral-500">+{dayBookings.length - 2} more</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </DayZoomArea>
          </section>

          <aside className="space-y-10 lg:col-span-4">
            <section aria-labelledby="day-heading">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="day-heading" className="text-base font-semibold tracking-[-0.01em]">
                  {selectedDate === todayKey ? `Today · ${selectedDateLabel}` : selectedDateLabel}
                </h2>
                <span className="shrink-0 text-sm tabular-nums text-neutral-500">
                  {selectedDateBookings.length}
                </span>
              </div>
              <div key={selectedDate} className="lu-fade-in">{dayAgenda}</div>
            </section>

            <div className="border-t border-hairline pt-8">{listsSection}</div>
          </aside>
        </div>
      </div>
    </main>
  );
}
