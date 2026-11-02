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
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { loginHref, rememberReturnTo } from "@/app/lib/returnTo";
import PaymentModal from "@/app/components/payments/PaymentModal";
import CardSetupModal from "@/app/components/payments/CardSetupModal";
import type { ShopPro } from "./page";

type Busy = { professional_id: string; booking_date: string; start_time: string; end_time: string };

const DAYS_SHOWN = 14;
// Start times on the half hour, plus the moment a pro frees up (so a 15
// minute gap after a booking isn't lost). Fewer, cleaner choices.
const STEP_MIN = 30;

const PERIODS = [
  { key: "morning", label: "Morning", from: 0, to: 12 * 60 },
  { key: "afternoon", label: "Afternoon", from: 12 * 60, to: 17 * 60 },
  { key: "evening", label: "Evening", from: 17 * 60, to: 24 * 60 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];
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
    const candidates = new Set<number>();
    for (let t = Math.ceil(start / STEP_MIN) * STEP_MIN; t <= end; t += STEP_MIN) candidates.add(t);
    candidates.add(start);
    // Right when a booking ends, if that's inside their hours.
    for (const [, be] of taken) if (be > start && be < end) candidates.add(be);
    for (const t of candidates) {
      if (t + minutes > end || t <= earliest) continue;
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

  // Back from signing in: reopen the pro with the time they'd picked.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pro = bookable.find((p) => p.id === params.get("pro"));
    if (!pro) return;
    const day = params.get("day");
    const time = params.get("time");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from the URL
    setOpenId(pro.id);
    setPick({
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
      time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
      serviceId: pro.services.some((s) => s.id === params.get("service")) ? params.get("service") : null,
    });
    window.history.replaceState(null, "", window.location.pathname);
    window.setTimeout(() => document.getElementById(`pro-${pro.id}`)?.scrollIntoView({ block: "start" }), 120);
  }, [bookable]);

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
                onChanged={load}
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
  onChanged,
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
  onChanged: () => void;
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

  // One part of the day at a time: the one with the picked time, the one they
  // chose, or the first with openings.
  const [periodChoice, setPeriodChoice] = useState<PeriodKey | null>(null);
  const byPeriod = PERIODS.map((p) => ({
    ...p,
    times: times.filter((t) => toMin(t) >= p.from && toMin(t) < p.to),
  })).filter((p) => p.times.length > 0);
  const timePeriod = time ? byPeriod.find((p) => p.times.includes(time))?.key : undefined;
  const period =
    byPeriod.find((p) => p.key === periodChoice)?.key || timePeriod || byPeriod[0]?.key || null;
  const shownTimes = byPeriod.find((p) => p.key === period)?.times || [];

  const nextLabel = !pro.canBookOnline
    ? "Book by sending a request"
    : loading
    ? "Checking times…"
    : next && next.length
    ? `Next opening ${next[0].day === today ? "today" : dayName(next[0].day, today).split(",")[0].toLowerCase().replace(/^(\w)/, (c) => c)} at ${time12(next[0].time)}`
    : "No openings in the next two weeks";


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
                    onClick={() => {
                      setPeriodChoice(null);
                      setPick({ day: d, time: null, serviceId: pick.serviceId });
                    }}
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
              <>
              {byPeriod.length > 1 ? (
                <div role="tablist" aria-label="Part of the day" className="mt-2 inline-flex rounded-full bg-ink/[0.06] p-1">
                  {byPeriod.map((p) => {
                    const on = p.key === period;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setPeriodChoice(p.key)}
                        className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                          on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-neutral-500 hover:text-ink"
                        }`}
                      >
                        {p.label}
                        <span className={`ml-1 tabular-nums ${on ? "text-neutral-400" : "text-neutral-400"}`}>{p.times.length}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {shownTimes.map((t) => {
                  const on = t === time;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPick({ day, time: t, serviceId: pick.serviceId })}
                      className={`h-10 rounded-xl text-[13px] font-medium tabular-nums transition-colors sm:text-sm ${
                        on ? "bg-ink text-white" : "shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] hover:shadow-[inset_0_0_0_1.5px_#0a0a0a]"
                      }`}
                    >
                      {time12(t)}
                    </button>
                  );
                })}
              </div>
              </>
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

          <BookingBar pro={pro} service={service} day={day} time={time} today={today} onChanged={onChanged} />
        </div>
      ) : null}
    </li>
  );
}

// The last step, right here: pay now, or (if the shop allows it) save a card
// and pay at the shop. Signed-out visitors sign in and come straight back to
// this time.
function BookingBar({
  pro,
  service,
  day,
  time,
  today,
  onChanged,
}: {
  pro: ShopPro;
  service: ShopPro["services"][number] | null;
  day: string | null;
  time: string | null;
  today: string;
  onChanged: () => void;
}) {
  const [payAtShop, setPayAtShop] = useState<{ shopName: string; feePercent: number } | null>(null);
  const [payLater, setPayLater] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [cardSetup, setCardSetup] = useState<{ clientSecret: string; priceCents: number; noShowFeeCents: number } | null>(null);
  const [booked, setBooked] = useState<{ id: string | null; when: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bookings/pay-at-shop?professionalId=${encodeURIComponent(pro.id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.available) setPayAtShop({ shopName: j.studioName, feePercent: Number(j.noShowFeePercent) || 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pro.id]);

  const ready = !!(day && time && service);
  const when = day && time ? `${dayName(day, today)}, ${time12(time)}` : "";

  async function findBooking(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !day || !time) return null;
    for (let i = 0; i < 12; i += 1) {
      const { data } = await supabase
        .from("bookings")
        .select("id, start_time")
        .eq("customer_id", user.id)
        .eq("professional_id", pro.id)
        .eq("booking_date", day)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(5);
      const hit = (data || []).find((b) => String(b.start_time).slice(0, 5) === time);
      if (hit) return hit.id;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  async function book() {
    if (!ready || working) return;
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const back = `${window.location.pathname}?pro=${pro.id}&day=${day}&time=${time}&service=${service!.id}`;
      rememberReturnTo(back);
      window.location.assign(loginHref(back));
      return;
    }
    const { data: me } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (me?.role && me.role !== "customer" && me.role !== "I am a customer") {
      setMessage("Booking is for client accounts. Sign in with your client account to book.");
      return;
    }

    setWorking(true);
    try {
      const res = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          flowType: "direct_booking",
          professionalId: pro.id,
          serviceId: service!.id,
          date: day,
          startTime: time,
          endTime: fromMin(toMin(time!) + service!.minutes),
          mode: "in_shop",
          ...(payAtShop && payLater ? { payAtShop: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Couldn't book that time. Try another.");
        if (res.status === 409) onChanged();
        setWorking(false);
        return;
      }
      if (data.mode === "setup") {
        setCardSetup({
          clientSecret: data.clientSecret,
          priceCents: Number(data.amountCents) || 0,
          noShowFeeCents: Number(data.noShowFeeCents) || 0,
        });
        return;
      }
      setPaymentSecret(data.clientSecret);
    } catch {
      setMessage("Something went wrong. Try again.");
      setWorking(false);
    }
  }

  async function paid() {
    setPaymentSecret(null);
    setMessage("Payment received. Confirming your booking…");
    const id = await findBooking();
    setWorking(false);
    setMessage("");
    setBooked({ id, when });
    onChanged();
  }

  async function cardSaved(setupIntentId: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/bookings/pay-at-shop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ setupIntentId }),
    });
    const data = await res.json().catch(() => ({}));
    setCardSetup(null);
    setWorking(false);
    if (!res.ok || !data?.bookingId) {
      setMessage(data?.error || "Your card was saved, but we couldn't confirm the booking. Check your Bookings tab.");
      return;
    }
    setBooked({ id: data.bookingId, when });
    onChanged();
  }

  if (booked) {
    return (
      <div className="mt-6 rounded-2xl bg-ink p-5 text-white">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <Check className="h-4 w-4" aria-hidden="true" />
          You&apos;re booked with {pro.name.split(" ")[0]}
        </p>
        <p className="mt-1 text-sm text-white/70">
          {booked.when}
          {service ? `, ${service.name}` : ""}. It&apos;s in your bookings.
        </p>
        <a
          href={booked.id ? `/bookings/${booked.id}` : "/work"}
          className="mt-4 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-ink"
        >
          View booking
        </a>
      </div>
    );
  }

  const price = service?.priceLabel || "";

  return (
    <div className="mt-6 rounded-2xl bg-ink/[0.04] p-3 pl-4">
      {ready && payAtShop ? (
        <div role="radiogroup" aria-label="When to pay" className="mb-3 grid grid-cols-2 gap-2 pr-1 pt-1">
          {[
            { v: false, t: "Pay now", d: "Card, secure checkout" },
            { v: true, t: "Pay at the shop", d: `Card saved for no-shows (${payAtShop.feePercent}% fee)` },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={payLater === o.v}
              onClick={() => setPayLater(o.v)}
              className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                payLater === o.v ? "bg-ink text-white" : "bg-surface text-ink shadow-[inset_0_0_0_1px_rgba(10,10,10,0.1)]"
              }`}
            >
              <span className="block text-sm font-medium">{o.t}</span>
              <span className={`block text-xs ${payLater === o.v ? "text-white/70" : "text-neutral-500"}`}>{o.d}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm">
          {ready ? (
            <>
              <span className="font-semibold">{when}</span>
              <span className="text-neutral-500">
                {" "}
                with {pro.name.split(" ")[0]}, {service!.name}
              </span>
            </>
          ) : (
            <span className="text-neutral-500">{!service ? "Pick a service and a time" : "Pick a time"}</span>
          )}
        </p>
        <button
          type="button"
          onClick={book}
          disabled={!ready || working}
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:bg-ink/10 disabled:text-neutral-400"
        >
          {working ? "One moment…" : !ready ? "Book" : payAtShop && payLater ? "Book" : `Book${price ? ` and pay ${price}` : ""}`}
        </button>
      </div>
      {message ? (
        <p role="alert" className="mt-2 pr-1 text-[13px] text-[#A30D25]">
          {message}
        </p>
      ) : null}

      {paymentSecret ? (
        <PaymentModal
          clientSecret={paymentSecret}
          proName={pro.name}
          title="Confirm your booking"
          subtitle={`${when} with ${pro.name.split(" ")[0]}. Your booking is confirmed as soon as payment goes through.`}
          onClose={() => {
            setPaymentSecret(null);
            setWorking(false);
          }}
          onSuccess={paid}
          redirectTo={null}
        />
      ) : null}
      {cardSetup ? (
        <CardSetupModal
          clientSecret={cardSetup.clientSecret}
          priceCents={cardSetup.priceCents}
          noShowFeeCents={cardSetup.noShowFeeCents}
          shopName={payAtShop?.shopName}
          onClose={() => {
            setCardSetup(null);
            setWorking(false);
          }}
          onSaved={cardSaved}
        />
      ) : null}
    </div>
  );
}
