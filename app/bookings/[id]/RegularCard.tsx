"use client";

// On a booking: make it a regular appointment (the client), or see the
// regular it belongs to (either side).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Regular = { id: string; every: string; nextDate: string; start: string };

async function authed(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

function prettyDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function RegularCard({ bookingId, proName }: { bookingId: string; proName: string }) {
  const [regular, setRegular] = useState<Regular | null>(null);
  const [canStart, setCanStart] = useState(false);
  const [intervals, setIntervals] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(3);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    authed(`/api/standing?bookingId=${encodeURIComponent(bookingId)}`).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (cancelled || !res.ok) return;
      setRegular(json.regular || null);
      setCanStart(!!json.canStart);
      setIntervals(json.intervals || []);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function start() {
    setBusy(true);
    setError("");
    const res = await authed("/api/standing", { method: "POST", body: JSON.stringify({ action: "start", bookingId, intervalWeeks: weeks }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Couldn't set that up.");
    setRegular(json.regular);
    setOpen(false);
  }

  if (regular) {
    return (
      <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
        <div className="flex min-w-0 items-start gap-3">
          <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">Regular appointment, {regular.every}</p>
            <p className="mt-1 text-sm text-neutral-500">Next one held for {prettyDate(regular.nextDate)}.</p>
          </div>
        </div>
        <Link href={`/regular/${regular.id}`} className="shrink-0 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset ring-ink/15 hover:bg-neutral-50">
          Manage
        </Link>
      </section>
    );
  }

  if (!canStart) return null;

  return (
    <section className="mt-4 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">Make this a regular appointment</p>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Same time with {proName.split(" ")[0]}, held for you every few weeks. You confirm and pay each one a week ahead.
            </p>
          </div>
        </div>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800">
            Set it up
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">How often?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {intervals.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weeks === w}
                onClick={() => setWeeks(w)}
                className={`h-10 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition ${
                  weeks === w ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/15 hover:ring-ink/40"
                }`}
              >
                {w === 1 ? "Every week" : `Every ${w} weeks`}
              </button>
            ))}
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={start} disabled={busy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
              {busy ? "Setting up…" : "Make it regular"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
