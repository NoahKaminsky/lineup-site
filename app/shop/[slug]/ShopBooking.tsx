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
import { Check, Star, Users } from "lucide-react";
import { serviceKey, shopMenu } from "@/app/lib/shopMenu";
import { supabase } from "@/lib/supabaseClient";
import { loginHref, rememberReturnTo } from "@/app/lib/returnTo";
import PaymentModal from "@/app/components/payments/PaymentModal";
import CardSetupModal from "@/app/components/payments/CardSetupModal";
import { BookedSheet } from "@/app/components/moments/Moments";
import SplitFlap from "@/app/components/SplitFlap";
import type { ShopPro } from "./page";
import { shopNow } from "@/app/lib/bookingTime";
import { DAYS_SHOWN, PERIODS, addDays, dayName, fromMin, nextDayWord, openTimes, resolveAnyone, time12, toMin, type Busy, type PeriodKey } from "@/app/lib/shopSlots";
import { Photo } from "@/app/components/Photo";
import { buttonClass } from "@/app/components/ui";

type BookingPick = { want: string | null; who: string; day: string | null; time: string | null };

export default function ShopBooking({ pros, slug }: { pros: ShopPro[]; slug: string }) {
  const bookable = useMemo(() => pros.filter((p) => p.canBookOnline), [pros]);
  const [today, setToday] = useState(() => shopNow().dateKey);
  const [busy, setBusy] = useState<Busy[] | null>(bookable.length ? null : []);
  const menu = useMemo(() => shopMenu(bookable), [bookable]);
  // One thing on the menu: it's already chosen.
  const [pick, setPick] = useState<BookingPick>(() => ({ want: menu.length === 1 ? menu[0].key : null, who: "any", day: null, time: null }));
  const [periodChoice, setPeriodChoice] = useState<PeriodKey | null>(null);

  const load = useCallback(async () => {
    if (!bookable.length) return;
    const from = shopNow().dateKey;
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

  // Back from signing in: put back the service, pro and time they'd picked.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pro = bookable.find((p) => p.id === params.get("pro"));
    if (!pro) return;
    const service = pro.services.find((s) => s.id === params.get("service"));
    const day = params.get("day");
    const time = params.get("time");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from the URL
    setPick({
      want: service ? serviceKey(service.name) : null,
      who: pro.id,
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
      time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
    });
    window.history.replaceState(null, "", window.location.pathname);
    window.setTimeout(() => document.getElementById("step-when")?.scrollIntoView({ block: "start" }), 120);
  }, [bookable]);

  const serviceFor = useCallback(
    (pro: ShopPro) => (pick.want ? pro.services.find((s) => serviceKey(s.name) === pick.want) || null : null),
    [pick.want]
  );
  const minutesFor = useCallback((pro: ShopPro) => serviceFor(pro)?.minutes || pro.defaultMinutes, [serviceFor]);
  // Pros who do what they picked (everyone, before they pick).
  const able = useMemo(() => (pick.want ? bookable.filter((p) => serviceFor(p)) : bookable), [bookable, pick.want, serviceFor]);
  const chosenPro = useMemo(() => (pick.who === "any" ? null : able.find((p) => p.id === pick.who) || null), [able, pick.who]);
  const candidates = useMemo(() => (chosenPro ? [chosenPro] : able), [chosenPro, able]);

  // Each pro's next opening, for "Who with?".
  const nextFor = useMemo(() => {
    const map: Record<string, { day: string; time: string } | null> = {};
    if (!busy) return map;
    for (const pro of able) {
      map[pro.id] = null;
      for (const day of days) {
        const t = openTimes(pro, busy, day, minutesFor(pro), today)[0];
        if (t) {
          map[pro.id] = { day, time: t };
          break;
        }
      }
    }
    return map;
  }, [able, busy, days, today, minutesFor]);
  const soonestAny = Object.values(nextFor)
    .filter(Boolean)
    .sort((a, b) => (a!.day + a!.time).localeCompare(b!.day + b!.time))[0] as { day: string; time: string } | undefined;

  // Open times per day across whoever they're booking with.
  const perDay = useMemo(() => {
    if (!busy || !pick.want) return {} as Record<string, string[]>;
    return Object.fromEntries(
      days.map((d) => [d, [...new Set(candidates.flatMap((p) => openTimes(p, busy, d, minutesFor(p), today)))].sort()])
    ) as Record<string, string[]>;
  }, [busy, pick.want, days, candidates, minutesFor, today]);
  const day = pick.day && perDay[pick.day]?.length ? pick.day : days.find((d) => perDay[d]?.length) || null;
  const times = day ? perDay[day] || [] : [];
  const time = pick.time && times.includes(pick.time) ? pick.time : null;
  const byPeriod = PERIODS.map((p) => ({ ...p, times: times.filter((t) => toMin(t) >= p.from && toMin(t) < p.to) })).filter((p) => p.times.length);
  const timePeriod = time ? byPeriod.find((p) => p.times.includes(time))?.key : undefined;
  const period = byPeriod.find((p) => p.key === periodChoice)?.key || timePeriod || byPeriod[0]?.key || null;
  const shownTimes = byPeriod.find((p) => p.key === period)?.times || [];

  // Who actually takes the booking, and for which of their services.
  const bookingPro = day && time ? chosenPro || (busy ? resolveAnyone(able, busy, day, time, minutesFor, today) : null) : null;
  const bookingService = bookingPro ? serviceFor(bookingPro) : null;
  const wantItem = menu.find((m) => m.key === pick.want) || null;

  function scrollTo(id: string) {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  if (pros.length === 0) {
    return (
      <p className="rounded-2xl bg-surface p-6 text-sm text-neutral-600 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
        The team is still getting set up. Check back soon.
      </p>
    );
  }

  const offline = pros.filter((p) => !p.canBookOnline);

  return (
    <div className="space-y-3">
      {/* 1. What */}
      <Step
        id="step-what"
        n={1}
        title="What would you like?"
        done={wantItem ? `${wantItem.name}${wantItem.from !== null ? ` · from $${fmtPrice(wantItem.from)}` : ""}` : null}
        onChange={menu.length > 1 ? () => setPick((p) => ({ ...p, want: null, day: null, time: null })) : undefined}
      >
        {menu.length ? (
          <div role="radiogroup" aria-label="Services" className="grid gap-2 sm:grid-cols-2">
            {menu.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={pick.want === m.key}
                onClick={() => {
                  setPick((p) => ({ ...p, want: m.key, time: null, who: p.who !== "any" && !bookable.find((b) => b.id === p.who)?.services.some((s) => serviceKey(s.name) === m.key) ? "any" : p.who }));
                  scrollTo("step-when");
                }}
                className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl bg-ink/[0.035] px-4 py-3 text-left transition-colors hover:bg-ink/[0.07]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{m.name}</span>
                  {m.minutes ? <span className="block text-[13px] text-neutral-500">{m.minutes} min</span> : null}
                </span>
                {m.from !== null ? <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">${fmtPrice(m.from)}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No one takes online bookings yet. Message a pro from their profile below.</p>
        )}
      </Step>

      {/* 2. Who */}
      <Step
        id="step-who"
        n={2}
        title="Who with?"
        locked={!pick.want}
        done={pick.want ? (chosenPro ? chosenPro.name : "Anyone") : null}
        keepOpen
      >
        <div role="radiogroup" aria-label="Who with" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <WhoChip
            on={pick.who === "any"}
            onClick={() => setPick((p) => ({ ...p, who: "any", time: null }))}
            title="Anyone"
            sub={busy === null ? "Checking…" : soonestAny ? `Soonest: ${whenShort(soonestAny, today)}` : "No openings"}
            avatar={
              <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-full ${pick.who === "any" ? "bg-white/15 text-white" : "bg-ink/[0.06] text-ink"}`}>
                <Users className="h-5 w-5" strokeWidth={1.8} />
              </span>
            }
          />
          {able.map((pro) => (
            <WhoChip
              key={pro.id}
              on={pick.who === pro.id}
              onClick={() => setPick((p) => ({ ...p, who: pro.id, time: null }))}
              title={pro.name}
              rating={pro.rating}
              sub={busy === null ? "Checking…" : nextFor[pro.id] ? `Next: ${whenShort(nextFor[pro.id]!, today)}` : "No openings"}
              avatar={<Avatar pro={pro} size={44} />}
            />
          ))}
        </div>
      </Step>

      {/* 3. When */}
      <Step id="step-when" n={3} title="When?" locked={!pick.want} done={day && time ? `${dayName(day, today)}, ${time12(time)}` : null} keepOpen>
        {busy === null ? (
          <div aria-hidden="true" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : !day ? (
          <p className="text-sm text-neutral-500">
            No openings in the next two weeks{chosenPro ? ` with ${firstName(chosenPro.name)}` : ""}.{" "}
            {chosenPro ? (
              <a href={chosenPro.href} className="font-medium text-ink underline underline-offset-4">
                Send a request
              </a>
            ) : null}
          </p>
        ) : (
          <>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                      setPick((p) => ({ ...p, day: d, time: null }));
                    }}
                    className={`flex w-[52px] shrink-0 flex-col items-center rounded-2xl py-2.5 transition-colors disabled:cursor-not-allowed ${
                      on ? "bg-ink text-white" : has ? "bg-ink/[0.035] text-ink hover:bg-ink/[0.08]" : "text-neutral-300"
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${on ? "text-white/70" : has ? "text-neutral-500" : ""}`}>
                      {d === today ? "Today" : date.toLocaleDateString("en-CA", { weekday: "short" })}
                    </span>
                    <span className="mt-0.5 text-[17px] font-semibold tabular-nums">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
            {byPeriod.length > 1 ? (
              <div role="tablist" aria-label="Part of the day" className="mt-4 inline-flex rounded-full bg-ink/[0.06] p-1">
                {byPeriod.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="tab"
                    aria-selected={p.key === period}
                    onClick={() => setPeriodChoice(p.key)}
                    className={`h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                      p.key === period ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-neutral-500 hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div role="radiogroup" aria-label="Times" className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {shownTimes.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={t === time}
                  onClick={() => {
                    setPick((p) => ({ ...p, day, time: t }));
                    scrollTo("step-book");
                  }}
                  className={`h-11 rounded-xl text-[13px] font-semibold tabular-nums transition-colors sm:text-sm ${
                    t === time ? "bg-ink text-white" : "bg-surface shadow-[inset_0_0_0_1px_rgba(10,10,10,0.1)] hover:shadow-[inset_0_0_0_1.5px_#0a0a0a]"
                  }`}
                >
                  {time12(t)}
                </button>
              ))}
            </div>
          </>
        )}
      </Step>

      {/* 4. Book */}
      <Step id="step-book" n={4} title="Confirm and pay" locked={!bookingPro || !bookingService} keepOpen>
        {bookingPro && bookingService && day && time ? (
          <BookingBar key={`${bookingPro.id}-${day}-${time}`} pro={bookingPro} service={bookingService} day={day} time={time} today={today} slug={slug} onChanged={load} />
        ) : null}
      </Step>

      {offline.length ? (
        <p className="px-1 pt-3 text-[13px] text-neutral-500">
          Also here:{" "}
          {offline.map((p, i) => (
            <span key={p.id}>
              {i ? ", " : ""}
              <a href={p.href} className="font-medium text-ink underline underline-offset-4">
                {p.name}
              </a>
            </span>
          ))}
          . Book them by sending a request.
        </p>
      ) : null}

    </div>
  );
}

function fmtPrice(n: number) {
  return n % 1 ? n.toFixed(2) : String(n);
}
function firstName(name: string) {
  return name.split(" ")[0];
}
function whenShort(s: { day: string; time: string }, today: string) {
  return `${s.day === today ? "today" : nextDayWord(dayName(s.day, today).split(",")[0])} ${time12(s.time)}`;
}

// One numbered step. Locked until the one before is done; a finished step
// shows what was picked, with Change.
function Step({
  id,
  n,
  title,
  done,
  locked = false,
  keepOpen = false,
  onChange,
  children,
}: {
  id: string;
  n: number;
  title: string;
  done?: string | null;
  locked?: boolean;
  keepOpen?: boolean;
  onChange?: () => void;
  children: React.ReactNode;
}) {
  const collapsed = !!done && !keepOpen;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-28 rounded-3xl bg-surface transition-opacity duration-300 ${
        locked ? "opacity-50 shadow-[0_0_0_1px_rgba(10,10,10,0.05)]" : "shadow-[0_0_0_1px_rgba(10,10,10,0.07),0_12px_32px_-24px_rgba(0,0,0,0.25)]"
      }`}
    >
      <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
            done ? "bg-ink text-white" : "bg-ink/[0.06] text-neutral-500"
          }`}
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {title}
          </h2>
          {done ? <p className="truncate text-[13px] text-neutral-500">{done}</p> : null}
        </div>
        {collapsed && onChange ? (
          <button type="button" onClick={onChange} className="h-10 shrink-0 rounded-full px-3 text-[13px] font-medium text-neutral-600 hover:text-ink">
            Change
          </button>
        ) : null}
      </div>
      {!locked && !collapsed ? <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div> : <div className="pb-5" />}
    </section>
  );
}

