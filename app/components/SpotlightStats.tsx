"use client";

// What the Spotlight actually did for this pro: views and taps on their
// Spotlight card in Explore, this week and this month.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Stats = { ready: boolean; week: { views: number; taps: number }; month: { views: number; taps: number } };

export default function SpotlightStats({ inRotation, share }: { inRotation: boolean; share: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/spotlight", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok || cancelled) return;
      setStats(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative mt-10 overflow-hidden rounded-[28px] bg-[#09090a] p-6 text-white sm:p-8">
      {/* The same white beam as the Spotlight on Explore, aimed at the numbers. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background:
            "conic-gradient(from 180deg at 78% -20%, transparent 0deg, transparent 166deg, rgba(255,255,255,0.16) 180deg, transparent 194deg, transparent 360deg)",
          filter: "blur(6px)",
        }}
      />
      <div className="relative">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Your Spotlight</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-white/60">
          {inRotation
            ? `The big card at the top of Explore. You're in the rotation with ${share}.`
            : "The big card at the top of Explore. Pro and Master plans are in it every day, or boost for a week."}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
          {[
            { label: "Views this week", value: stats?.week.views },
            { label: "Taps this week", value: stats?.week.taps },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
              <dt className="text-xs text-white/50">{stat.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.04em]">
                {stats ? stat.value ?? 0 : "–"}
              </dd>
            </div>
          ))}
        </dl>
        {stats && stats.month.views > 0 ? (
          <p className="mt-3 text-xs text-white/50">
            Last 30 days: {stats.month.views} views, {stats.month.taps} taps.
          </p>
        ) : null}
      </div>
    </section>
  );
}
