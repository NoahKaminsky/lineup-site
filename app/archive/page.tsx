"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Archived services: every completed booking for the signed-in user (as the
// professional or the client). The dashboard and calendar only show the last
// 24 hours of completed work; this is where everything older lives. Reached
// from the account menu, not the main nav.

type ArchivedBooking = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  service_name: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_at: string;
};

type PersonLite = { id: string; full_name: string | null; avatar_url: string | null };

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${suffix}`;
}

function formatDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ArchivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ArchivedBooking[]>([]);
  const [people, setPeople] = useState<Record<string, PersonLite>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, professional_id, customer_id, booking_date, start_time, end_time, service_name, duration_minutes, completed_at, created_at"
        )
        .or(`professional_id.eq.${user.id},customer_id.eq.${user.id}`)
        .eq("status", "completed")
        .order("completed_at", { ascending: false, nullsFirst: false });

      if (cancelled) return;
      if (error) {
        setMessage("We couldn't load your archive. Please try again.");
        setLoading(false);
        return;
      }

      const rows = (data || []) as ArchivedBooking[];
      setBookings(rows);

      const otherIds = Array.from(
        new Set(rows.map((row) => (row.professional_id === user.id ? row.customer_id : row.professional_id)))
      ).filter(Boolean);

      if (otherIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", otherIds);
        if (!cancelled && profileRows) {
          setPeople(Object.fromEntries((profileRows as PersonLite[]).map((p) => [p.id, p])));
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = bookings.filter((booking) => {
      if (!query) return true;
      const other = people[booking.professional_id === userId ? booking.customer_id : booking.professional_id];
      return `${booking.service_name || ""} ${other?.full_name || ""}`.toLowerCase().includes(query);
    });

    const map = new Map<string, ArchivedBooking[]>();
    for (const booking of filtered) {
      const date = new Date(booking.completed_at || `${booking.booking_date}T00:00:00`);
      const label = date.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(booking);
    }
    return Array.from(map.entries());
  }, [bookings, people, search, userId]);

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl py-6 sm:py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Archive</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Archived services</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
          Every service you&apos;ve completed on LineUp. Recent work shows on your dashboard for 24 hours, then
          lands here.
        </p>

        {loading ? (
          <div className="mt-10 space-y-3" aria-busy="true">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-neutral-200" />
                  <div className="h-3 w-1/3 animate-pulse rounded-full bg-neutral-200/70" />
                </div>
              </div>
            ))}
          </div>
        ) : message ? (
          <div role="alert" className="mt-10 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        ) : bookings.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center">
            <p className="font-medium text-ink">Nothing archived yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-500">
              Completed services move here 24 hours after they&apos;re finished.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <label className="relative w-full sm:max-w-xs">
                <span className="sr-only">Search archived services</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search service or name"
                  className="h-11 w-full rounded-full border border-neutral-200 bg-surface px-4 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-ink"
                />
              </label>
              <p className="text-sm tabular-nums text-neutral-500">
                {bookings.length} completed {bookings.length === 1 ? "service" : "services"}
              </p>
            </div>

            {groups.length === 0 ? (
              <p className="mt-8 text-sm text-neutral-500">No archived services match “{search.trim()}”.</p>
            ) : (
              <div className="mt-8 space-y-10">
                {groups.map(([month, items]) => (
                  <section key={month} aria-label={month}>
                    <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">{month}</h2>
                    <ul className="lu-lineup mt-3 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
                      {items.map((booking) => {
                        const iAmPro = booking.professional_id === userId;
                        const other = people[iAmPro ? booking.customer_id : booking.professional_id];
                        return (
                          <li key={booking.id}>
                            <Link
                              href={`/bookings/${booking.id}`}
                              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50"
                            >
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                                {other?.avatar_url ? (
                                  <img loading="lazy" src={other.avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
                                    {other?.full_name?.charAt(0).toUpperCase() || "?"}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {booking.service_name || "Booked service"}
                                </p>
                                <p className="truncate text-xs text-neutral-500">
                                  {iAmPro ? "Client" : "With"} {other?.full_name || (iAmPro ? "client" : "professional")}
                                  {booking.duration_minutes ? ` · ${booking.duration_minutes} min` : ""}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-medium tabular-nums text-ink">{formatDay(booking.booking_date)}</p>
                                <p className="text-[11px] tabular-nums text-neutral-500">{formatTime(booking.start_time)}</p>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