function WhoChip({
  on,
  onClick,
  title,
  sub,
  avatar,
  rating,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  avatar: React.ReactNode;
  rating?: number | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-[168px] shrink-0 flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left transition ${
        on ? "bg-ink text-white" : "bg-ink/[0.035] text-ink hover:bg-ink/[0.07]"
      }`}
    >
      {avatar}
      <span className="w-full min-w-0">
        <span className="flex items-center gap-1 text-[14px] font-semibold">
          <span className="truncate">{title}</span>
          {rating ? (
            <span className={`ml-auto flex shrink-0 items-center gap-0.5 text-[12px] tabular-nums ${on ? "text-white/80" : "text-neutral-600"}`}>
              <Star className={`h-3 w-3 ${on ? "fill-white text-white" : "fill-ink text-ink"}`} aria-hidden="true" />
              {rating.toFixed(1)}
            </span>
          ) : null}
        </span>
        <span className={`mt-0.5 block truncate text-[12px] ${on ? "text-white/65" : "text-neutral-500"}`}>{sub}</span>
      </span>
    </button>
  );
}

function Avatar({ pro, size }: { pro: ShopPro; size: number }) {
  return pro.avatarUrl ? (
    <Photo src={pro.avatarUrl} width={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
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

// The last step, right here: pay now, or (if the shop allows it) save a card
// and pay at the shop. Signed-out visitors sign in and come straight back to
// this time.
function BookingBar({
  pro,
  service,
  day,
  time,
  today,
  slug,
  onChanged,
}: {
  pro: ShopPro;
  service: ShopPro["services"][number] | null;
  day: string | null;
  time: string | null;
  today: string;
  slug: string;
  onChanged: () => void;
}) {
  const [payAtShop, setPayAtShop] = useState<{ shopName: string; feePercent: number } | null>(null);
  const [payLater, setPayLater] = useState(false);
  // The client's membership at this shop, when it still has visits left this
  // period. Their booking is "covered": no payment, a card held only for
  // no-shows (the pay-at-the-shop flow).
  const [membership, setMembership] = useState<{ planName: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [cardSetup, setCardSetup] = useState<{ clientSecret: string; priceCents: number; noShowFeeCents: number } | null>(null);
  const [booked, setBooked] = useState<{ id: string | null; when: string } | null>(null);
  const [bookedSeen, setBookedSeen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/memberships?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      type Mine = { planName: string; status: string; visitsUsed: number; visitsIncluded: number | null };
      const usable = ((j?.mine || []) as Mine[]).find(
        (m) => m.status !== "past_due" && (m.visitsIncluded === null || m.visitsUsed < m.visitsIncluded)
      );
      if (!cancelled && usable) {
        setMembership({ planName: usable.planName });
        setPayLater(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const covered = !!(membership && payAtShop);
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
      setMessage("That didn't go through. Try again.");
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
      <>
        <div className="rounded-2xl bg-ink/[0.04] p-4 text-sm text-neutral-600">
          Booked for {booked.when}.{" "}
          <a href={booked.id ? `/bookings/${booked.id}` : "/work"} className="font-medium text-ink underline underline-offset-4">
            View booking
          </a>
        </div>
        {!bookedSeen ? (
          <BookedSheet
            ticket={{
              day: day ? dayName(day, today) : "",
              time: time ? time12(time) : "",
              line: `${service?.name || "Appointment"} with ${pro.name.split(" ")[0]}`,
            }}
            rows={covered && payLater ? [{ label: "Paid by", value: membership!.planName }] : []}
            note="It's in your Bookings. Cancel free until 24 hours before."
          >
            <a
              href={booked.id ? `/bookings/${booked.id}` : "/work"}
              className={buttonClass("primary", "md")}
            >
              View booking
            </a>
            <button
              type="button"
              onClick={() => setBookedSeen(true)}
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-neutral-500 transition hover:text-ink"
            >
              Done
            </button>
          </BookedSheet>
        ) : null}
      </>
    );
  }

  const price = service?.priceLabel || "";

  return (
    <div className="relative">
      {ready ? (
        <>
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-neutral-500">{dayName(day!, today)}</p>
              <div className="mt-2 flex items-end gap-1.5">
                <SplitFlap text={time12(time!).replace(/(am|pm)$/i, "")} className="text-[2.1rem] font-semibold" />
                <span className="mb-1 text-sm font-semibold text-neutral-500">{/pm$/i.test(time12(time!)) ? "PM" : "AM"}</span>
              </div>
              <p className="mt-3 truncate text-[15px] font-medium">
                {service!.name}
                <span className="font-normal text-neutral-500"> with {pro.name.split(" ")[0]}</span>
              </p>
            </div>
            {price && !(covered && payLater) ? <span className="shrink-0 text-lg font-semibold tabular-nums">{price}</span> : null}
          </div>

          {payAtShop ? (
            <div role="radiogroup" aria-label="When to pay" className="relative mt-5 grid grid-cols-2 gap-2">
              {[
                { v: false, t: "Pay now", d: "Secure checkout" },
                covered
                  ? { v: true, t: "Membership", d: membership!.planName }
                  : { v: true, t: "Pay at the shop", d: `Card held for no-shows` },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  role="radio"
                  aria-checked={payLater === o.v}
                  onClick={() => setPayLater(o.v)}
                  className={`rounded-2xl px-3 py-2.5 text-left transition ${
                    payLater === o.v ? "bg-ink text-white" : "bg-neutral-50 text-ink ring-1 ring-inset ring-ink/[0.07] hover:bg-neutral-100"
                  }`}
                >
                  <span className="block text-sm font-semibold">{o.t}</span>
                  <span className={`block truncate text-xs ${payLater === o.v ? "text-white/60" : "text-neutral-500"}`}>{o.d}</span>
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={book}
            disabled={working}
            className="relative mt-4 flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60"
          >
            {working
              ? "One moment…"
              : covered && payLater
                ? "Book with membership"
                : payAtShop && payLater
                  ? "Hold my spot"
                  : `Book${price ? ` and pay ${price}` : ""}`}
          </button>
          {payAtShop && payLater && !covered ? (
            <p className="relative mt-2.5 text-center text-xs text-neutral-500">
              Nothing charged today. {payAtShop.feePercent}% fee only if you don&apos;t show.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-neutral-500">{!service ? "Pick a service and a time." : "Pick a time."}</p>
      )}
      {message ? (
        <p role="alert" className="relative mt-2 text-[13px] text-[#A30D25]">
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
          coveredBy={covered ? membership!.planName : null}
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
