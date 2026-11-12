"use client";

// A pro's regular clients and the times held for them. Hidden when there
// are none.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Regular = {
  id: string;
  role: "client" | "pro";
  service: string | null;
  every: string;
  nextDate: string;
  start: string;
  client: { name: string };
};

function prettyDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function prettyTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export default function RegularsPanel() {
  const [regulars, setRegulars] = useState<Regular[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/standing", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setRegulars((json.regulars || []).filter((r: Regular) => r.role === "pro"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!regulars.length) return null;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Your regulars</h2>
        <p className="text-xs text-neutral-500">Their next times are held for them on your calendar.</p>
      </div>
      <ul className="mt-3 divide-y divide-hairline rounded-2xl bg-surface ring-1 ring-ink/[0.06]">
        {regulars.map((r) => (
          <li key={r.id}>
            <Link href={`/regular/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
              <Repeat className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">{r.client.name}</p>
                <p className="truncate text-sm text-neutral-500">
                  {r.service || "Appointment"} · {r.every}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm">
                <span className="font-medium text-ink">{prettyDate(r.nextDate)}</span>
                <span className="block text-xs text-neutral-500">{prettyTime(r.start)}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
