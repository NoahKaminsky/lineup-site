"use client";

// The studio calendar. Day view is the shop floor: a column per pro, hours
// down the side, every appointment where it sits in the day, and a red line
// for now. Month view is the overview; picking a day opens it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Phone, Plus } from "lucide-react";
import { formatCad, studioFetch } from "./studioApi";
import { Avatar, Button, Field, Menu, Segmented, Sheet, Tag, buttonClass, fieldClass, panelClass, SIGNAL } from "./ui";
import {
  addDays,
  firstName,
  fromDateKey,
  fromMinutes,
  localDateKey,
  nextQuarterHour,
  time12,
  toMinutes,
  type ScheduleItem,
  type SectionProps,
  type ServiceOption,
  type TeamMember,
} from "./types";

type View = "day" | "month";
type Hours = Record<string, Record<number, [string, string][]>>;
type TimeOff = Record<string, { start: string; end: string }[]>;

const PX_PER_MIN = 1.1; // 66px an hour
const NO_SHOW_GRACE_MIN = 15;

function monthRange(key: string) {
  const d = fromDateKey(key);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  // Pad to whole weeks so the month grid's edges have data too.
  const from = new Date(first);
  from.setDate(first.getDate() - first.getDay());
  const to = new Date(last);
  to.setDate(last.getDate() + (6 - last.getDay()));
  return { from: localDateKey(from), to: localDateKey(to), monthKey: `${first.getFullYear()}-${first.getMonth()}` };
}

function isOff(timeOff: TimeOff, proId: string, date: string) {
  return (timeOff[proId] || []).some((r) => date >= r.start && date <= r.end);
}

function hoursFor(hours: Hours, proId: string, date: string) {
  return hours[proId]?.[fromDateKey(date).getDay()] || [];
}

function startsPassed(item: ScheduleItem, graceMin = 0) {
  return Date.now() >= new Date(`${item.date}T${item.start}:00`).getTime() + graceMin * 60_000;
}

function statusTag(item: ScheduleItem) {
  if (item.status === "no_show") return <Tag tone="signal">No-show</Tag>;
  if (item.status === "completed") return <Tag>Done</Tag>;
  if (item.status === "completion_requested") return <Tag tone="outline">Finishing up</Tag>;
  return null;
}

function paymentLine(item: ScheduleItem) {
  const price = item.priceCents !== null ? formatCad(item.priceCents) : null;
  if (item.kind !== "online") {
    return `${item.kind === "phone" ? "Phone-in" : "Walk-in"}${price ? `, ${price} at the shop` : ", paid at the shop"}`;
  }
  if (item.payAtShop) return `Booked online${price ? `, pays ${price} at the shop` : ", pays at the shop"}`;
  return item.source === "request" ? "New client from a request, paid online" : "Booked and paid online";
}

