"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "@/app/components/AppNavbar";

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

type CalendarBooking = BookingRow & {
  client_name: string | null;
  client_avatar_url: string | null;
};

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

function BookingCard({ booking, compact = false }: { booking: CalendarBooking; compact?: boolean }) {
  return (
    <Link
      href={`/bookings/${booking.id}`}
      className={`block rounded-2xl border border-neutral-200 bg-neutral-50 transition hover:border-neutral-300 hover:bg-white ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {booking.status === "completion_requested" ? "Awaiting confirmation" : booking.status}
            </span>
          </div>

          <h3 className={`${compact ? "mt-3 text-base" : "mt-3 text-xl"} font-semibold text-neutral-900`}>
            <span className="mr-2">{isEveningBooking(booking) ? "☾" : "☼"}</span>
            {booking.service_name || "Booked service"}
          </h3>

          <p className="mt-2 text-sm text-neutral-600">
            {formatShortDateLabel(booking.booking_date)} • {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
          </p>

          <p className="mt-1 text-sm text-neutral-600">
            Client: {booking.client_name || "Not available"}
          </p>
        </div>

        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white sm:h-14 sm:w-14">
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
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Duration</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {booking.duration_minutes ? `${booking.duration_minutes} min` : "Not set"}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Created</p>
            <p className="mt-2 text-sm font-medium text-neutral-900">
              {new Date(booking.created_at).toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <span className="inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900">
          View booking
        </span>
      </div>
    </Link>
  );
}

export default function CalendarPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());

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
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const userRole = profile.role as string | null;
      setRole(userRole);

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
          "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at"
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
      setLoading(false);
      hasLoadedOnceRef.current = true;
    },
    [router]
  );

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

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
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-7xl">
          <Navbar />
          <div className="py-16">
            <p className="text-neutral-500">Loading calendar...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Navbar />

        <div className="py-10 sm:py-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Calendar</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">Your schedule.</h1>
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
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
          ) : null}

          <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{formatMonthYear(currentMonth)}</h2>
                  <p className="mt-2 text-sm text-neutral-500">Tap a day to view bookings.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={goToPreviousMonth} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">
                    Prev
                  </button>
                  <button type="button" onClick={goToToday} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">
                    Today
                  </button>
                  <button type="button" onClick={goToNextMonth} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">
                    Next
                  </button>
                </div>
              </div>

              <div className="-mx-4 mt-6 block overflow-hidden md:hidden">
                <div className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible scroll-smooth px-4 pb-4 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        className="flex min-w-[70px] snap-center flex-col items-center gap-2 rounded-3xl px-1 py-1 text-center transition active:scale-[0.97]"
                      >
                        <span
                          className={`relative flex h-16 w-16 items-center justify-center rounded-full border text-xl font-semibold transition-all ${
                            isSelected
                              ? "border-black bg-black text-white shadow-md ring-2 ring-black ring-offset-2"
                              : isToday
                              ? "border-neutral-900 bg-white text-neutral-900 shadow-sm"
                              : dayBookings.length > 0
                              ? "border-neutral-200 bg-white text-neutral-900 shadow-sm"
                              : "border-neutral-200 bg-neutral-100 text-neutral-400"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        <span className={`text-xs font-medium ${isSelected ? "text-neutral-900" : "text-neutral-500"}`}>
                          {date.toLocaleDateString("en-CA", { weekday: "short" })}
                        </span>
                        <span className="flex h-5 items-center justify-center gap-1">
                          {dayBookings.length > 0 ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                isSelected ? "bg-black text-white" : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {dayBookings.length} booked
                            </span>
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-neutral-200" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8 hidden grid-cols-7 gap-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-500 md:grid">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="mt-4 hidden grid-cols-7 gap-3 md:grid">
                {monthCells.map((cell) => {
                  if (!cell.date) {
                    return <div key={cell.key} className="min-h-[108px] rounded-2xl border border-transparent bg-transparent" />;
                  }

                  const dateKey = getDateKey(cell.date);
                  const dayBookings = bookingsByDate[dateKey] || [];
                  const isSelected = selectedDate === dateKey;
                  const isToday = todayKey === dateKey;
                  const confirmedCount = dayBookings.filter((booking) => booking.status === "confirmed").length;
                  const completionRequestedCount = dayBookings.filter((booking) => booking.status === "completion_requested").length;
                  const completedCount = dayBookings.filter((booking) => booking.status === "completed").length;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      className={`min-h-[108px] rounded-2xl border p-3 text-left transition ${
                        isSelected ? "border-black bg-black text-white" : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-sm font-semibold ${isSelected ? "text-white" : isToday ? "text-neutral-900" : "text-neutral-800"}`}>
                          {cell.date.getDate()}
                        </span>
                        {isToday ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isSelected ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
                            Today
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {confirmedCount > 0 ? (
                          <div className={`rounded-full px-2 py-1 text-[11px] font-medium ${isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"}`}>
                            {confirmedCount} upcoming
                          </div>
                        ) : null}
                        {completionRequestedCount > 0 ? (
                          <div className={`rounded-full px-2 py-1 text-[11px] font-medium ${isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"}`}>
                            {completionRequestedCount} awaiting
                          </div>
                        ) : null}
                        {completedCount > 0 ? (
                          <div className={`rounded-full px-2 py-1 text-[11px] font-medium ${isSelected ? "bg-white/15 text-white" : "bg-white text-neutral-700"}`}>
                            {completedCount} completed
                          </div>
                        ) : null}
                        {dayBookings.length === 0 ? (
                          <div className={`text-[11px] ${isSelected ? "text-white/70" : "text-neutral-400"}`}>No bookings</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex h-[54vh] min-h-[420px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 xl:h-[58vh]">
                <div className="shrink-0 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{selectedDateLabel}</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {selectedDateBookings.length} booking{selectedDateBookings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                {selectedDateBookings.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No bookings for this day.</div>
                ) : (
                  <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {selectedDateBookings.map((booking) => (
                      <BookingCard booking={booking} key={booking.id} />
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-1">
                <div className="flex h-[38vh] min-h-[320px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 xl:h-[38vh]">
                  <h2 className="shrink-0 text-xl font-semibold tracking-tight">Upcoming</h2>
                  {upcomingBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No upcoming bookings.</div>
                  ) : (
                    <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {upcomingBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex h-[38vh] min-h-[320px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 xl:h-[38vh]">
                  <h2 className="shrink-0 text-xl font-semibold tracking-tight">Awaiting confirmation</h2>
                  {completionRequestedBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No bookings awaiting completion confirmation.</div>
                  ) : (
                    <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {completionRequestedBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex h-[38vh] min-h-[320px] flex-col rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 xl:h-[38vh]">
                  <h2 className="shrink-0 text-xl font-semibold tracking-tight">Recently completed</h2>
                  {completedBookings.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No completed bookings yet.</div>
                  ) : (
                    <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {completedBookings.map((booking) => (
                        <BookingCard booking={booking} compact key={booking.id} />
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
