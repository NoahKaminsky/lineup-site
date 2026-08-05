"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";

type Profile = {
  id: string;
  role: string | null;
  full_name: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
};

type CompletedBooking = {
  id: string;
  booking_date: string;
  service_name: string | null;
  customer_id: string;
  completed_at: string | null;
  created_at: string;
};

type OfferRow = {
  id: string;
  status: string;
  created_at: string;
};

type ReviewRow = {
  id: string;
  rating: number;
  created_at: string;
};

function isSubscribed(status: string | null) {
  return status === "active" || status === "trialing";
}

function isFull(plan: string | null) {
  return plan === "pro" || plan === "master";
}

function getWeekKey(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayStr: string) {
  const d = new Date(mondayStr + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const d = new Date(monthKey + "-01T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short" });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-neutral-900 bg-black text-white"
          : "border-neutral-200 bg-white"
      }`}
    >
      <p
        className={`text-xs font-medium uppercase tracking-wide ${
          accent ? "text-white/50" : "text-neutral-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          accent ? "text-white" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p
          className={`mt-1 text-sm ${
            accent ? "text-white/50" : "text-neutral-500"
          }`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function BarChart({
  data,
  barW = 28,
  gap = 10,
  chartH = 80,
}: {
  data: { label: string; value: number; highlight?: boolean }[];
  barW?: number;
  gap?: number;
  chartH?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const totalW = data.length * (barW + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${chartH + 28}`}
        width={totalW}
        height={chartH + 28}
        className="block"
      >
        {data.map((d, i) => {
          const x = i * (barW + gap);
          const barH = max === 0 ? 0 : Math.max((d.value / max) * chartH, d.value > 0 ? 4 : 0);
          const y = chartH - barH;
          const filled = d.value > 0;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={6}
                className={
                  d.highlight
                    ? "fill-neutral-900"
                    : filled
                    ? "fill-neutral-300"
                    : "fill-neutral-100"
                }
              />
              {filled ? (
                <text
                  x={x + barW / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="fill-neutral-500"
                  style={{ fontSize: 9, fontWeight: 600 }}
                >
                  {d.value}
                </text>
              ) : null}
              <text
                x={x + barW / 2}
                y={chartH + 16}
                textAnchor="middle"
                className={d.highlight ? "fill-neutral-900" : "fill-neutral-400"}
                style={{ fontSize: 9, fontWeight: d.highlight ? 700 : 400 }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type AnalyticsCache = {
  profile: Profile;
  bookings: CompletedBooking[];
  offers: OfferRow[];
  reviews: ReviewRow[];
};

export default function AnalyticsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(() => getCached<AnalyticsCache>("analytics-page")?.profile ?? null);
  const [bookings, setBookings] = useState<CompletedBooking[]>(() => getCached<AnalyticsCache>("analytics-page")?.bookings ?? []);
  const [offers, setOffers] = useState<OfferRow[]>(() => getCached<AnalyticsCache>("analytics-page")?.offers ?? []);
  const [reviews, setReviews] = useState<ReviewRow[]>(() => getCached<AnalyticsCache>("analytics-page")?.reviews ?? []);
  const [loading, setLoading] = useState(() => !getCached<AnalyticsCache>("analytics-page"));

  useEffect(() => {
    async function load() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, role, full_name, subscription_status, subscription_plan")
        .eq("id", user.id)
        .single();

      if (!profileData) {
        router.push("/account");
        return;
      }

      const normalized = String(profileData.role || "").toLowerCase();
      const isPro = !!normalized && !normalized.includes("customer");

      if (!isPro) {
        router.push("/requests");
        return;
      }

      setProfile(profileData as Profile);

      if (!isSubscribed(profileData.subscription_status)) {
        setBookings([]);
        setOffers([]);
        setReviews([]);
        setCached<AnalyticsCache>("analytics-page", {
          profile: profileData as Profile,
          bookings: [],
          offers: [],
          reviews: [],
        });
        setLoading(false);
        return;
      }

      const [bookingsRes, offersRes, reviewsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, booking_date, service_name, customer_id, completed_at, created_at")
          .eq("professional_id", user.id)
          .eq("status", "completed"),

        supabase
          .from("request_offers")
          .select("id, status, created_at")
          .eq("professional_id", user.id),

        supabase
          .from("professional_reviews")
          .select("id, rating, created_at")
          .eq("professional_id", user.id),
      ]);

      const resolvedBookings = (bookingsRes.data || []) as CompletedBooking[];
      const resolvedOffers = (offersRes.data || []) as OfferRow[];
      const resolvedReviews = (reviewsRes.data || []) as ReviewRow[];

      setBookings(resolvedBookings);
      setOffers(resolvedOffers);
      setReviews(resolvedReviews);
      setCached<AnalyticsCache>("analytics-page", {
        profile: profileData as Profile,
        bookings: resolvedBookings,
        offers: resolvedOffers,
        reviews: resolvedReviews,
      });
      setLoading(false);
    }

    load();
  }, [router]);

  const now = new Date();
  const thisMonthKey = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = lastMonthDate.toISOString().slice(0, 7);

  const totalCompleted = bookings.length;
  const thisMonthCount = bookings.filter(
    (b) => getMonthKey(b.completed_at || b.booking_date) === thisMonthKey
  ).length;
  const lastMonthCount = bookings.filter(
    (b) => getMonthKey(b.completed_at || b.booking_date) === lastMonthKey
  ).length;

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const acceptedOffers = offers.filter((o) => o.status === "accepted").length;
  const acceptanceRate =
    offers.length > 0
      ? Math.round((acceptedOffers / offers.length) * 100)
      : null;

  const uniqueClients = new Set(bookings.map((b) => b.customer_id));
  const repeatClients = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      counts[b.customer_id] = (counts[b.customer_id] || 0) + 1;
    });
    return Object.values(counts).filter((c) => c > 1).length;
  }, [bookings]);

  const topServices = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      const name = b.service_name || "Unnamed service";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [bookings]);

  const weeklyData = useMemo(() => {
    const weeks: { monday: string; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const monday = getWeekKey(d.toISOString());
      weeks.push({ monday, label: formatWeekLabel(monday) });
    }

    const countsByWeek: Record<string, number> = {};
    bookings.forEach((b) => {
      const wk = getWeekKey(b.completed_at || b.booking_date);
      countsByWeek[wk] = (countsByWeek[wk] || 0) + 1;
    });

    return weeks.map((w) => ({
      label: w.label,
      value: countsByWeek[w.monday] || 0,
    }));
  }, [bookings]);

  const monthlyData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({ key, label: formatMonthLabel(key) });
    }

    const countsByMonth: Record<string, number> = {};
    bookings.forEach((b) => {
      const mk = getMonthKey(b.completed_at || b.booking_date);
      countsByMonth[mk] = (countsByMonth[mk] || 0) + 1;
    });

    return months.map((m) => ({
      label: m.label,
      value: countsByMonth[m.key] || 0,
      highlight: m.key === thisMonthKey,
    }));
  }, [bookings, thisMonthKey]);

  const busiestDaysData = useMemo(() => {
    const countsByDay: number[] = [0, 0, 0, 0, 0, 0, 0];
    bookings.forEach((b) => {
      const d = new Date(b.booking_date);
      countsByDay[d.getDay()]++;
    });
    const maxDay = countsByDay.indexOf(Math.max(...countsByDay));
    return DAY_NAMES.map((name, i) => ({
      label: name,
      value: countsByDay[i],
      highlight: i === maxDay && countsByDay[i] > 0,
    }));
  }, [bookings]);

  const monthOverMonthChange =
    lastMonthCount === 0
      ? thisMonthCount > 0
        ? null
        : null
      : Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6">
        <div className="mx-auto max-w-4xl py-12">
          <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-4 h-12 w-64 animate-pulse rounded-2xl bg-neutral-200" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const subscribed = isSubscribed(profile?.subscription_status ?? null);
  const fullSuite = isFull(profile?.subscription_plan ?? null);

  if (!subscribed) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6">
        <div className="mx-auto max-w-4xl py-16">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Analytics
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Performance insights
          </h1>

          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-neutral-400" fill="none">
                <path d="M4 20V14M8 20V10M12 20V6M16 20V12M20 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">
              Unlock analytics
            </h2>
            <p className="mt-2 max-w-sm mx-auto text-sm leading-6 text-neutral-500">
              Analytics are available on all LineUp subscription plans — track your jobs, ratings, acceptance rate, and more.
            </p>
            <Link
              href="/subscription"
              className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              View plans
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6">
      <div className="mx-auto max-w-4xl py-10">

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Analytics
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Performance
            </h1>
          </div>

          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
            fullSuite
              ? "bg-black text-white"
              : "border border-neutral-200 bg-neutral-100 text-neutral-700"
          }`}>
            {fullSuite ? (profile?.subscription_plan === "master" ? "Master suite" : "Pro suite") : "Apprentice"}
          </span>
        </div>

        {/* Core stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Completed jobs"
            value={totalCompleted}
            sub="All time"
            accent
          />
          <StatCard
            label="This month"
            value={thisMonthCount}
            sub={
              monthOverMonthChange !== null
                ? `${monthOverMonthChange >= 0 ? "+" : ""}${monthOverMonthChange}% vs last month`
                : lastMonthCount > 0
                ? `${lastMonthCount} last month`
                : undefined
            }
          />
          <StatCard
            label="Avg rating"
            value={avgRating ? `★ ${avgRating}` : "—"}
            sub={reviews.length > 0 ? `${reviews.length} review${reviews.length === 1 ? "" : "s"}` : "No reviews yet"}
          />
          <StatCard
            label="Total clients"
            value={uniqueClients.size}
            sub={uniqueClients.size > 0 ? `${bookings.length} total booking${bookings.length === 1 ? "" : "s"}` : undefined}
          />
        </div>

        {/* Full suite only */}
        {fullSuite ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Offer acceptance"
                value={acceptanceRate !== null ? `${acceptanceRate}%` : "—"}
                sub={offers.length > 0 ? `${acceptedOffers} of ${offers.length} offers` : "No offers yet"}
              />
              <StatCard
                label="Repeat clients"
                value={repeatClients}
                sub={uniqueClients.size > 0 ? `of ${uniqueClients.size} total` : undefined}
              />
              <StatCard
                label="Last month"
                value={lastMonthCount}
                sub="Completed jobs"
              />
            </div>

            {/* Monthly trend */}
            <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Trend
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Jobs by month
                  </h2>
                </div>
                <span className="text-sm text-neutral-400">Last 6 months</span>
              </div>

              <div className="mt-6">
                {bookings.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 py-10 text-center text-sm text-neutral-400">
                    No completed jobs yet
                  </div>
                ) : (
                  <BarChart data={monthlyData} barW={38} gap={14} chartH={90} />
                )}
              </div>
            </div>

            {/* Busiest days + Weekly breakdown side by side */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Schedule
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Busiest days
                  </h2>
                </div>

                <div className="mt-6">
                  {bookings.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 py-8 text-center text-sm text-neutral-400">
                      No data yet
                    </div>
                  ) : (
                    <BarChart data={busiestDaysData} barW={30} gap={8} chartH={80} />
                  )}
                </div>

                {bookings.length > 0 ? (
                  <p className="mt-3 text-xs text-neutral-400">
                    Based on all completed bookings
                  </p>
                ) : null}
              </div>

              <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Activity
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Jobs by week
                  </h2>
                </div>

                <div className="mt-6">
                  {bookings.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 py-8 text-center text-sm text-neutral-400">
                      No data yet
                    </div>
                  ) : (
                    <BarChart data={weeklyData} barW={22} gap={7} chartH={80} />
                  )}
                </div>

                {bookings.length > 0 ? (
                  <p className="mt-3 text-xs text-neutral-400">
                    Last 8 weeks
                  </p>
                ) : null}
              </div>
            </div>

            {/* Top services */}
            {topServices.length > 0 ? (
              <div className="mt-6 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Services
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  Most booked
                </h2>

                <div className="mt-5 space-y-3">
                  {topServices.map(([name, count], i) => {
                    const pct = Math.round((count / totalCompleted) * 100);
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-neutral-900">{name}</span>
                          <span className="text-neutral-500">
                            {count} job{count === 1 ? "" : "s"} · {pct}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full ${i === 0 ? "bg-neutral-900" : "bg-neutral-300"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          /* Apprentice tier — upsell to full suite (Pro/Master) */
          <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8">
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              Full analytics suite
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Unlock deeper insights
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Upgrade to Pro or Master to access your weekly activity chart, offer acceptance rate, repeat client count, and top services breakdown.
            </p>
            <Link
              href="/subscription"
              className="mt-5 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Upgrade plan
            </Link>
          </div>
        )}

        {/* Empty state when subscribed but no data */}
        {subscribed && totalCompleted === 0 && reviews.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
            Complete your first booking to start seeing data here.
          </div>
        ) : null}
      </div>
    </main>
  );
}
