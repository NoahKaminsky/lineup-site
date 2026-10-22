"use client";

import { useState } from "react";

// Weekly hours, built for thumbs: one tidy row per day (name, hours, switch),
// tap a day to edit just that day, one dropdown per time, and shortcuts for
// the common setups. Changes flow up through onChange; the page's own save
// bar saves them.

export type HoursWindow = {
  id?: string;
  professional_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  local_id: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday first: how most people think about a work week.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAYS = [1, 2, 3, 4, 5];

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMinutes(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatTime(time: string) {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function formatTimeLong(time: string) {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 && h < 24 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Every 15 minutes, plus the current value if it was saved off that grid.
function timeOptions(current: string) {
  const options: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) options.push(toTime(m));
  const value = current.slice(0, 5);
  if (value && !options.includes(value)) options.push(value);
  return options.sort();
}

function sortWindows(windows: HoursWindow[]) {
  return [...windows].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export default function WeeklyHoursEditor({
  windows,
  onChange,
}: {
  windows: HoursWindow[];
  onChange: (next: HoursWindow[]) => void;
}) {
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);

  const byDay = (day: number) => sortWindows(windows.filter((w) => w.day_of_week === day));
  const openDays = DAY_ORDER.filter((day) => byDay(day).length > 0).length;

  function setDay(day: number, dayWindows: HoursWindow[]) {
    onChange([...windows.filter((w) => w.day_of_week !== day), ...dayWindows]);
  }

  function block(day: number, start: string, end: string): HoursWindow {
    return { day_of_week: day, start_time: start, end_time: end, is_active: true, local_id: makeLocalId() };
  }

  function toggleDay(day: number) {
    if (byDay(day).length > 0) {
      setDay(day, []);
      if (editingDay === day) setEditingDay(null);
    } else {
      // Open with the hours of the nearest open day, or 9 to 5.
      const template = DAY_ORDER.map(byDay).find((list) => list.length > 0);
      setDay(day, template ? template.map((w) => block(day, w.start_time, w.end_time)) : [block(day, "09:00", "17:00")]);
      setEditingDay(day);
    }
  }

  function updateBlock(localId: string, field: "start_time" | "end_time", value: string) {
    onChange(
      windows.map((w) => {
        if (w.local_id !== localId) return w;
        const next = { ...w, [field]: value };
        // Moving the start past the end pushes the end along by an hour.
        if (field === "start_time" && toMinutes(next.end_time) <= toMinutes(value)) {
          next.end_time = toTime(Math.min(toMinutes(value) + 60, 23 * 60 + 45));
        }
        return next;
      })
    );
  }

  function removeBlock(day: number, localId: string) {
    const remaining = byDay(day).filter((w) => w.local_id !== localId);
    setDay(day, remaining);
    if (remaining.length === 0) setEditingDay(null);
  }

  function addBlock(day: number) {
    const list = byDay(day);
    const last = list[list.length - 1];
    const start = last ? Math.min(toMinutes(last.end_time) + 60, 22 * 60) : 9 * 60;
    const end = Math.min(start + 3 * 60, 23 * 60 + 45);
    setDay(day, [...list, block(day, toTime(start), toTime(end))]);
  }

  function copyDayTo(day: number, targets: number[], label: string) {
    const source = byDay(day);
    const kept = windows.filter((w) => !targets.includes(w.day_of_week) || w.day_of_week === day);
    const copies = targets
      .filter((t) => t !== day)
      .flatMap((t) => source.map((w) => block(t, w.start_time, w.end_time)));
    onChange([...kept, ...copies]);
    setCopiedNote(`Copied to ${label}.`);
    window.setTimeout(() => setCopiedNote(null), 2000);
  }

  function applyPreset(days: number[], start: string, end: string) {
    onChange(days.flatMap((day) => [block(day, start, end)]));
    setEditingDay(null);
  }

  const selectClass =
    "h-11 w-full min-w-0 appearance-none rounded-xl border border-neutral-200 bg-white px-3 text-[15px] font-medium text-ink outline-none transition focus:border-ink";

  return (
    <div>
      <p className="text-sm leading-6 text-neutral-500">
        Turn on the days you work, then tap a day to set its hours.
      </p>

      {/* Shortcuts for the usual setups. */}
      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { label: "Weekdays 9–5", run: () => applyPreset(WEEKDAYS, "09:00", "17:00") },
          { label: "Every day 9–5", run: () => applyPreset(DAY_ORDER, "09:00", "17:00") },
          { label: "Weekdays 10–6", run: () => applyPreset(WEEKDAYS, "10:00", "18:00") },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={preset.run}
            className="shrink-0 rounded-full px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 transition hover:ring-ink/30 active:scale-[0.97]"
          >
            {preset.label}
          </button>
        ))}
        {openDays > 0 ? (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setEditingDay(null);
            }}
            className="shrink-0 rounded-full px-3.5 py-2 text-sm font-medium text-neutral-500 transition hover:text-ink"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <ul className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-surface">
        {DAY_ORDER.map((day, index) => {
          const list = byDay(day);
          const isOpen = list.length > 0;
          const isEditing = editingDay === day && isOpen;
          const hasError = list.some((w) => toMinutes(w.end_time) <= toMinutes(w.start_time));

          return (
            <li key={day} className={index > 0 ? "border-t border-hairline" : ""}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  type="button"
                  disabled={!isOpen}
                  onClick={() => setEditingDay(isEditing ? null : day)}
                  aria-expanded={isEditing}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                >
                  <span className={`w-11 shrink-0 text-[15px] font-semibold ${isOpen ? "text-ink" : "text-neutral-400"}`}>
                    {DAYS[day].slice(0, 3)}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm ${isOpen ? (hasError ? "text-red-600" : "text-ink") : "text-neutral-400"}`}>
                    {isOpen
                      ? list.map((w) => `${formatTime(w.start_time)} – ${formatTime(w.end_time)}`).join(", ")
                      : "Closed"}
                  </span>
                  {isOpen ? (
                    <span className="shrink-0 text-xs font-medium text-neutral-400">{isEditing ? "Done" : "Edit"}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOpen}
                  aria-label={`${DAYS[day]} ${isOpen ? "open" : "closed"}`}
                  onClick={() => toggleDay(day)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${isOpen ? "bg-ink" : "bg-neutral-200"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isOpen ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isEditing ? (
                <div className="lu-fade-in space-y-3 bg-paper/60 px-4 pb-4 pt-1">
                  {list.map((w) => {
                    const invalid = toMinutes(w.end_time) <= toMinutes(w.start_time);
                    return (
                      <div key={w.local_id}>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label="Start time"
                            value={w.start_time.slice(0, 5)}
                            onChange={(e) => updateBlock(w.local_id, "start_time", e.target.value)}
                            className={selectClass}
                          >
                            {timeOptions(w.start_time).map((t) => (
                              <option key={t} value={t}>
                                {formatTimeLong(t)}
                              </option>
                            ))}
                          </select>
                          <span className="shrink-0 text-sm text-neutral-400">to</span>
                          <select
                            aria-label="End time"
                            value={w.end_time.slice(0, 5)}
                            onChange={(e) => updateBlock(w.local_id, "end_time", e.target.value)}
                            className={`${selectClass} ${invalid ? "border-red-300" : ""}`}
                          >
                            {timeOptions(w.end_time).map((t) => (
                              <option key={t} value={t}>
                                {formatTimeLong(t)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeBlock(day, w.local_id)}
                            aria-label="Remove these hours"
                            className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-red-600"
                          >
                            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                        {invalid ? <p className="mt-1 text-xs text-red-600">End time needs to be after the start time.</p> : null}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => addBlock(day)}
                      className="rounded-full px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 transition hover:ring-ink/30 active:scale-[0.97]"
                    >
                      + Add more hours
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-neutral-500">Copy to</span>
                      {[
                        { label: "Weekdays", days: WEEKDAYS },
                        { label: "Every day", days: DAY_ORDER },
                      ].map((target) => (
                        <button
                          key={target.label}
                          type="button"
                          onClick={() => copyDayTo(day, target.days, target.label.toLowerCase())}
                          className="rounded-full bg-ink/[0.05] px-3 py-2 text-xs font-medium text-ink transition hover:bg-ink/10 active:scale-[0.97]"
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {copiedNote ? <p className="text-xs text-neutral-500">{copiedNote}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
