"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { invalidateCache } from "@/app/lib/pageCache";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import TimeSelect from "@/app/components/TimeSelect";

// Weekly open hours, editable right from the Calendar page (paid plans).
// Writes the same `professional_availability` rows the Services page does,
// and flags anything that would stop the calendar showing on the profile.

type Window = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  local_id: string;
};

type BookingProfile = {
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  service_modes: string | string[] | null;
  formatted_address: string | null;
  verification_status?: string | null;
  verified_until?: string | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTime(time: string) {
  return String(time || "").slice(0, 5);
}

function formatTime(time: string) {
  const [hourString, minute = "00"] = normalizeTime(time).split(":");
  const hour = Number(hourString);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function signature(windows: Window[]) {
  return windows
    .map((w) => `${w.day_of_week}:${w.start_time}-${w.end_time}`)
    .sort()
    .join(",");
}

export default function WeeklyAvailabilityEditor() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BookingProfile | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [windows, setWindows] = useState<Window[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSignedInUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const [profileRes, availabilityRes, servicesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "direct_booking_enabled, public_availability_enabled, service_modes, formatted_address, verification_status, verified_until"
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("professional_availability")
          .select("day_of_week, start_time, end_time, is_active")
          .eq("professional_id", user.id)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("professional_services")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", user.id)
          .eq("is_active", true)
          .eq("is_bookable", true),
      ]);
      if (cancelled) return;

      if (profileRes.data) setProfile(profileRes.data as BookingProfile);
      setServiceCount(servicesRes.count ?? 0);

      const loaded: Window[] = (availabilityRes.data || [])
        .filter((row) => row.is_active)
        .map((row) => ({
          day_of_week: Number(row.day_of_week),
          start_time: normalizeTime(row.start_time),
          end_time: normalizeTime(row.end_time),
          local_id: makeLocalId(),
        }));
      setWindows(loaded);
      setSavedSignature(signature(loaded));
      // No hours yet: open the editor straight away so it's obvious what to do.
      setOpen(loaded.length === 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(
    () =>
      DAYS.map((day, dayIndex) => ({
        day,
        dayIndex,
        windows: windows
          .filter((w) => w.day_of_week === dayIndex)
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      })),
    [windows]
  );

  const dirty = !loading && signature(windows) !== savedSignature;
  const openDays = grouped.filter((g) => g.windows.length > 0).length;

  // Everything the public profile needs before it shows the booking calendar.
  const modes = profile
    ? Array.isArray(profile.service_modes)
      ? profile.service_modes
      : [profile.service_modes].filter(Boolean)
    : [];
  const hasFixedLocationMode = modes.some((m) => m === "in_shop" || m === "home_studio");
  const bookingOff = !!profile && (!profile.direct_booking_enabled || !profile.public_availability_enabled);
  const blockers: { text: string; href: string; action: string }[] = [];
  if (profile) {
    if (!isVerifiedNow(profile)) blockers.push({ text: "Finish verification", href: "/verification", action: "Verify" });
    if (!hasFixedLocationMode)
      blockers.push({ text: "Offer in-shop or home-studio appointments", href: "/services#modes", action: "Set up" });
    else if (!profile.formatted_address)
      blockers.push({ text: "Add your shop or studio address", href: "/services#address", action: "Add" });
    if (serviceCount === 0)
      blockers.push({ text: "Add at least one bookable service", href: "/services#add-service", action: "Add" });
  }

  function addWindow(dayIndex: number) {
    setWindows((prev) => [
      ...prev,
      { day_of_week: dayIndex, start_time: "09:00", end_time: "17:00", local_id: makeLocalId() },
    ]);
  }

  function updateWindow(localId: string, field: "start_time" | "end_time", value: string) {
    setWindows((prev) => prev.map((w) => (w.local_id === localId ? { ...w, [field]: value } : w)));
  }

  function removeWindow(localId: string) {
    setWindows((prev) => prev.filter((w) => w.local_id !== localId));
  }

  function closeDay(dayIndex: number) {
    setWindows((prev) => prev.filter((w) => w.day_of_week !== dayIndex));
  }

  function copyToAllDays(dayIndex: number) {
    setWindows((prev) => {
      const source = prev.filter((w) => w.day_of_week === dayIndex);
      return [
        ...source,
        ...DAYS.flatMap((_, other) =>
          other === dayIndex ? [] : source.map((w) => ({ ...w, day_of_week: other, local_id: makeLocalId() }))
        ),
      ];
    });
  }

  async function turnOnBooking() {
    if (!userId) return;
    setMessage(null);
    const { error } = await supabase
      .from("profiles")
      .update({ direct_booking_enabled: true, public_availability_enabled: true })
      .eq("id", userId);
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    setProfile((prev) => (prev ? { ...prev, direct_booking_enabled: true, public_availability_enabled: true } : prev));
    invalidateCache("services-page");
    setMessage({ tone: "ok", text: "Instant booking is on." });
  }

  async function save() {
    if (!userId) return;
    setMessage(null);

    for (const w of windows) {
      if (w.start_time >= w.end_time) {
        setMessage({ tone: "error", text: `${DAYS[w.day_of_week]}: the end time has to be after the start time.` });
        return;
      }
    }
    for (const g of grouped) {
      for (let i = 1; i < g.windows.length; i += 1) {
        if (g.windows[i].start_time < g.windows[i - 1].end_time) {
          setMessage({ tone: "error", text: `${g.day}: two blocks of hours overlap.` });
          return;
        }
      }
    }

    setSaving(true);
    const { error: deleteError } = await supabase
      .from("professional_availability")
      .delete()
      .eq("professional_id", userId);

    if (deleteError) {
      setSaving(false);
      setMessage({ tone: "error", text: deleteError.message });
      return;
    }

    if (windows.length > 0) {
      const { error: insertError } = await supabase.from("professional_availability").insert(
        windows.map((w) => ({
          professional_id: userId,
          day_of_week: w.day_of_week,
          start_time: w.start_time,
          end_time: w.end_time,
          is_active: true,
        }))
      );
      if (insertError) {
        setSaving(false);
        setMessage({ tone: "error", text: insertError.message });
        return;
      }
    }

    setSaving(false);
    setSavedSignature(signature(windows));
    // The Services page keeps its own copy of these hours; make it reload.
    invalidateCache("services-page");
    setMessage({ tone: "ok", text: "Availability saved. Clients can book these times on your profile." });
  }

  if (loading) {
    return <div id="availability" className="mt-6 h-20 animate-pulse rounded-2xl bg-neutral-200/60" />;
  }

  return (
    <section id="availability" className="mt-6 scroll-mt-28 rounded-2xl border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-500">Availability</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink">Your weekly hours</h2>
          <p className="mt-0.5 truncate text-sm text-neutral-500">
            {openDays === 0 ? "No open hours yet — clients can't book you" : `Open ${openDays} day${openDays === 1 ? "" : "s"} a week`}
          </p>
        </div>
        <span className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/10">
          {open ? "Done" : "Set hours"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-hairline px-5 pb-5 pt-4 sm:px-6">
          <p className="text-sm leading-6 text-neutral-500">
            Switch a day on, then set your hours. Add a second block if your day is split.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
            {grouped.map((group, i) => (
              <div key={group.dayIndex} className={`${i > 0 ? "border-t border-hairline" : ""} ${group.windows.length > 0 ? "bg-surface" : "bg-paper/50"}`}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <p className="w-24 shrink-0 text-sm font-semibold text-neutral-900">{group.day}</p>
                    <span className={`truncate text-xs font-medium ${group.windows.length > 0 ? "text-ink" : "text-neutral-400"}`}>
                      {group.windows.length === 0
                        ? "Closed"
                        : group.windows.map((w) => `${formatTime(w.start_time)}–${formatTime(w.end_time)}`).join(" · ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {group.windows.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copyToAllDays(group.dayIndex)}
                          className="hidden rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-ink sm:inline-flex"
                        >
                          Copy to all days
                        </button>
                        <button
                          type="button"
                          onClick={() => addWindow(group.dayIndex)}
                          className="rounded-full px-2.5 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-ink/10 transition-colors hover:ring-ink/30"
                        >
                          + Hours
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={group.windows.length > 0}
                      aria-label={`${group.day} ${group.windows.length > 0 ? "open" : "closed"}`}
                      onClick={() => (group.windows.length > 0 ? closeDay(group.dayIndex) : addWindow(group.dayIndex))}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${
                        group.windows.length > 0 ? "bg-ink" : "bg-neutral-200"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          group.windows.length > 0 ? "translate-x-[18px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {group.windows.length > 0 ? (
                  <div className="space-y-2 px-4 pb-3">
                    {group.windows.map((w) => (
                      <div
                        key={w.local_id}
                        className="grid gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                      >
                        <div className="flex items-center gap-2">
                          <label className="w-8 shrink-0 text-xs font-medium text-neutral-500">From</label>
                          <TimeSelect
                            value={w.start_time}
                            onChange={(value) => updateWindow(w.local_id, "start_time", value)}
                            selectClassName="w-full rounded-xl border border-neutral-200 bg-white px-1.5 py-2 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="w-8 shrink-0 text-xs font-medium text-neutral-500">To</label>
                          <TimeSelect
                            value={w.end_time}
                            onChange={(value) => updateWindow(w.local_id, "end_time", value)}
                            selectClassName="w-full rounded-xl border border-neutral-200 bg-white px-1.5 py-2 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWindow(w.local_id)}
                          className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-40"
            >
              {saving ? "Saving…" : dirty ? "Save hours" : "Saved"}
            </button>
            {message ? (
              <p role="status" className={`text-sm ${message.tone === "error" ? "text-red-600" : "text-neutral-600"}`}>
                {message.text}
              </p>
            ) : null}
          </div>
        </div>
      ) : message ? (
        <p role="status" className={`px-5 pb-4 text-sm sm:px-6 ${message.tone === "error" ? "text-red-600" : "text-neutral-600"}`}>
          {message.text}
        </p>
      ) : null}

      {bookingOff || blockers.length > 0 ? (
        <div className="border-t border-hairline px-5 py-4 sm:px-6">
          <p className="text-sm font-medium text-ink">Your booking calendar isn&apos;t showing on your profile yet</p>
          <ul className="mt-2 space-y-2">
            {bookingOff ? (
              <li className="flex items-center justify-between gap-3 text-sm text-neutral-600">
                <span>Instant booking is turned off</span>
                <button
                  type="button"
                  onClick={turnOnBooking}
                  className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800"
                >
                  Turn on
                </button>
              </li>
            ) : null}
            {blockers.map((b) => (
              <li key={b.text} className="flex items-center justify-between gap-3 text-sm text-neutral-600">
                <span>{b.text}</span>
                <Link
                  href={b.href}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-ink ring-1 ring-inset ring-ink/15 transition hover:ring-ink/30"
                >
                  {b.action}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
