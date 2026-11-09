"use client";

// The shared look for appointments everywhere a client sees them: a dark
// "next up" card for the very next one, and calendar-tile rows for the rest.
// Times are always read on the shop's clock (see app/lib/bookingTime.ts).

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, MapPin, MessageCircle, Navigation } from "lucide-react";
import { appointmentInstant, shopNow } from "@/app/lib/bookingTime";
import SplitFlap from "@/app/components/SplitFlap";

export type AppointmentLike = {
  href: string;
  title: string;
  date: string | null;
  startTime: string | null;
  endTime?: string | null;
  withName?: string | null;
  withAvatarUrl?: string | null;
  location?: string | null;
  price?: string | number | null;
};

function parts(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    day: d.getUTCDate(),
  };
}

export function time12(time: string | null | undefined) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "Today", "Tomorrow", "Friday", or "Fri, Nov 20".
export function dayWord(date: string) {
  const today = shopNow().dateKey;
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  const days = Math.round((d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (days > 1 && days < 7) return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// "In 45 min", "In 6 hours", "In 3 days", "Now".
export function countdown(date: string, startTime: string | null | undefined) {
  const ms = appointmentInstant(date, startTime).getTime() - Date.now();
  if (ms <= 0) return "Now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `In ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 36) return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `In ${days} days`;
}

export function shortAddress(address: string | null | undefined) {
  if (!address) return null;
  return address
    .replace(/,\s*Canada$/i, "")
    .replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/, "")
    .trim();
}

function money(price: string | number | null | undefined) {
  const n = Number(price);
  if (!price || !Number.isFinite(n) || n <= 0) return null;
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function Avatar({ name, url, size = 40, dark = false }: { name?: string | null; url?: string | null; size?: number; dark?: boolean }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ${
        dark ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-neutral-100 text-neutral-500 ring-1 ring-ink/[0.06]"
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        (name || "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

// A little tear-off calendar page: weekday, big day number.
export function DateTile({ date, muted = false, dark = false }: { date: string; muted?: boolean; dark?: boolean }) {
  const p = parts(date);
  return (
    <span
      aria-hidden="true"
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${
        dark
          ? "bg-white/10 text-white ring-1 ring-white/15"
          : muted
            ? "bg-neutral-100 text-neutral-500"
            : "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_16px_-10px_rgba(0,0,0,0.25)] ring-1 ring-ink/[0.06]"
      }`}
    >
      <span className={`text-[10px] font-semibold leading-none ${dark ? "text-[#ff4d63]" : muted ? "" : "text-[#C8102E]"}`}>
        {p.weekday}
      </span>
      <span className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{p.day}</span>
    </span>
  );
}

// The very next appointment as a boarding pass: light paper, the time on a
// split-flap board, a tear-off stub with the actions, and a thin bar that
// fills as the appointment gets closer (over the last 24 hours).
export function NextUpCard({
  item,
  footer,
}: {
  item: AppointmentLike & { date: string };
  footer?: ReactNode;
}) {
  const address = shortAddress(item.location);
  const price = money(item.price);
  const [until, setUntil] = useState(() => countdown(item.date, item.startTime));
  const [closeness, setCloseness] = useState(0);
  useEffect(() => {
    const tick = () => {
      setUntil(countdown(item.date, item.startTime));
      const ms = appointmentInstant(item.date, item.startTime).getTime() - Date.now();
      setCloseness(Math.min(1, Math.max(0, 1 - ms / 86_400_000)));
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [item.date, item.startTime]);
  const mapsHref = item.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`
    : null;
  const [clock, meridiem] = time12(item.startTime).split(" ");

  return (
    <div className="lu-rise relative overflow-hidden rounded-[26px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_22px_48px_-28px_rgba(0,0,0,0.35)] ring-1 ring-ink/[0.06]">
      {/* how close it is: fills over the last day */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-ink/[0.05]">
        <div className="h-full bg-ink transition-[width] duration-1000 ease-out" style={{ width: `${closeness * 100}%` }} />
      </div>

      <Link href={item.href} className="block p-6 pt-7 sm:p-7 sm:pt-8">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="font-medium text-ink">Next up</span>
          <span className="tabular-nums text-neutral-500">{until}</span>
        </div>

        <div className="mt-5 flex items-end gap-2">
          <SplitFlap text={clock} className="text-[2.6rem] font-semibold sm:text-[3rem]" />
          <span className="mb-1 text-sm font-semibold text-neutral-500">{meridiem}</span>
        </div>
        <p className="mt-2 text-sm text-neutral-500">{dayWord(item.date)}</p>

        <div className="mt-5 flex items-center gap-3">
          <Avatar name={item.withName} url={item.withAvatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {item.title}
              {item.withName ? <span className="font-normal text-neutral-500"> with {item.withName.split(" ")[0]}</span> : null}
            </p>
            {address ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-neutral-500">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {address}
              </p>
            ) : null}
          </div>
          {price ? <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{price}</span> : null}
        </div>
      </Link>

      {/* perforation, then the stub */}
      <div aria-hidden="true" className="relative h-5">
        <span className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-paper ring-1 ring-ink/[0.06]" />
        <span className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-paper ring-1 ring-ink/[0.06]" />
        <span className="absolute inset-x-5 top-1/2 border-t-2 border-dotted border-ink/10" />
      </div>
      <div className="flex gap-2 px-6 pb-5 pt-1 sm:px-7">
        <Link
          href={`${item.href}#booking-chat`}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Message
        </Link>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-neutral-200"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            Directions
          </a>
        ) : null}
        {footer}
      </div>
    </div>
  );
}

// One appointment in a list: date tile, what and when, chevron.
export function BookingRow({
  item,
  muted = false,
  note,
}: {
  item: AppointmentLike;
  muted?: boolean;
  note?: ReactNode;
}) {
  const price = money(item.price);
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-4 rounded-[22px] bg-white p-3 pr-4 ring-1 ring-ink/[0.06] transition duration-200 hover:-translate-y-px hover:shadow-[0_12px_28px_-18px_rgba(0,0,0,0.35)] hover:ring-ink/[0.1]"
    >
      {item.date ? <DateTile date={item.date} muted={muted} /> : <span className="h-14 w-14 shrink-0 rounded-2xl bg-neutral-100" />}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] font-semibold tracking-[-0.01em] ${muted ? "text-neutral-600" : "text-ink"}`}>
          {item.title}
          {item.withName ? <span className="font-normal text-neutral-500"> with {item.withName.split(" ")[0]}</span> : null}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-neutral-500">
          {item.date ? (muted ? parts(item.date).month + " " + parts(item.date).day : dayWord(item.date)) : "Time to be set"}
          {item.startTime ? ` · ${time12(item.startTime)}` : ""}
        </p>
        {note ? <div className="mt-1.5">{note}</div> : null}
      </div>
      {price ? <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-900">{price}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500" aria-hidden="true" />
    </Link>
  );
}

