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

type RequestRow = {
  id: string;
  client_id: string;
  title: string;
  service_detail: string | null;
  status: "accepted" | "completion_requested" | "completed" | string;
  accepted_professional_id: string | null;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  created_at: string;
};

type ClientProfile = {
  full_name: string | null;
  avatar_url: string | null;
};

type CalendarItem = {
  id: string;
  source: "booking" | "request";
  href: string;
  client_id: string;
  client_name: string | null;
  client_avatar_url: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus | "accepted";
  title: string;
  subtitle: string | null;
  created_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
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
  return date.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
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
  const [hourString, minute = "00"] = String(time).slice(0, 5).split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTodayKey() {
  return getDateKey(new Date());
}

function timeToMinutes(time: string) {
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function isEvening(time: string) {
  return timeToMinutes(time) >= 16 * 60;
}

function getTimeSymbol(time: string) {
  return isEvening(time) ? "☾" : "☀";
}

function getItemStart(item: Pick<CalendarItem, "date" | "start_time">) {
  return new Date(`${item.date}T${String(item.start_time).slice(0, 5)}:00`);
}

function getItemEnd(item: Pick<CalendarItem, "date" | "end_time">) {
  return new Date(`${item.date}T${String(item.end_time).slice(0, 5)}:00`);
}

function getStatusLabel(status: CalendarItem["status"]) {
  if (status === "completion_requested") return "Awaiting customer";
  if (status === "confirmed") return "Confirmed";
  if (status === "completed") return "Completed";
  if (status === "accepted") return "Accepted request";
  return "Scheduled";
}

function ScheduleCard({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const isAwaiting = item.status === "completion_requested";
  const isCompleted = item.status === "completed";

  return (
    <Link
      href={item.href}
      className="block rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-white hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide ${
                isAwaiting
                  ? "bg-amber-50 text-amber-700"
                  : isCompleted
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-white text-neutral-700"
              }`}
            >
              {item.source === "request" ? "Request" : "Booking"}
            </span>
            <span className="text-xs text-neutral-500">{getStatusLabel(item.status)}</span>
          </div>

          <h3 className={`${compact ? "mt-2 text-base" : "mt-3 text-xl"} truncate font-semibold text-neutral-900`}>
            <span className="mr-1 text-neutral-500">{getTimeSymbol(item.start_time)}</span>
            {item.title}
          </h3>

          <p className="mt-2 text-sm text-neutral-600">
            {formatShortDateLabel(item.date)} • {formatTime(item.start_time)} - {formatTime(item.end_time)}
          </p>

          <p className="mt-1 text-sm text-neutral-600">Client: {item.client_name || "Not available"}</p>

          {!compact ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Type</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{item.source === "request" ? "Accepted request" : "Direct booking"}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Duration</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{item.duration_minutes ? `${item.duration_minutes} min` : "Not set"}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {item.client_avatar_url ? (
            <img src={item.client_avatar_url} alt={item.client_name || "Client"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
              {item.client_name?.charAt(0).toUpperCase() || "C"}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());

  const hasLoadedOnceRef = useRef(false);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadCalendarData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      setMessage("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
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

      const [bookingsResult, requestsResult] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at")
          .eq("professional_id", user.id)
          .in("status", ["confirmed", "completion_requested", "completed"])
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("service_requests")
          .select("id, client_id, title, service_detail, status, accepted_professional_id, scheduled_date, scheduled_start_time, scheduled_end_time, created_at")
          .eq("accepted_professional_id", user.id)
          .in("status", ["accepted", "completion_requested", "completed"])
          .not("scheduled_date", "is", null)
          .not("scheduled_start_time", "is", null)
          .not("scheduled_end_time", "is", null)
          .order("scheduled_date", { ascending: true })
          .order("scheduled_start_time", { ascending: true }),
      ]);

      if (bookingsResult.error) {
        setMessage(bookingsResult.error.message);
        setLoading(false);
        return;
      }

      if (requestsResult.error) {
        setMessage(requestsResult.error.message);
        setLoading(false);
        return;
      }

      const rawBookings = (bookingsResult.data as BookingRow[]) || [];
      const rawRequests = (requestsResult.data as RequestRow[]) || [];
      const clientIds = [
        ...new Set([
          ...rawBookings.map((booking) => booking.customer_id),
          ...rawRequests.map((request) => request.client_id),
        ].filter(Boolean)),
      ];

      let clientMap = new Map<string, ClientProfile>();

      if (clientIds.length > 0) {
        const { data: clientProfiles, error: clientProfilesError } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", clientIds);

        if (clientProfilesError) {
          setMessage(clientProfilesError.message);
          setLoading(false);
          return;
        }

        clientMap = new Map(
          (clientProfiles || []).map((client) => [
            client.id,
            { full_name: client.full_name ?? null, avatar_url: client.avatar_url ?? null },
          ])
        );
      }

      const bookingItems: CalendarItem[] = rawBookings.map((booking) => {
        const client = clientMap.get(booking.customer_id);
        return {
          id: booking.id,
          source: "booking",
          href: `/bookings/${booking.id}`,
          client_id: booking.customer_id,
          client_name: client?.full_name ?? null,
          client_avatar_url: client?.avatar_url ?? null,
          date: booking.booking_date,
          start_time: String(booking.start_time).slice(0, 5),
          end_time: String(booking.end_time).slice(0, 5),
          status: booking.status,
          title: booking.service_name || "Booked service",
          subtitle: null,
          created_at: booking.created_at,
          completed_at: booking.completed_at ?? null,
          duration_minutes: booking.duration_minutes,
        };
      });

      const requestItems: CalendarItem[] = rawRequests.map((request) => {
        const client = clientMap.get(request.client_id);
        return {
          id: request.id,
          source: "request",
          href: `/requests/${request.id}`,
          client_id: request.client_id,
          client_name: client?.full_name ?? null,
          client_avatar_url: client?.avatar_url ?? null,
          date: request.scheduled_date || "",
          start_time: String(request.scheduled_start_time || "00:00").slice(0, 5),
          end_time: String(request.scheduled_end_time || request.scheduled_start_time || "00:00").slice(0, 5),
          status: request.status === "accepted" ? "accepted" : (request.status as BookingStatus),
          title: request.title || request.service_detail || "Accepted request",
          subtitle: request.service_detail,
          created_at: request.created_at,
          completed_at: null,
          duration_minutes: null,
        };
      });

      setItems(
        [...bookingItems, ...requestItems]
          .filter((item) => item.date && item.start_time && item.end_time)
          .sort((a, b) => getItemStart(a).getTime() - getItemStart(b).getTime())
      );

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
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, queueSilentReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, queueSilentReload)
      .subscribe();

    return () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [role, loadCalendarData]);

  const activeItems = useMemo(() => {
    return items.filter((item) => item.status === "confirmed" || item.status === "accepted" || item.status === "completion_requested");
  }, [items]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    activeItems.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    Object.keys(map).forEach((dateKey) => map[dateKey].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return map;
  }, [activeItems]);

  const monthCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const startWeekday = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();
    const cells: Array<{ key: string; date: Date | null; isCurrentMonth: boolean }> = [];

    for (let i = 0; i < startWeekday; i += 1) cells.push({ key: `empty-start-${i}`, date: null, isCurrentMonth: false });
    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      cells.push({ key: getDateKey(date), date, isCurrentMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `empty-end-${cells.length}`, date: null, isCurrentMonth: false });
    return cells;
  }, [currentMonth]);

  const selectedDateItems = useMemo(() => itemsByDate[selectedDate]?.slice() || [], [itemsByDate, selectedDate]);

  const upcomingItems = useMemo(() => {
    const now = new Date();
    return activeItems
      .filter((item) => getItemEnd(item) >= now)
      .sort((a, b) => getItemStart(a).getTime() - getItemStart(b).getTime())
      .slice(0, 6);
  }, [activeItems]);

  const pastNeedsActionItems = useMemo(() => {
    const now = new Date();
    return activeItems
      .filter((item) => getItemEnd(item) < now)
      .sort((a, b) => getItemEnd(b).getTime() - getItemEnd(a).getTime())
      .slice(0, 6);
  }, [activeItems]);

  const completedItems = useMemo(() => {
    return items
      .filter((item) => item.status === "completed")
      .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())
      .slice(0, 6);
  }, [items]);

  const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const todayKey = getTodayKey();

  function goToPreviousMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  }

  function goToToday() {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(getTodayKey());
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <Navbar />
          <div className="py-16"><p className="text-neutral-500">Loading calendar...</p></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Navbar />
        <div className="py-10 sm:py-16">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Calendar</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">Your schedule.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
                A clean snapshot of bookings and accepted requests. Click any day to expand the real schedule.
              </p>
            </div>
            <Link href="/requests" className="inline-flex w-fit rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">Back to dashboard</Link>
          </div>

          {message ? <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div> : null}

          <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold tracking-tight">{formatMonthYear(currentMonth)}</h2>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  <button type="button" onClick={goToPreviousMonth} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">Prev</button>
                  <button type="button" onClick={goToToday} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">Today</button>
                  <button type="button" onClick={goToNextMonth} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">Next</button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-200 text-center text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                <div className="bg-white py-2">Sun</div><div className="bg-white py-2">Mon</div><div className="bg-white py-2">Tue</div><div className="bg-white py-2">Wed</div><div className="bg-white py-2">Thu</div><div className="bg-white py-2">Fri</div><div className="bg-white py-2">Sat</div>
                {monthCells.map((cell) => {
                  if (!cell.date) return <div key={cell.key} className="min-h-[74px] bg-neutral-50 sm:min-h-[132px]" />;

                  const dateKey = getDateKey(cell.date);
                  const dayItems = itemsByDate[dateKey] || [];
                  const isSelected = selectedDate === dateKey;
                  const isToday = todayKey === dateKey;
                  const visibleItems = dayItems.slice(0, 2);

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(dateKey)}
                      className={`min-h-[74px] bg-white p-2 text-left transition hover:bg-neutral-50 sm:min-h-[132px] sm:p-3 ${isSelected ? "ring-2 ring-inset ring-black" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-black text-white" : "text-neutral-900"}`}>{cell.date.getDate()}</span>
                        {dayItems.length > 0 ? (
                          <span className="hidden rounded-full bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white sm:inline-flex">
                            {dayItems.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5 sm:hidden">
                        {dayItems.slice(0, 4).map((item) => (
                          <span key={`${item.source}-${item.id}`} className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${isEvening(item.start_time) ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"}`}>
                            {getTimeSymbol(item.start_time)}
                          </span>
                        ))}
                        {dayItems.length > 4 ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-100 px-1 text-[10px] font-medium text-neutral-700">+{dayItems.length - 4}</span> : null}
                      </div>

                      <div className="mt-3 hidden space-y-1.5 sm:block">
                        {visibleItems.map((item) => (
                          <div key={`${item.source}-${item.id}`} className="truncate rounded-xl bg-neutral-100 px-2 py-1.5 text-[11px] font-medium text-neutral-800">
                            <span className="mr-1 text-neutral-500">{getTimeSymbol(item.start_time)}</span>{formatTime(item.start_time)} · {item.source === "request" ? "Request" : item.title}
                          </div>
                        ))}
                        {dayItems.length > 2 ? <div className="px-2 text-[11px] font-medium text-neutral-500">+{dayItems.length - 2} more</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="space-y-8">
              <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{selectedDateLabel}</h2>
                    <p className="mt-2 text-sm text-neutral-500">Expanded schedule for the selected day.</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">{selectedDateItems.length}</span>
                </div>
                {selectedDateItems.length === 0 ? <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No bookings for this day.</div> : <div className="mt-6 space-y-4">{selectedDateItems.map((item) => <ScheduleCard key={`${item.source}-${item.id}`} item={item} />)}</div>}
              </section>

              <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-2xl font-semibold tracking-tight">Snapshot</h2>
                {upcomingItems.length === 0 ? <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No upcoming work.</div> : <div className="mt-6 space-y-4">{upcomingItems.map((item) => <ScheduleCard key={`${item.source}-${item.id}`} item={item} compact />)}</div>}
              </section>

              {pastNeedsActionItems.length > 0 ? (
                <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
                  <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Needs update</h2>
                  <p className="mt-2 text-sm text-neutral-700">These scheduled times have passed. Open them to request completion or cancel.</p>
                  <div className="mt-6 space-y-4">{pastNeedsActionItems.map((item) => <ScheduleCard key={`${item.source}-${item.id}`} item={item} compact />)}</div>
                </section>
              ) : null}

              <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-2xl font-semibold tracking-tight">Recently completed</h2>
                {completedItems.length === 0 ? <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">No completed work yet.</div> : <div className="mt-6 space-y-4">{completedItems.map((item) => <ScheduleCard key={`${item.source}-${item.id}`} item={item} compact />)}</div>}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
