"use client";

// Today: the front desk. What's next, who's free right now (one tap to book
// a walk-in with them), and the client requests waiting for an offer. Until
// the shop is fully set up, the few steps left sit at the top.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { formatCad, studioFetch } from "./studioApi";
import { useStudio } from "./StudioContext";
import { AppointmentSheet, NewAppointmentSheet } from "./Schedule";
import { RequestRow, useShopRequests } from "./Requests";
import { Avatar, Button, Tag, buttonClass, panelClass } from "./ui";
import {
  firstName,
  fromDateKey,
  isBookable,
  localDateKey,
  nextQuarterHour,
  time12,
  toMinutes,
  type ScheduleItem,
  type TeamMember,
} from "./types";
import { shopNow } from "@/app/lib/bookingTime";

type Hours = Record<string, Record<number, [string, string][]>>;
type TimeOff = Record<string, { start: string; end: string }[]>;

function nowMinutes() {
  return shopNow().minutes;
}

export default function TodayView() {
  const { data, busy, run, setNotice, openPlans } = useStudio();
  const studio = data.studio!;
  const me = data.me!;
  const team = useMemo(() => (data.team || []).filter(isBookable), [data.team]);
  const myProfileId = me.profileId || null;
  const visibleTeam = me.canManage ? team : team.filter((m) => m.profileId === myProfileId);

  const today = localDateKey(new Date());
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [hours, setHours] = useState<Hours>({});
  const [timeOff, setTimeOff] = useState<TimeOff>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState<ScheduleItem | null>(null);
  const [draft, setDraft] = useState<{ pro: string; date: string; start: string } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    studioFetch<{ items: ScheduleItem[]; hours: Hours; timeOff: TimeOff }>(`/api/studio/schedule?from=${today}&to=${today}`).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
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
  }, [today, refreshKey]);

  // Keep "free now" and "up next" honest as the day moves.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const { requests, refresh: refreshRequests } = useShopRequests();

  const now = nowMinutes();
  const todays = (items || []).filter((i) => i.date === today && i.status !== "cancelled");
  // A pro's own work away from the shop still makes them busy on the floor,
  // but isn't part of the shop's day.
  const live = todays.filter((i) => i.status !== "no_show" && i.source !== "independent");
  const upNext = live.filter((i) => i.status !== "completed" && toMinutes(i.end) > now);
  const doneCount = live.length - upNext.length;
  const walkIns = live.filter((i) => i.kind !== "online").length;
  const toCollect = live.filter((i) => (i.kind !== "online" || i.payAtShop) && i.status !== "completed").reduce((s, i) => s + (i.priceCents || 0), 0);
  const waitingRequests = (requests || []).filter((r) => !r.offers.some((o) => o.status === "pending" || o.status === "accepted"));

  const canBook = studio.live;
  const bookable = me.canManage ? team : team.filter((m) => m.profileId === myProfileId);

  function newAppointment(pro = "") {
    setDraft({ pro: pro || (bookable.length === 1 ? bookable[0].profileId! : ""), date: today, start: nextQuarterHour() });
  }

  const summary = items === null
    ? "Loading today…"
    : live.length === 0
    ? "Nothing booked yet today."
    : `${live.length} ${live.length === 1 ? "appointment" : "appointments"}${walkIns ? `, ${walkIns} ${walkIns === 1 ? "walk-in" : "walk-ins"}` : ""}${
        toCollect ? `. ${formatCad(toCollect)} to collect at the shop` : ""
      }.`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] text-ink">
            {fromDateKey(today).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <p className="mt-1 text-sm text-neutral-500" aria-live="polite">
            {summary}
          </p>
        </div>
        {canBook && bookable.length ? (
          <Button variant="primary" onClick={() => newAppointment()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New appointment
          </Button>
        ) : null}
      </div>

      {me.canManage ? <SetupSteps openPlans={openPlans} /> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Up next */}
        <section aria-labelledby="up-next" className={panelClass}>
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h3 id="up-next" className="text-[15px] font-semibold text-ink">
              Up next
            </h3>
            <Link href={me.canManage ? "/studio/calendar" : "/calendar"} className="text-[13px] font-medium text-neutral-500 hover:text-ink">
              Calendar
            </Link>
          </div>
          {items === null ? (
            <p className="px-5 pb-6 pt-2 text-sm text-neutral-500">Loading…</p>
          ) : upNext.length === 0 ? (
            <div className="px-5 pb-6 pt-2">
              <p className="text-sm text-neutral-500">
                {live.length ? "That's everyone for today." : visibleTeam.length ? "No appointments yet today." : "Once your pros join, their day shows up here."}
              </p>
            </div>
          ) : (
            <>
            {(() => {
              // The very next chair, as a ticket.
              const i = upNext[0];
              const pro = team.find((m) => m.profileId === i.professionalId) || null;
              const inProgress = toMinutes(i.start) <= now;
              return (
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="relative block w-full overflow-hidden rounded-[22px] bg-ink p-5 text-left text-white transition active:scale-[0.995]"
                  >
                    <span aria-hidden="true" className="lu-glow pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#C8102E]/30 blur-3xl" />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium ring-1 ring-white/10">
                        <span className="lu-pulse-dot h-1.5 w-1.5 rounded-full bg-[#ff4d63]" />
                        {inProgress ? `In the chair until ${time12(i.end)}` : "Next in the chair"}
                      </span>
                      {i.kind !== "online" ? (
                        <span className="text-xs text-white/60">{i.kind === "phone" ? "Phone-in" : "Walk-in"}</span>
                      ) : i.memberPlan ? (
                        <span className="text-xs text-white/60">Member</span>
                      ) : i.payAtShop ? (
                        <span className="text-xs text-white/60">Pays here</span>
                      ) : null}
                    </span>
                    <span className="lu-time-in relative mt-4 block text-[2.4rem] font-semibold leading-none tracking-[-0.05em] tabular-nums">
                      {inProgress ? "Now" : time12(i.start)}
                    </span>
                    <span className="relative mt-3 block truncate text-[15px] font-medium">
                      {i.service || "Appointment"}
                      <span className="font-normal text-white/60">
                        {" "}for {i.clientName || "a client"}
                        {me.canManage && pro ? `, with ${firstName(pro.name)}` : ""}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })()}
            <ul className="divide-y divide-hairline">
              {upNext.slice(1, 8).map((i) => {
                const pro = team.find((m) => m.profileId === i.professionalId) || null;
                const inProgress = toMinutes(i.start) <= now;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(i)}
                      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-ink/[0.025]"
                    >
                      <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {inProgress ? <span className="text-[#C8102E]">Now</span> : time12(i.start)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{i.service || "Appointment"}</span>
                        <span className="block truncate text-[13px] text-neutral-500">
                          {i.clientName || "Client"}
                          {me.canManage && pro ? ` with ${firstName(pro.name)}` : ""}
                        </span>
                      </span>
                      {i.kind !== "online" ? <Tag>{i.kind === "phone" ? "Phone-in" : "Walk-in"}</Tag> : i.memberPlan ? <Tag tone="outline">Member</Tag> : i.payAtShop ? <Tag tone="outline">Pays here</Tag> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
          {doneCount > 0 ? (
            <p className="border-t border-hairline px-5 py-3 text-[13px] text-neutral-500">
              {doneCount} done earlier today
            </p>
          ) : null}
        </section>

        {/* On the floor */}
        <section aria-labelledby="on-floor" className={`${panelClass} self-start`}>
          <h3 id="on-floor" className="px-5 pb-2 pt-4 text-[15px] font-semibold text-ink">
            On the floor
          </h3>
          {visibleTeam.length === 0 ? (
            <div className="px-5 pb-5 pt-1">
              <p className="text-sm leading-6 text-neutral-500">No one is taking clients yet.</p>
              {me.canManage ? (
                <Link href="/studio/team" className={`${buttonClass("secondary", "sm")} mt-3`}>
                  Invite your team
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="pb-2">
              {visibleTeam.map((m) => (
                <FloorRow
                  key={m.id}
                  pro={m}
                  items={todays.filter((i) => i.professionalId === m.profileId)}
                  hours={hours[m.profileId!]?.[new Date().getDay()] || []}
                  off={(timeOff[m.profileId!] || []).some((r) => today >= r.start && today <= r.end)}
                  loading={items === null}
                  canBook={canBook}
                  onBook={() => newAppointment(m.profileId!)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Requests: only when some are waiting. The Requests tab is always one
          tap away, so an empty box here would just repeat it. */}
      {requests && waitingRequests.length > 0 ? (
        <section aria-labelledby="today-requests" className={`${panelClass} mt-6`}>
          <div className="flex items-baseline justify-between gap-4 px-5 pb-1 pt-4">
            <h3 id="today-requests" className="text-[15px] font-semibold text-ink">
              Requests near you{" "}
              <span className="font-normal tabular-nums text-neutral-400">{waitingRequests.length}</span>
            </h3>
            <Link href="/studio/requests" className="shrink-0 text-[13px] font-medium text-neutral-500 hover:text-ink">
              See all
            </Link>
          </div>
          <div className="divide-y divide-hairline">
            {waitingRequests.slice(0, 3).map((r) => (
              <RequestRow key={r.id} request={r} onChanged={refreshRequests} compact />
            ))}
          </div>
        </section>
      ) : null}

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
        team={bookable}
        services={data.services || {}}
        busy={busy}
        run={run}
        setNotice={setNotice}
        onClose={() => setDraft(null)}
        onSaved={(message) => {
          setDraft(null);
          setNotice({ tone: "success", text: message });
          refresh();
        }}
      />
    </div>
  );
}

function FloorRow({
  pro,
  items,
  hours,
  off,
  loading,
  canBook,
  onBook,
}: {
  pro: TeamMember;
  items: ScheduleItem[];
  hours: [string, string][];
  off: boolean;
  loading: boolean;
  canBook: boolean;
  onBook: () => void;
}) {
  const now = nowMinutes();
  const busyNow = items.find((i) => i.status !== "completed" && i.status !== "no_show" && toMinutes(i.start) <= now && toMinutes(i.end) > now);
  const opens = hours.length ? Math.min(...hours.map(([s]) => toMinutes(s))) : null;
  const closes = hours.length ? Math.max(...hours.map(([, e]) => toMinutes(e))) : null;

  let status: string;
  let free = false;
  if (loading) status = "…";
  else if (off) status = "Off today";
  else if (busyNow) status = `With a client until ${time12(busyNow.end)}`;
  else if (opens === null) status = "No hours set for today";
  else if (now < opens) status = `In at ${time12(`${String(Math.floor(opens / 60)).padStart(2, "0")}:${String(opens % 60).padStart(2, "0")}`)}`;
  else if (closes !== null && now >= closes) status = "Done for the day";
  else {
    status = "Free now";
    free = true;
  }

  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className="relative">
        <Avatar name={pro.name} src={pro.avatarUrl} size={36} />
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface ${
            free ? "bg-[#C8102E]" : busyNow ? "bg-ink" : "bg-neutral-300"
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{pro.name || "Team member"}</span>
        <span className="block truncate text-[13px] text-neutral-500">{status}</span>
      </span>
      {free && canBook ? (
        <Button size="sm" onClick={onBook} aria-label={`Book a walk-in with ${firstName(pro.name)}`}>
          Book
        </Button>
      ) : null}
    </li>
  );
}

// What's left before the shop is fully running. Disappears when done.
function SetupSteps({ openPlans }: { openPlans: () => void }) {
  const { data } = useStudio();
  const studio = data.studio!;
  const me = data.me!;
  const teamCount = (data.team || []).length;
  const steps = [
    { done: !!studio.address, label: "Add the shop's address", href: "/studio/settings" },
    { done: teamCount > 1, label: "Invite your team", href: "/studio/team" },
    { done: studio.live, label: "Choose a plan", onClick: me.isOwner ? openPlans : undefined },
    ...(me.isOwner ? [{ done: !!data.payouts?.ready, label: "Set up payouts to the shop", href: "/studio/settings" }] : []),
  ];
  const left = steps.filter((s) => !s.done);
  if (!left.length) return null;

  return (
    <section aria-label="Finish setting up" className="mt-6 rounded-2xl bg-ink p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Finish setting up {studio.name}</h3>
        <p className="text-[13px] text-white/60">
          {steps.length - left.length} of {steps.length} done
        </p>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const inner = (
            <>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.done ? "bg-white text-ink" : "shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]"
                }`}
              >
                {s.done ? <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} /> : null}
              </span>
              <span className={s.done ? "text-white/50 line-through decoration-white/30" : ""}>{s.label}</span>
              {!s.done ? <ArrowRight className="ml-auto h-4 w-4 text-white/50" aria-hidden="true" /> : null}
            </>
          );
          const cls = "flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3.5 py-3 text-left text-sm transition-colors";
          return (
            <li key={s.label}>
              {s.done ? (
                <div className={cls}>{inner}</div>
              ) : s.href ? (
                <Link href={s.href} className={`${cls} hover:bg-white/[0.12]`}>
                  {inner}
                </Link>
              ) : s.onClick ? (
                <button type="button" onClick={s.onClick} className={`${cls} hover:bg-white/[0.12]`}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
