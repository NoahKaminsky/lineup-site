"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Scheduling controls for paid pros on the Services page:
//  - BookingWindowControl: how far ahead clients can book.
//  - TimeOffControl: days off, without touching weekly hours.
// Each saves on its own, straight away.

const MIGRATION_MESSAGE =
  "This needs a quick database update first: run the time-off block at the bottom of supabase/RUN_THIS_ONCE.sql in Supabase.";

const WINDOW_OPTIONS = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 10, label: "10 days" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 28, label: "4 weeks" },
  { days: 56, label: "8 weeks (longest)" },
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDay(dateKey: string, withWeekday = false) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-CA", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
  });
}

function isMissingSchemaError(message: string | undefined) {
  return !!message && /does not exist|schema cache|could not find/i.test(message);
}

export function BookingWindowControl({ professionalId }: { professionalId: string }) {
  const [days, setDays] = useState<number>(56);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("booking_window_days")
      .eq("id", professionalId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error && isMissingSchemaError(error.message)) setStatus({ tone: "error", text: MIGRATION_MESSAGE });
        const value = Number((data as { booking_window_days?: number | null } | null)?.booking_window_days);
        setDays(Number.isFinite(value) && value > 0 ? value : 56);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId]);

  async function choose(next: number) {
    const previous = days;
    setDays(next);
    setStatus(null);
    const { error } = await supabase
      .from("profiles")
      .update({ booking_window_days: next >= 56 ? null : next })
      .eq("id", professionalId);
    if (error) {
      setDays(previous);
      setStatus({ tone: "error", text: isMissingSchemaError(error.message) ? MIGRATION_MESSAGE : error.message });
      return;
    }
    setStatus({ tone: "ok", text: "Saved." });
  }

  const lastBookable = addDaysKey(todayKey(), days - 1);
  const known = WINDOW_OPTIONS.some((o) => o.days === days);

  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-neutral-500">
        Only know your schedule for the next little while? Clients can only book this far ahead. It rolls forward a day
        at a time, so new days open up on their own.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(known ? WINDOW_OPTIONS : [...WINDOW_OPTIONS, { days, label: `${days} days` }]).map((option) => (
          <button
            key={option.days}
            type="button"
            disabled={!loaded}
            aria-pressed={days === option.days}
            onClick={() => choose(option.days)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              days === option.days ? "bg-ink text-white" : "text-ink ring-1 ring-inset ring-ink/15 hover:ring-ink/30"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        {loaded ? `Right now clients can book up to ${formatDay(lastBookable, true)}.` : " "}
        {status ? (
          <span className={`ml-2 ${status.tone === "error" ? "text-red-600" : "text-neutral-500"}`}>{status.text}</span>
        ) : null}
      </p>
    </div>
  );
}

type TimeOffRow = { id: string; start_date: string; end_date: string; note: string | null };

export function TimeOffControl({ professionalId }: { professionalId: string }) {
  const [rows, setRows] = useState<TimeOffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("professional_time_off")
      .select("id, start_date, end_date, note")
      .eq("professional_id", professionalId)
      .gte("end_date", todayKey())
      .order("start_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus({ tone: "error", text: isMissingSchemaError(error.message) ? MIGRATION_MESSAGE : error.message });
        } else {
          setRows((data || []) as TimeOffRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId]);

  async function addTimeOff() {
    setStatus(null);
    const from = start;
    const to = end || start;
    if (!from) {
      setStatus({ tone: "error", text: "Pick the first day you're off." });
      return;
    }
    if (from < todayKey()) {
      setStatus({ tone: "error", text: "Time off can't start in the past." });
      return;
    }
    if (to < from) {
      setStatus({ tone: "error", text: "The last day has to be on or after the first day." });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("professional_time_off")
      .insert({ professional_id: professionalId, start_date: from, end_date: to, note: note.trim() || null })
      .select("id, start_date, end_date, note")
      .single();

    if (error || !data) {
      setSaving(false);
      setStatus({
        tone: "error",
        text: isMissingSchemaError(error?.message) ? MIGRATION_MESSAGE : error?.message || "Couldn't save that.",
      });
      return;
    }

    setRows((prev) => [...prev, data as TimeOffRow].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setStart("");
    setEnd("");
    setNote("");

    // Bookings already made for those days stay booked: say so.
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", professionalId)
      .in("status", ["confirmed", "completion_requested"])
      .gte("booking_date", from)
      .lte("booking_date", to);
    setSaving(false);
    setStatus(
      count && count > 0
        ? {
            tone: "warn",
            text: `Saved. You already have ${count} booking${count === 1 ? "" : "s"} in that time. They're still on, so cancel or move them from Work if you need to.`,
          }
        : { tone: "ok", text: "Saved. Clients can't book you on those days." }
    );
  }

  async function removeTimeOff(id: string) {
    setStatus(null);
    const { error } = await supabase.from("professional_time_off").delete().eq("id", id);
    if (error) {
      setStatus({ tone: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.filter((row) => row.id !== id));
    setStatus({ tone: "ok", text: "Removed. Those days are open again." });
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900";

  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-neutral-500">
        Taking a break? Add the days you&apos;re off and clients won&apos;t be able to book them. Your weekly hours stay
        as they are.
      </p>

      {loading ? (
        <div className="mt-4 h-12 animate-pulse rounded-xl bg-neutral-100" />
      ) : rows.length > 0 ? (
        <ul className="mt-4 overflow-hidden rounded-xl border border-hairline">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {row.start_date === row.end_date
                    ? formatDay(row.start_date, true)
                    : `${formatDay(row.start_date, true)} – ${formatDay(row.end_date, true)}`}
                </p>
                {row.note ? <p className="truncate text-xs text-neutral-500">{row.note}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => removeTimeOff(row.id)}
                className="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">No time off coming up.</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">First day off</span>
          <input
            type="date"
            min={todayKey()}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Last day off</span>
          <input
            type="date"
            min={start || todayKey()}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">Note (only you see it)</span>
          <input
            type="text"
            value={note}
            maxLength={80}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Vacation"
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={addTimeOff}
          disabled={saving || !start}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add time off"}
        </button>
      </div>

      {status ? (
        <p
          role="status"
          className={`mt-3 text-sm ${
            status.tone === "error" ? "text-red-600" : status.tone === "warn" ? "text-amber-700" : "text-neutral-600"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