export default function ScheduleView({ data, busy, run, setNotice }: SectionProps) {
  const me = data.me!;
  const studio = data.studio!;
  const team = useMemo(() => (data.team || []).filter((m) => m.status === "active" && m.profileId), [data.team]);
  const myProfileId = team.find((m) => m.id === me.memberId)?.profileId || null;

  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [proFilter, setProFilter] = useState<string>("all");
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [hours, setHours] = useState<Hours>({});
  const [timeOff, setTimeOff] = useState<TimeOff>({});
  const [open, setOpen] = useState<ScheduleItem | null>(null);
  const [draft, setDraft] = useState<{ pro: string; date: string; start: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const range = useMemo(() => monthRange(date), [date]);

  useEffect(() => {
    let cancelled = false;
    studioFetch<{ items: ScheduleItem[]; hours: Hours; timeOff: TimeOff }>(
      `/api/studio/schedule?from=${range.from}&to=${range.to}`
    ).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not load the schedule." });
        setItems([]);
        return;
      }
      setItems(res.data.items || []);
      setHours(res.data.hours || {});
      setTimeOff(res.data.timeOff || {});
    });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, refreshKey, setNotice]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const columns = useMemo(
    () => (me.canManage ? team.filter((m) => proFilter === "all" || m.profileId === proFilter) : team.filter((m) => m.profileId === myProfileId)),
    [me.canManage, team, proFilter, myProfileId]
  );
  const columnIds = useMemo(() => new Set(columns.map((c) => c.profileId!)), [columns]);
  const visible = useMemo(() => (items || []).filter((i) => columnIds.has(i.professionalId)), [items, columnIds]);

  const todayKey = localDateKey(new Date());
  const dayItems = visible.filter((i) => i.date === date);
  const canBook = studio.live;

  function step(direction: -1 | 1) {
    if (view === "day") setDate((d) => addDays(d, direction));
    else {
      const d = fromDateKey(date);
      setDate(localDateKey(new Date(d.getFullYear(), d.getMonth() + direction, 1)));
    }
  }

  const title =
    view === "day"
      ? fromDateKey(date).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })
      : fromDateKey(date).toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  const active = dayItems.filter((i) => i.status !== "no_show");
  const atShopCents = active
    .filter((i) => i.kind !== "online" || i.payAtShop)
    .reduce((sum, i) => sum + (i.priceCents || 0), 0);
  const walkIns = active.filter((i) => i.kind !== "online").length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={view === "day" ? "Previous day" : "Previous month"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={view === "day" ? "Next day" : "Next month"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 className="ml-1.5 truncate text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl" aria-live="polite">
            {title}
          </h2>
          {(view === "day" ? date !== todayKey : range.monthKey !== monthRange(todayKey).monthKey) ? (
            <Button size="sm" variant="ghost" onClick={() => setDate(todayKey)} className="ml-1">
              Today
            </Button>
          ) : null}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          {me.canManage && team.length > 1 ? (
            <select
              aria-label="Show"
              value={proFilter}
              onChange={(e) => setProFilter(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-full bg-surface pl-3.5 pr-8 sm:flex-none text-sm text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] outline-none focus:shadow-[inset_0_0_0_1.5px_#0a0a0a]"
            >
              <option value="all">Whole team</option>
              {team.map((m) => (
                <option key={m.id} value={m.profileId!}>
                  {m.name || "Team member"}
                </option>
              ))}
            </select>
          ) : null}
          <Segmented
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
            ]}
          />
          {canBook ? (
            <Button
              variant="primary"
              aria-label="New appointment"
              className="shrink-0 max-sm:w-10 max-sm:px-0"
              onClick={() =>
                setDraft({
                  pro: proFilter !== "all" ? proFilter : me.canManage ? (columns.length === 1 ? columns[0].profileId! : "") : myProfileId || "",
                  date: view === "day" ? date : todayKey,
                  start: view === "day" && date !== todayKey ? "10:00" : nextQuarterHour(),
                })
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">New appointment</span>
            </Button>
          ) : null}
        </div>
      </div>

      {view === "day" ? (
        <p className="mt-2 text-sm text-neutral-500">
          {items === null
            ? "Loading…"
            : active.length === 0
            ? "Nothing booked."
            : `${active.length} ${active.length === 1 ? "appointment" : "appointments"}${
                walkIns ? `, ${walkIns} ${walkIns === 1 ? "walk-in" : "walk-ins"}` : ""
              }${atShopCents ? `. ${formatCad(atShopCents)} to collect at the shop.` : "."}`}
        </p>
      ) : null}

      <div className="mt-5">
        {view === "day" ? (
          <DayGrid
            date={date}
            columns={columns}
            items={dayItems}
            hours={hours}
            timeOff={timeOff}
            loading={items === null}
            canBookFor={(pro) => canBook && (me.canManage || pro === myProfileId)}
            onOpen={setOpen}
            onSlot={(pro, start) => setDraft({ pro, date, start })}
          />
        ) : (
          <MonthGrid
            date={date}
            items={visible}
            team={team}
            onPick={(d) => {
              setDate(d);
              setView("day");
            }}
          />
        )}
      </div>

      <AppointmentSheet
        item={open}
        pro={open ? team.find((m) => m.profileId === open.professionalId) || null : null}
        canAct={!!open && (me.canManage || open.professionalId === myProfileId)}
        busy={busy}
        onClose={() => setOpen(null)}
        run={run}
        setNotice={setNotice}
        onChanged={() => {
          setOpen(null);
          refresh();
        }}
      />

      <NewAppointmentSheet
        draft={draft}
        team={me.canManage ? team : team.filter((m) => m.profileId === myProfileId)}
        services={data.services || {}}
        busy={busy}
        run={run}
        setNotice={setNotice}
        onClose={() => setDraft(null)}
        onSaved={(message, savedDate) => {
          setDraft(null);
          setNotice({ tone: "success", text: message });
          setDate(savedDate);
          setView("day");
          refresh();
        }}
      />
    </div>
  );
}

/* ── Day: one column per pro ─────────────────────────────────────────────── */

function DayGrid({
  date,
  columns,
  items,
  hours,
  timeOff,
  loading,
  canBookFor,
  onOpen,
  onSlot,
}: {
  date: string;
  columns: TeamMember[];
  items: ScheduleItem[];
  hours: Hours;
  timeOff: TimeOff;
  loading: boolean;
  canBookFor: (proId: string) => boolean;
  onOpen: (item: ScheduleItem) => void;
  onSlot: (proId: string, start: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Hours shown: the working day of everyone visible, at least 8am to 8pm,
  // stretched to fit anything booked outside it.
  const { startMin, endMin } = useMemo(() => {
    let lo = 8 * 60;
    let hi = 20 * 60;
    for (const c of columns) {
      for (const [s, e] of hoursFor(hours, c.profileId!, date)) {
        lo = Math.min(lo, toMinutes(s));
        hi = Math.max(hi, toMinutes(e));
      }
    }
    for (const i of items) {
      lo = Math.min(lo, toMinutes(i.start));
      hi = Math.max(hi, toMinutes(i.end));
    }
    return { startMin: Math.floor(lo / 60) * 60, endMin: Math.min(Math.ceil(hi / 60) * 60, 24 * 60) };
  }, [columns, hours, items, date]);

  const height = (endMin - startMin) * PX_PER_MIN;
  const isToday = date === localDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= startMin && nowMin <= endMin;

  // Open on the part of the day that matters: an hour before now, or the
  // first appointment.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focusMin = showNow ? nowMin - 60 : items.length ? toMinutes(items[0].start) - 30 : 9 * 60;
    el.scrollTop = Math.max(0, (focusMin - startMin) * PX_PER_MIN);
    // Only when the day changes, not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startMin, items.length]);

  if (!columns.length) {
    return (
      <div className={`${panelClass} px-6 py-12 text-center text-sm text-neutral-500`}>
        No one on the team yet. Invite your pros from Team.
      </div>
    );
  }

  const hourMarks: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hourMarks.push(m);
  const colMin = columns.length === 1 ? "100%" : "176px";

  return (
    <div className={`${panelClass} overflow-hidden`}>
      <div ref={scrollRef} className="max-h-[72vh] overflow-auto overscroll-contain">
        <div className="relative" style={{ minWidth: columns.length > 1 ? 60 + columns.length * 176 : undefined }}>
          {/* Column heads */}
          <div className="sticky top-0 z-20 flex border-b border-hairline bg-surface/95 backdrop-blur">
            <div className="sticky left-0 z-10 w-[60px] shrink-0 bg-surface/95" />
            {columns.map((c) => {
              const off = isOff(timeOff, c.profileId!, date);
              const windows = hoursFor(hours, c.profileId!, date);
              const bookedCount = items.filter((i) => i.professionalId === c.profileId && i.status !== "no_show").length;
              return (
                <div
                  key={c.id}
                  className="flex flex-1 items-center gap-2.5 border-l border-hairline px-3 py-3"
                  style={{ minWidth: colMin }}
                >
                  <Avatar name={c.name} src={c.avatarUrl} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{firstName(c.name)}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {off
                        ? "Time off"
                        : windows.length
                        ? `${time12(windows[0][0])}–${time12(windows[windows.length - 1][1])}${bookedCount ? `, ${bookedCount} booked` : ""}`
                        : "Not working"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="relative flex" style={{ height }}>
            {/* Hour gutter */}
            <div className="sticky left-0 z-10 w-[60px] shrink-0 bg-surface">
              {hourMarks.map((m) => (
                <span
                  key={m}
                  className="absolute right-2.5 -translate-y-1/2 text-[11px] tabular-nums text-neutral-400"
                  style={{ top: (m - startMin) * PX_PER_MIN }}
                >
                  {m === startMin ? "" : time12(fromMinutes(m))}
                </span>
              ))}
            </div>

            {/* Hour lines across every column */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[60px] right-0">
              {hourMarks.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-hairline" style={{ top: (m - startMin) * PX_PER_MIN }} />
              ))}
              {hourMarks.slice(0, -1).map((m) => (
                <div
                  key={`h${m}`}
                  className="absolute inset-x-0 border-t border-dashed border-ink/[0.04]"
                  style={{ top: (m + 30 - startMin) * PX_PER_MIN }}
                />
              ))}
            </div>

            {columns.map((c) => {
              const proId = c.profileId!;
              const off = isOff(timeOff, proId, date);
              const windows = off ? [] : hoursFor(hours, proId, date);
              const bookable = canBookFor(proId);
              const colItems = items.filter((i) => i.professionalId === proId);
              return (
                <div
                  key={c.id}
                  className={`relative flex-1 border-l border-hairline ${bookable ? "cursor-copy" : ""}`}
                  style={{
                    minWidth: colMin,
                    // Hatch the whole column; working hours are painted over it.
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(10,10,10,0.035) 0 1px, transparent 1px 9px)",
                  }}
                  onClick={(e) => {
                    if (!bookable || e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const min = startMin + (e.clientY - rect.top) / PX_PER_MIN;
                    onSlot(proId, fromMinutes(Math.floor(min / 15) * 15));
                  }}
                >
                  {windows.map(([s, e]) => (
                    <div
                      key={`${s}-${e}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bg-surface"
                      style={{ top: (toMinutes(s) - startMin) * PX_PER_MIN, height: (toMinutes(e) - toMinutes(s)) * PX_PER_MIN }}
                    />
                  ))}

                  {colItems.map((item) => (
                    <AppointmentBlock key={`${item.kind}-${item.id}`} item={item} startMin={startMin} onOpen={onOpen} />
                  ))}
                </div>
              );
            })}

            {showNow ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[52px] right-0 z-10 flex items-center"
                style={{ top: (nowMin - startMin) * PX_PER_MIN }}
              >
                <span className="studio-now-dot h-2.5 w-2.5 -translate-y-px rounded-full" style={{ background: SIGNAL }} />
                <span className="h-[1.5px] flex-1" style={{ background: SIGNAL }} />
              </div>
            ) : null}

            {loading ? <div className="absolute inset-0 z-10 animate-pulse bg-surface/60" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppointmentBlock({ item, startMin, onOpen }: { item: ScheduleItem; startMin: number; onOpen: (i: ScheduleItem) => void }) {
  const top = (toMinutes(item.start) - startMin) * PX_PER_MIN;
  const minutes = toMinutes(item.end) - toMinutes(item.start);
  const height = Math.max(minutes * PX_PER_MIN - 2, 24);
  // Three densities so text never gets cut off mid-line.
  const size = height < 40 ? "xs" : height < 64 ? "sm" : "lg";
  const closed = item.status === "completed" || item.status === "no_show";
  const frontDesk = item.kind !== "online";

  const look = closed
    ? "bg-ink/[0.05] text-neutral-500"
    : frontDesk
    ? "bg-[#ecebe6] text-ink shadow-[inset_3px_0_0_#0a0a0a]"
    : item.payAtShop
    ? "bg-surface text-ink shadow-[inset_0_0_0_1.5px_#0a0a0a]"
    : "bg-ink text-white";
  const strike = item.status === "no_show" ? "line-through" : "";
  const service = item.service || "Appointment";

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`absolute inset-x-1 z-[1] flex flex-col overflow-hidden rounded-[10px] px-2.5 text-left transition-[transform,box-shadow] duration-150 hover:z-[2] hover:-translate-y-px hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)] focus-visible:z-[2] ${look} ${
        size === "lg" ? "py-1.5" : "justify-center"
      }`}
      style={{ top: top + 1, height }}
      aria-label={`${time12(item.start)} to ${time12(item.end)}, ${service}${item.clientName ? ` with ${item.clientName}` : ""}`}
    >
      {size === "lg" ? (
        <>
          <span className={`block truncate text-[11px] tabular-nums ${closed ? "" : "opacity-70"}`}>
            {time12(item.start)} – {time12(item.end)}
          </span>
          <span className={`block truncate text-[13px] font-semibold leading-tight ${strike}`}>{service}</span>
          {item.clientName ? <span className={`mt-0.5 block truncate text-xs ${closed ? "" : "opacity-75"}`}>{item.clientName}</span> : null}
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={`shrink-0 text-[11px] tabular-nums ${closed ? "" : "opacity-70"}`}>{time12(item.start)}</span>
            <span className={`truncate text-[13px] font-semibold leading-tight ${strike}`}>{service}</span>
            {size === "xs" && item.clientName ? (
              <span className={`hidden truncate text-xs md:inline ${closed ? "" : "opacity-75"}`}>{item.clientName}</span>
            ) : null}
          </span>
          {size === "sm" && item.clientName ? (
            <span className={`mt-0.5 block truncate text-xs leading-tight ${closed ? "" : "opacity-75"}`}>{item.clientName}</span>
          ) : null}
        </>
      )}
    </button>
  );
}

/* ── Month: the overview ─────────────────────────────────────────────────── */

function MonthGrid({
  date,
  items,
  team,
  onPick,
}: {
  date: string;
  items: ScheduleItem[];
  team: TeamMember[];
  onPick: (date: string) => void;
}) {
  const d = fromDateKey(date);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const todayKey = localDateKey(new Date());
  const names = useMemo(() => new Map(team.map((m) => [m.profileId, firstName(m.name)])), [team]);

  const byDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const i of items) if (i.status !== "no_show") (map[i.date] ||= []).push(i);
    return map;
  }, [items]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(localDateKey(new Date(d.getFullYear(), d.getMonth(), day)));
  while (cells.length % 7) cells.push(null);

  return (
    <div className={`${panelClass} overflow-hidden`}>
      <div className="grid grid-cols-7 border-b border-hairline">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className="px-2 py-2.5 text-center text-xs font-medium text-neutral-500 sm:px-3 sm:text-left">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-hairline">
        {cells.map((key, idx) => {
          if (!key) return <div key={`e${idx}`} className="min-h-[64px] bg-paper sm:min-h-[120px]" />;
          const dayItems = byDate[key] || [];
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-label={`${fromDateKey(key).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}, ${dayItems.length} ${dayItems.length === 1 ? "appointment" : "appointments"}`}
              className="flex min-h-[64px] flex-col items-center gap-1 bg-surface p-1.5 text-left transition-colors hover:bg-neutral-50 sm:min-h-[120px] sm:items-stretch sm:p-2"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums sm:self-start ${
                  isToday ? "bg-ink font-semibold text-white" : isPast ? "text-neutral-400" : "font-medium text-ink"
                }`}
              >
                {fromDateKey(key).getDate()}
              </span>

              {/* Phones: a count. Wider: the first few appointments. */}
              {dayItems.length ? (
                <span className="text-[11px] font-semibold tabular-nums text-ink sm:hidden">{dayItems.length}</span>
              ) : null}
              <span className="hidden w-full space-y-1 sm:block">
                {dayItems.slice(0, 3).map((i) => (
                  <span
                    key={`${i.kind}-${i.id}`}
                    className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11px] leading-tight ${
                      i.status === "completed" ? "text-neutral-400" : "bg-ink/[0.05] text-ink"
                    }`}
                  >
                    <span className="shrink-0 tabular-nums text-neutral-500">{time12(i.start)}</span>
                    <span className="truncate font-medium">{names.get(i.professionalId) || i.service}</span>
                  </span>
                ))}
                {dayItems.length > 3 ? (
                  <span className="block px-1.5 text-[11px] font-medium text-neutral-500">{dayItems.length - 3} more</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Appointment details ─────────────────────────────────────────────────── */

function AppointmentSheet({
  item,
  pro,
  canAct,
  busy,
  onClose,
  run,
  setNotice,
  onChanged,
}: {
  item: ScheduleItem | null;
  pro: TeamMember | null;
  canAct: boolean;
  busy: string | null;
  onClose: () => void;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onChanged: () => void;
}) {
  if (!item) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const frontDesk = item.kind !== "online";
  const openFrontDesk = frontDesk && item.status === "booked";
  const canNoShowOnline =
    !frontDesk && item.payAtShop && item.status === "confirmed" && startsPassed(item, NO_SHOW_GRACE_MIN);

  async function setStatus(status: "completed" | "no_show" | "cancelled", success: string) {
    if (status === "cancelled" && !window.confirm("Cancel this appointment? The time opens up again.")) return;
    await run(`fd-${item!.id}`, async () => {
      const res = await studioFetch("/api/studio/front-desk", { method: "PATCH", body: { id: item!.id, status } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not update it." });
        return;
      }
      setNotice({ tone: "success", text: success });
      onChanged();
    });
  }

  async function onlineNoShow() {
    if (!window.confirm(`Mark ${item!.clientName || "this client"} as a no-show? Their card is charged the no-show fee.`)) return;
    await run(`ns-${item!.id}`, async () => {
      const res = await studioFetch<{ message?: string }>("/api/bookings/no-show", { method: "POST", body: { bookingId: item!.id } });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not mark the no-show." });
        return;
      }
      setNotice({ tone: "success", text: res.data.message || "Marked as a no-show." });
      onChanged();
    });
  }

  const when = `${fromDateKey(item.date).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}, ${time12(
    item.start
  )} – ${time12(item.end)}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.service || "Appointment"}
      description={when}
      footer={
        <>
          {!frontDesk ? (
            <a href={`/bookings/${item.id}`} className={buttonClass("secondary")}>
              Open booking
            </a>
          ) : null}
          {canAct && canNoShowOnline ? (
            <Button variant="danger" loading={busy === `ns-${item.id}`} onClick={onlineNoShow}>
              No-show, charge fee
            </Button>
          ) : null}
          {canAct && openFrontDesk ? (
            <>
              <Menu
                label="More actions"
                items={[
                  { label: "Mark as no-show", onSelect: () => setStatus("no_show", "Marked as a no-show.") },
                  { label: "Cancel appointment", danger: true, onSelect: () => setStatus("cancelled", "Cancelled. The time is open again.") },
                ]}
              />
              <Button variant="primary" loading={busy === `fd-${item.id}`} onClick={() => setStatus("completed", "Marked done.")}>
                Mark done
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <dl className="divide-y divide-hairline text-sm">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <dt className="text-neutral-500">With</dt>
          <dd className="flex items-center gap-2 font-medium text-ink">
            <Avatar name={pro?.name || null} src={pro?.avatarUrl} size={24} />
            {pro?.name || "Team member"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <dt className="text-neutral-500">Client</dt>
          <dd className="text-right font-medium text-ink">
            {item.clientName || "Client"}
            {item.clientPhone ? (
              <a href={`tel:${item.clientPhone}`} className="mt-0.5 flex items-center justify-end gap-1 text-[13px] font-normal text-neutral-500 hover:text-ink">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {item.clientPhone}
              </a>
            ) : null}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <dt className="text-neutral-500">Payment</dt>
          <dd className="max-w-[16rem] text-right text-ink">{paymentLine(item)}</dd>
        </div>
        {statusTag(item) ? (
          <div className="flex items-center justify-between gap-4 py-3.5">
            <dt className="text-neutral-500">Status</dt>
            <dd>{statusTag(item)}</dd>
          </div>
        ) : null}
        {item.note ? (
          <div className="py-3.5">
            <dt className="text-neutral-500">Note</dt>
            <dd className="mt-1 whitespace-pre-line text-ink">{item.note}</dd>
          </div>
        ) : null}
      </dl>
      {!frontDesk && item.payAtShop && item.status === "confirmed" && !canNoShowOnline ? (
        <p className="mt-4 text-[13px] leading-5 text-neutral-500">
          If they don&apos;t show, you can charge the no-show fee from here {NO_SHOW_GRACE_MIN} minutes after the start time.
        </p>
      ) : null}
    </Sheet>
  );
}

/* ── New appointment (front desk) ────────────────────────────────────────── */

function NewAppointmentSheet({
  draft,
  team,
  services,
  busy,
  run,
  setNotice,
  onClose,
  onSaved,
}: {
  draft: { pro: string; date: string; start: string } | null;
  team: TeamMember[];
  services: Record<string, ServiceOption[]>;
  busy: string | null;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onClose: () => void;
  onSaved: (message: string, date: string) => void;
}) {
  return (
    <Sheet
      open={!!draft}
      onClose={onClose}
      title="New appointment"
      description="For walk-ins and phone bookings, paid at the shop. Online clients can't book over it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-appointment" loading={busy === "front-desk"}>
            Book it
          </Button>
        </>
      }
    >
      {draft ? (
        <NewAppointmentForm
          key={`${draft.pro}-${draft.date}-${draft.start}`}
          draft={draft}
          team={team}
          services={services}
          run={run}
          setNotice={setNotice}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  );
}

function NewAppointmentForm({
  draft,
  team,
  services,
  run,
  setNotice,
  onSaved,
}: {
  draft: { pro: string; date: string; start: string };
  team: TeamMember[];
  services: Record<string, ServiceOption[]>;
  run: SectionProps["run"];
  setNotice: SectionProps["setNotice"];
  onSaved: (message: string, date: string) => void;
}) {
  const [pro, setPro] = useState(draft.pro || (team.length === 1 ? team[0].profileId || "" : ""));
  const [kind, setKind] = useState<"walk_in" | "phone">("walk_in");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [customService, setCustomService] = useState("");
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(draft.start);
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const proServices = services[pro] || [];

  function pickService(id: string) {
    setServiceId(id);
    const svc = proServices.find((s) => s.id === id);
    if (svc) {
      setDuration(String(svc.durationMinutes));
      setPrice(svc.priceCents !== null ? (svc.priceCents / 100).toFixed(2) : "");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pro) {
      setNotice({ tone: "error", text: "Choose who it's with." });
      return;
    }
    const svc = proServices.find((s) => s.id === serviceId);
    const priceNumber = price.trim() === "" ? null : Number(price);
    if (priceNumber !== null && !Number.isFinite(priceNumber)) {
      setNotice({ tone: "error", text: "That price doesn't look right." });
      return;
    }
    await run("front-desk", async () => {
      const res = await studioFetch("/api/studio/front-desk", {
        method: "POST",
        body: {
          professionalId: pro,
          kind,
          clientName,
          clientPhone,
          serviceName: svc ? svc.name : customService.trim(),
          date,
          startTime: start,
          durationMinutes: Number(duration),
          priceCents: priceNumber === null ? null : Math.round(priceNumber * 100),
          note,
        },
      });
      if (!res.ok) {
        setNotice({ tone: "error", text: res.data.error || "Could not book that in." });
        return;
      }
      onSaved(`${clientName} is booked in with ${firstName(team.find((m) => m.profileId === pro)?.name)}.`, date);
    });
  }

  return (
    <form id="new-appointment" onSubmit={submit} className="space-y-5">
      <Segmented
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "walk_in", label: "Walk-in" },
          { value: "phone", label: "Phone booking" },
        ]}
      />

      {team.length > 1 ? (
        <Field label="With" htmlFor="na-pro">
          <select
            id="na-pro"
            required
            value={pro}
            onChange={(e) => {
              setPro(e.target.value);
              setServiceId("");
            }}
            className={fieldClass}
          >
            <option value="">Choose a pro</option>
            {team.map((m) => (
              <option key={m.id} value={m.profileId || ""}>
                {m.name || "Team member"}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" htmlFor="na-client">
          <input
            id="na-client"
            required
            maxLength={80}
            autoComplete="off"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="Phone" htmlFor="na-phone" optional>
          <input
            id="na-phone"
            type="tel"
            maxLength={30}
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Service" htmlFor="na-service">
        {proServices.length ? (
          <select id="na-service" value={serviceId} onChange={(e) => pickService(e.target.value)} className={fieldClass}>
            <option value="">Something else</option>
            {proServices.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name}
                {svc.priceCents !== null ? `, ${formatCad(svc.priceCents)}` : ""}
              </option>
            ))}
          </select>
        ) : null}
        {!serviceId ? (
          <input
            aria-label="Service name"
            required
            maxLength={120}
            value={customService}
            onChange={(e) => setCustomService(e.target.value)}
            placeholder="e.g. Skin fade"
            className={`${fieldClass} ${proServices.length ? "mt-2" : ""}`}
          />
        ) : null}
      </Field>

      <div className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3">
        <Field label="Date" htmlFor="na-date">
          <input id="na-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Start" htmlFor="na-start">
          <input id="na-start" type="time" required step={300} value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Minutes" htmlFor="na-length">
          <input
            id="na-length"
            type="number"
            required
            min={5}
            max={720}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Price at the shop" htmlFor="na-price" optional>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
          <input
            id="na-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${fieldClass} pl-7`}
          />
        </div>
      </Field>

      <Field label="Note" htmlFor="na-note" optional>
        <input id="na-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
      </Field>
    </form>
  );
}
