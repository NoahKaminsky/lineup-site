"use client";

// Booking on a shop's page. The client sees the soonest openings across the
// team, then picks a pro: their services, the next two weeks (days with no
// openings greyed out) and the open times for the day they choose. Picking a
// time hands off to the pro's own calendar with it selected, where they sign
// in, pay (or choose to pay at the shop) and confirm.
//
// Times come from each pro's own weekly hours minus everything already on
// their calendar: online bookings, front-desk walk-ins and phone-ins, and
// time off. It refreshes every minute and whenever the tab comes back, so
// the shop's day fills in as people book. The server still checks for
// clashes at payment, and the database refuses two bookings that overlap.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import type { ShopPro } from "./page";

type Busy = { professional_id: string; booking_date: string; start_time: string; end_time: string };

const DAYS_SHOWN = 14;
const STEP_MIN = 15;
const LEAD_MIN = 15; // never offer a time starting in the next 15 minutes

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
function toMin(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function fromMin(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
}
function dayName(key: string, today: string) {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" });
}

// Open start times for one pro on one day, for an appointment this long.
function openTimes(pro: ShopPro, busy: Busy[], day: string, minutes: number, today: string) {
  const offset = Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  if (offset < 0 || offset >= pro.bookingWindowDays) return [];
  const windows = pro.hours[new Date(`${day}T00:00:00`).getDay()] || [];
  const taken = busy
    .filter((b) => b.professional_id === pro.id && b.booking_date === day)
    .map((b) => [toMin(b.start_time), b.end_time.startsWith("24") ? 24 * 60 : toMin(b.end_time)] as const);
  const now = new Date();
  const earliest = day === today ? now.getHours() * 60 + now.getMinutes() + LEAD_MIN : -1;
  const out: string[] = [];
  for (const [ws, we] of windows) {
    const start = toMin(ws);
    const end = toMin(we);
    for (let t = Math.ceil(start / STEP_MIN) * STEP_MIN; t + minutes <= end; t += STEP_MIN) {
      if (t <= earliest) continue;
      if (taken.some(([bs, be]) => t < be && t + minutes > bs)) continue;
      out.push(fromMin(t));
    }
  }
  return [...new Set(out)].sort();
}

export default function ShopBooking({ pros }: { pros: ShopPro[] }) {
  const bookable = useMemo(() => pros.filter((p) => p.canBookOnline), [pros]);
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [busy, setBusy] = useState<Busy[] | null>(bookable.length ? null : []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pick, setPick] = useState<{ day: string | null; time: string | null; serviceId: string | null }>({
    day: null,
    time: null,
    serviceId: null,
  });

  const load = useCallback(async () => {
    if (!bookable.length) return;
    const from = dateKey(new Date());
    setToday(from);
    try {
      const res = await fetch(
        `/api/professional/busy-times?ids=${bookable.map((p) => p.id).join(",")}&from=${from}&to=${addDays(from, DAYS_SHOWN - 1)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok) setBusy(data.busy || []);
      else setBusy((b) => b || []);
    } catch {
      setBusy((b) => b || []);
    }
  }, [bookable]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the network
    load();
    const t = window.setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today]);

  // Each bookable pro's first openings, at their shortest service.
  const nextFor = useMemo(() => {
    const map: Record<string, { day: string; time: string }[]> = {};
    if (!busy) return map;
    for (const pro of bookable) {
      const list: { day: string; time: string }[] = [];
      for (const day of days) {
        for (const time of openTimes(pro, busy, day, pro.defaultMinutes, today)) {
          list.push({ day, time });
          if (list.length >= 3) break;
        }
        if (list.length >= 3) break;
      }
      map[pro.id] = list;
    }
    return map;
  }, [bookable, busy, days, today]);

  const soonest = useMemo(
    () =>
      bookable
        .flatMap((p) => (nextFor[p.id] || []).slice(0, 2).map((s) => ({ ...s, pro: p })))
        .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
        .slice(0, 6),
    [bookable, nextFor]
  );

  function openPro(pro: ShopPro, day: string | null = null, time: string | null = null) {
    setOpenId(pro.id);
    setPick({ day, time, serviceId: pro.services.length === 1 ? pro.services[0].id : null });
    window.setTimeout(() => {
      document.getElementById(`pro-${pro.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  return (
    <div className="mt-10">
      {bookable.length && soonest.length ? (
        <section aria-labelledby="soonest">
          <h2 id="soonest" className="text-[15px] font-semibold">
            Soonest openings
          </h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {soonest.map((s) => (
              <button
                key={`${s.pro.id}-${s.day}-${s.time}`}
                type="button"
                onClick={() => openPro(s.pro, s.day, s.time)}
                className="shrink-0 rounded-2xl bg-surface px-4 py-3 text-left shadow-[0_0_0_1px_rgba(10,10,10,0.08)] transition-shadow hover:shadow-[0_0_0_1.5px_#0a0a0a]"
              >
                <span className="block text-sm font-semibold tabular-nums">
                  {s.day === today ? "" : `${dayName(s.day, today).split(",")[0]} `}
                  {time12(s.time)}
                </span>
                <span className="mt-0.5 block text-[13px] text-neutral-500">with {s.pro.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="team" className={bookable.length && soonest.length ? "mt-9" : ""}>
        <h2 id="team" className="text-[15px] font-semibold">
          Choose who you&apos;d like to see
        </h2>
        {pros.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-surface p-6 text-sm text-neutral-600 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
            The team is still getting set up. Check back soon.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pros.map((pro) => (
              <ProCard
                key={pro.id}
                pro={pro}
                open={openId === pro.id}
                next={nextFor[pro.id]}
                loading={busy === null}
                today={today}
                days={days}
                busy={busy || []}
                pick={openId === pro.id ? pick : { day: null, time: null, serviceId: null }}
                setPick={setPick}
                onToggle={() => (openId === pro.id ? setOpenId(null) : openPro(pro))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Avatar({ pro, size }: { pro: ShopPro; size: number }) {
  return pro.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={pro.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-neutral-100 font-semibold text-neutral-500"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {pro.name.charAt(0).toUpperCase()}
    </span>
  );
}

function ProCard({
  pro,
  open,
  next,
  loading,
  today,
  days,
  busy,
  pick,
  setPick,
  onToggle,
}: {
  pro: ShopPro;
  open: boolean;
  next: { day: string; time: string }[] | undefined;
  loading: boolean;
  today: string;
  days: string[];
  busy: Busy[];
  pick: { day: string | null; time: string | null; serviceId: string | null };
  setPick: (p: { day: string | null; time: string | null; serviceId: string | null }) => void;
  onToggle: () => void;
}) {
  const service = pro.services.find((s) => s.id === pick.serviceId) || null;
  const minutes = service?.minutes || pro.defaultMinutes;

  const perDay = useMemo(
    () => (open ? Object.fromEntries(days.map((d) => [d, openTimes(pro, busy, d, minutes, today)])) : {}),
    [open, days, pro, busy, minutes, today]
  );
  const day = pick.day && perDay[pick.day]?.length ? pick.day : days.find((d) => perDay[d]?.length) || null;
  const times = day ? perDay[day] || [] : [];
  // A time that's no longer free (someone booked it, or the service is longer) drops out.
  const time = pick.time && times.includes(pick.time) ? pick.time : null;

  const nextLabel = !pro.canBookOnline
    ? "Book by sending a request"
    : loading
    ? "Checking times…"
    : next && next.length
    ? `Next opening ${next[0].day === today ? "today" : dayName(next[0].day, today).split(",")[0].toLowerCase().replace(/^(\w)/, (c) => c)} at ${time12(next[0].time)}`
    : "No openings in the next two weeks";

  const bookHref =
    day && time
      ? `${pro.href}?book=${day}T${time}${service ? `&service=${service.id}` : ""}#availability`
      : null;

  return (
    <li
      id={`pro-${pro.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-2xl bg-surface transition-shadow ${
        open ? "shadow-[0_0_0_1.5px_#0a0a0a,0_16px_40px_-20px_rgba(0,0,0,0.35)]" : "shadow-[0_0_0_1px_rgba(10,10,10,0.08)]"
      }`}
    >
      {pro.canBookOnline ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
          <Avatar pro={pro} size={52} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="truncate">{pro.name}</span>
              <ShieldCheck className="h-4 w-4 shrink-0" aria-label="Verified" />
            </span>
            {pro.professions.length ? <span className="block truncate text-[13px] text-neutral-500">{pro.professions.join(", ")}</span> : null}
            <span className="mt-1 block text-[13px] font-medium text-ink">{nextLabel}</span>
          </span>
          <span
            className={`hidden h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium sm:inline-flex ${
              open ? "bg-ink/[0.06] text-ink" : "bg-ink text-white"
            }`}
          >
            {open ? "Close" : "See times"}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform sm:hidden ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <Avatar pro={pro} size={52} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="truncate">{pro.name}</span>
              <ShieldCheck className="h-4 w-4 shrink-0" aria-label="Verified" />
            </span>
            {pro.professions.length ? <span className="block truncate text-[13px] text-neutral-500">{pro.professions.join(", ")}</span> : null}
            <span className="mt-1 block text-[13px] text-neutral-500">{nextLabel}</span>
          </span>
          <a href={pro.href} className="inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium shadow-[inset_0_0_0_1px_rgba(10,10,10,0.14)] hover:bg-neutral-50">
            Profile
          </a>
        </div>
      )}

      {open ? (
        <div className="border-t border-hairline px-4 pb-5 pt-4 sm:px-5">
          {pro.services.length ? (
            <fieldset>
              <legend className="text-[13px] font-medium text-neutral-500">Service</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {pro.services.map((s) => {
                  const on = s.id === pick.serviceId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPick({ day, time: null, serviceId: s.id })}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left text-sm transition-colors ${
                        on ? "bg-ink text-white" : "bg-ink/[0.04] text-ink hover:bg-ink/[0.07]"
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      <span className={`shrink-0 tabular-nums ${on ? "text-white/70" : "text-neutral-500"}`}>
                        {[s.priceLabel, `${s.minutes} min`].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className={pro.services.length ? "mt-5" : ""}>
            <p className="text-[13px] font-medium text-neutral-500">Day</p>
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map((d) => {
                const has = (perDay[d] || []).length > 0;
                const on = d === day;
                const date = new Date(`${d}T00:00:00`);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!has}
                    aria-pressed={on}
                    aria-label={`${dayName(d, today)}${has ? "" : ", no openings"}`}
                    onClick={() => setPick({ day: d, time: null, serviceId: pick.serviceId })}
                    className={`flex w-14 shrink-0 flex-col items-center rounded-xl py-2 transition-colors disabled:cursor-not-allowed ${
                      on ? "bg-ink text-white" : has ? "bg-ink/[0.04] text-ink hover:bg-ink/[0.08]" : "text-neutral-300"
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${on ? "text-white/70" : has ? "text-neutral-500" : ""}`}>
                      {d === today ? "Today" : date.toLocaleDateString("en-CA", { weekday: "short" })}
                    </span>
                    <span className="mt-0.5 text-base font-semibold tabular-nums">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[13px] font-medium text-neutral-500">
              {day ? `${dayName(day, today)}${service ? `, ${service.minutes} min` : ""}` : "Time"}
            </p>
            {times.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {times.map((t) => {
                  const on = t === time;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPick({ day, time: t, serviceId: pick.serviceId })}
                      className={`h-11 rounded-xl text-sm font-medium tabular-nums transition-colors ${
                        on ? "bg-ink text-white" : "shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] hover:shadow-[inset_0_0_0_1.5px_#0a0a0a]"
                      }`}
                    >
                      {time12(t)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">
                No openings in the next two weeks{service ? " for this service" : ""}. Try{" "}
                <a href={pro.href} className="font-medium text-ink underline underline-offset-4">
                  their profile
                </a>{" "}
                to send a request.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] p-3 pl-4">
            <p className="min-w-0 text-sm">
              {time && day ? (
                <>
                  <span className="font-semibold">
                    {dayName(day, today)}, {time12(time)}
                  </span>
                  <span className="text-neutral-500">
                    {" "}
                    with {pro.name.split(" ")[0]}
                    {service ? `, ${service.name}${service.priceLabel ? ` ${service.priceLabel}` : ""}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-neutral-500">
                  {pro.services.length && !service ? "Pick a service and a time" : "Pick a time"}
                </span>
              )}
            </p>
            {bookHref && (service || !pro.services.length) ? (
              <a
                href={bookHref}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : (
              <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-ink/10 px-5 text-sm font-medium text-neutral-400">
                Continue
              </span>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
