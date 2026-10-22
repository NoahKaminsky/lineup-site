"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// "Meet the founders" cards for the landing page.
//
// Noah's card is a photo card that tilts toward the pointer with a moving
// sheen; tapping it grows the card out of its own spot into a full profile
// (a FLIP animation: the open panel starts at the card's exact size and
// position and expands to the centre), then the details rise in one by one.
// Escape, the close button or tapping outside shrinks it back into the card.
// With Reduce Motion it simply fades.
//
// Everything a founder says lives in FOUNDERS below, so the copy is easy to
// change without touching the animation code.

type Founder = {
  id: string;
  name: string;
  firstName: string;
  title: string;
  photo?: string;
  photoPosition?: string;
  tags: string[];
  intro: string;
  bio: string[];
  quote?: string;
  contact?: { label: string; href: string };
};

const FOUNDERS: Founder[] = [
  {
    id: "noah",
    name: "Noah Kaminsky",
    firstName: "Noah",
    title: "Co-Founder & CEO",
    photo: "/images/founders/noah.webp",
    photoPosition: "35% 30%",
    tags: ["Winnipeg, MB", "U of M Agribusiness grad", "Loves farming", "Always planning the next trip"],
    intro: "Hey, I'm Noah.",
    bio: [
      "I graduated from the University of Manitoba in agribusiness, and I love farming. When I'm not working on LineUp you'll find me travelling (I love, love, love travelling) or hanging out with my friends.",
      "LineUp started because I was tired of getting clapped haircuts. Finding someone good meant scrolling through Instagram, sending a bunch of DMs and hoping for the best, so I decided to take matters into my own hands.",
      "Think of it like a dating app for estheticians and clients: you say what you're looking for, and LineUp matches you with the pro who's right for you. You see their real work, and you book a time that actually works.",
    ],
    quote: "No more clapped haircuts.",
    contact: { label: "Say hi", href: "mailto:lineupmb@gmail.com?subject=Hi%20Noah" },
  },
  {
    id: "dan",
    name: "Dan Latimer",
    firstName: "Dan",
    title: "Co-Founder & CFO",
    tags: [],
    intro: "",
    bio: [],
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The card itself: tilt + sheen on pointer devices, press-in on touch.
function PhotoCard({
  founder,
  hidden,
  onOpen,
  setCardEl,
}: {
  founder: Founder;
  hidden: boolean;
  onOpen: () => void;
  setCardEl: (el: HTMLButtonElement | null) => void;
}) {
  const frame = useRef<number | null>(null);

  function handleMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse" || prefersReducedMotion()) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
      el.style.setProperty("--ry", `${(x - 0.5) * 12}deg`);
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
      el.style.setProperty("--glare", "1");
    });
  }

  function handleLeave(event: React.PointerEvent<HTMLButtonElement>) {
    const el = event.currentTarget;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--glare", "0");
  }

  return (
    <div className="[perspective:1100px]">
      <button
        ref={setCardEl}
        type="button"
        onClick={onOpen}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        aria-haspopup="dialog"
        aria-label={`Meet ${founder.name}, ${founder.title}`}
        className={`lu-founder-card group relative block aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-ink text-left shadow-[0_2px_6px_rgba(0,0,0,0.06),0_30px_60px_-28px_rgba(0,0,0,0.45)] outline-none ring-ink/40 focus-visible:ring-4 ${
          hidden ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={founder.photo}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full scale-[1.04] object-cover transition-transform duration-700 ease-[var(--ease-arrive)] group-hover:scale-[1.08]"
          style={{ objectPosition: founder.photoPosition }}
        />
        {/* Sheen that follows the pointer. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: "var(--glare, 0)",
            background:
              "radial-gradient(420px circle at var(--gx, 50%) var(--gy, 30%), rgba(255,255,255,0.22), transparent 45%)",
          }}
        />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 [transform:translateZ(40px)]">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-white/60">{founder.title}</span>
            <span className="mt-1 block text-2xl font-semibold tracking-[-0.03em] text-white">{founder.name}</span>
          </span>
          <span className="lu-founder-plus flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-lg transition-transform duration-300 ease-[var(--ease-arrive)] group-hover:rotate-90 group-active:scale-90">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </span>
        </span>

        <span className="absolute left-4 top-4 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md [transform:translateZ(30px)]">
          Tap to meet {founder.firstName}
        </span>
      </button>
    </div>
  );
}

function FounderDialog({
  founder,
  origin,
  onClosed,
}: {
  founder: Founder;
  origin: Rect | null;
  onClosed: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [phase, setPhase] = useState<"from" | "open" | "closing">("from");

  // FLIP: start the panel on top of the card, then let it grow into place.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (origin && !prefersReducedMotion()) {
      const target = panel.getBoundingClientRect();
      const sx = origin.width / target.width;
      const sy = origin.height / target.height;
      const dx = origin.left - target.left;
      const dy = origin.top - target.top;
      panel.style.transition = "none";
      panel.style.transformOrigin = "top left";
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      panel.style.borderRadius = `${28 / Math.min(sx, sy)}px`;
      void panel.offsetWidth;
    }
    const id = requestAnimationFrame(() => {
      panel.style.transition = "";
      panel.style.transform = "";
      panel.style.borderRadius = "";
      setPhase("open");
    });
    closeRef.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(id);
  }, [origin]);

  const close = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || phase === "closing") return;
    setPhase("closing");
    if (origin && !prefersReducedMotion()) {
      const target = panel.getBoundingClientRect();
      const sx = origin.width / target.width;
      const sy = origin.height / target.height;
      panel.style.transformOrigin = "top left";
      panel.style.transform = `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${sx}, ${sy})`;
      panel.style.borderRadius = `${28 / Math.min(sx, sy)}px`;
      window.setTimeout(onClosed, 460);
    } else {
      window.setTimeout(onClosed, 200);
    }
  }, [origin, onClosed, phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      // Keep focus inside the dialog.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  const open = phase === "open";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`founder-${founder.id}-name`}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className={`absolute inset-0 bg-ink/50 backdrop-blur-sm transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`}
      />

      <div
        ref={panelRef}
        className="lu-founder-panel relative flex max-h-[92svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[32px] bg-paper shadow-[0_40px_120px_-30px_rgba(0,0,0,0.55)] sm:max-h-[86vh] sm:flex-row sm:rounded-[32px]"
      >
        {/* Photo side */}
        <div className="relative h-[42svh] shrink-0 overflow-hidden bg-ink sm:h-auto sm:w-[44%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={founder.photo}
            alt={`${founder.name}, ${founder.title} of LineUp`}
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-arrive)] ${
              open ? "scale-100" : "scale-[1.12]"
            }`}
            style={{ objectPosition: founder.photoPosition }}
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent sm:hidden" />
          <div className={`absolute bottom-0 left-0 p-5 transition-all delay-150 duration-500 sm:hidden ${open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
            <p className="text-xs font-medium text-white/65">{founder.title}</p>
            <p className="text-2xl font-semibold tracking-[-0.03em] text-white">{founder.name}</p>
          </div>
        </div>

        {/* Story side */}
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-10">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink transition-all duration-500 hover:bg-ink/10 hover:rotate-90 ${
              open ? "scale-100 opacity-100" : "scale-75 opacity-0"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className={`lu-founder-stagger ${open ? "is-open" : ""}`}>
            <p className="hidden text-xs font-medium text-neutral-500 sm:block" style={{ "--i": 0 } as React.CSSProperties}>
              {founder.title}
            </p>
            <h3
              id={`founder-${founder.id}-name`}
              className="mt-1 text-[2rem] font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-[2.5rem]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              {founder.intro || founder.name}
            </h3>

            <ul className="mt-5 flex flex-wrap gap-2" style={{ "--i": 2 } as React.CSSProperties}>
              {founder.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-ink/[0.05] px-3 py-1.5 text-xs font-medium text-ink">
                  {tag}
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-4 text-[15px] leading-7 text-neutral-600">
              {founder.bio.map((paragraph, index) => (
                <p key={index} style={{ "--i": 3 + index } as React.CSSProperties}>
                  {paragraph}
                </p>
              ))}
            </div>

            {founder.quote ? (
              <blockquote
                className="mt-7 border-l-2 border-ink pl-4 text-lg font-semibold leading-snug tracking-[-0.02em] text-ink"
                style={{ "--i": 3 + founder.bio.length } as React.CSSProperties}
              >
                “{founder.quote}”
              </blockquote>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3" style={{ "--i": 4 + founder.bio.length } as React.CSSProperties}>
              {founder.contact ? (
                <a
                  href={founder.contact.href}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98]"
                >
                  {founder.contact.label}
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ) : null}
              <a
                href="/login?mode=signup"
                className="inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold text-ink ring-1 ring-inset ring-ink/15 transition hover:ring-ink/30"
              >
                Join LineUp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonogramCard({ founder }: { founder: Founder }) {
  const initials = founder.name
    .split(" ")
    .map((part) => part[0])
    .join("");
  return (
    <div className="flex items-center gap-4 rounded-[22px] bg-white p-4 ring-1 ring-ink/[0.07]">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-lg font-semibold tracking-[-0.02em] text-white">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold tracking-tight text-ink">{founder.name}</span>
        <span className="mt-0.5 block text-sm text-neutral-500">{founder.title}</span>
      </span>
    </div>
  );
}

export default function FounderCards() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Rect | null>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function openFounder(id: string) {
    const el = cardRefs.current[id];
    if (el) {
      const r = el.getBoundingClientRect();
      setOrigin({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    setOpenId(id);
  }

  const openFounderData = FOUNDERS.find((f) => f.id === openId) ?? null;

  return (
    <>
      <div className="space-y-4">
        {FOUNDERS.map((founder) =>
          founder.photo ? (
            <div key={founder.id} data-reveal>
              <PhotoCard
                founder={founder}
                hidden={openId === founder.id}
                onOpen={() => openFounder(founder.id)}
                setCardEl={(el) => {
                  cardRefs.current[founder.id] = el;
                }}
              />
            </div>
          ) : (
            <div key={founder.id} data-reveal>
              <MonogramCard founder={founder} />
            </div>
          )
        )}
      </div>

      {openFounderData ? (
        <FounderDialog
          key={openFounderData.id}
          founder={openFounderData}
          origin={origin}
          onClosed={() => {
            const id = openId;
            setOpenId(null);
            if (id) cardRefs.current[id]?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );
}
