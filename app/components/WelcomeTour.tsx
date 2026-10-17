"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MaskLine } from "@/app/components/moments/Moments";

// The landing page's studio, reused as the tour's window. Each step moves the
// camera further down the row of stations; the wall and the stations travel
// at different rates, so the move reads as depth rather than a slide.
const TOUR_STATIONS = ["barber", "styling", "nail", "lash"] as const;

export type TourStep = {
  Icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
};

function storageKey(userId: string, role: string) {
  return `lineup_welcome_tour_seen_${role}_${userId}`;
}

// localStorage alone doesn't survive a new browser, device, or a cleared
// cache — profiles.welcome_tour_seen is the real source of truth so someone
// who's already seen this on their phone won't get it again on their laptop.
// localStorage is kept as a fast, no-flicker path for the common case.
function profileColumn(role: string) {
  return role === "professional" ? "welcome_tour_seen_professional" : "welcome_tour_seen_customer";
}

export default function WelcomeTour({
  userId,
  role,
  steps,
  finalCtaLabel,
  finalCtaHref,
}: {
  userId: string;
  role: string;
  steps: TourStep[];
  finalCtaLabel: string;
  finalCtaHref: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Which way the visitor last moved, so the copy enters from that side.
  const [direction, setDirection] = useState<"next" | "back">("next");

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    if (localStorage.getItem(storageKey(userId, role))) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(profileColumn(role))
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      const alreadySeen = !error && data && (data as Record<string, boolean>)[profileColumn(role)];

      if (alreadySeen) {
        localStorage.setItem(storageKey(userId, role), "1");
        return;
      }

      setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  // Lock the background page in place while the tour is open. On iOS Safari
  // in particular, letting the page scroll behind a `fixed` overlay lets the
  // dynamic toolbar resize the viewport mid-scroll, which throws off the
  // overlay's position and makes it look like it's floating in the page
  // rather than pinned to the screen.
  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  async function finish() {
    localStorage.setItem(storageKey(userId, role), "1");
    setVisible(false);
    const { error } = await supabase
      .from("profiles")
      .update({ [profileColumn(role)]: true })
      .eq("id", userId);
    if (error) console.error("Failed to persist welcome tour seen state:", error);
  }

  async function handleFinalCta() {
    // Wait for the DB write before navigating, not just localStorage — on a
    // real account, that write is the only thing that stops the tour from
    // showing again on a different device/browser. It was previously
    // fire-and-forget, racing the navigation that follows it.
    await finish();
    router.push(finalCtaHref);
  }

  if (!visible) return null;

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  // 0 at the first step, 1 at the last: where the camera sits on the row.
  const travel = steps.length > 1 ? stepIndex / (steps.length - 1) : 0;
  const goNext = () => {
    setDirection("next");
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  const goBack = () => {
    setDirection("back");
    setStepIndex((i) => Math.max(0, i - 1));
  };
  const camera = "transition-transform duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform";

  return createPortal(
    <div className="lu-fade-in fixed inset-0 z-[100] flex items-end justify-center overscroll-none bg-ink/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        className="lu-sheet-in relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)]"
      >
        {/* Window into the studio */}
        <div aria-hidden="true" className="relative h-44 overflow-hidden bg-[#ecebe6] sm:h-52">
          <div
            className={`absolute inset-y-0 left-0 w-[180%] ${camera}`}
            style={{ transform: `translateX(${-travel * 44.4}%)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/landing/studio-wide.webp" alt="" className="h-full w-full object-cover object-[50%_80%]" />
          </div>
          <div
            className={`absolute inset-y-0 left-0 w-[260%] ${camera}`}
            style={{ transform: `translateX(${-travel * 61.5}%)` }}
          >
            {TOUR_STATIONS.map((kind, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={kind}
                src={`/images/landing/station-${kind}-a.webp`}
                alt=""
                className="absolute bottom-[8%] h-[64%] w-auto max-w-none -translate-x-1/2"
                style={{ left: `${14 + i * 24}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white to-transparent" />

          <div className="absolute inset-x-5 top-5 flex gap-1.5 pr-11">
            {steps.map((_, i) => (
              <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full origin-left rounded-full bg-ink transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    i <= stepIndex ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={finish}
          aria-label="Skip"
          className="absolute right-3.5 top-3 rounded-full bg-white/80 p-1.5 text-neutral-500 shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-white hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {/* relative z-10: the step icon overlaps the studio window above. */}
        <div className="relative z-10 px-7 pb-7 sm:px-8 sm:pb-8">
          {/* Re-keyed per step so each one arrives fresh, from the side the
              visitor is moving toward. */}
          <div key={stepIndex} className={direction === "next" ? "lu-step-in-next" : "lu-step-in-back"}>
            <div className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)] ring-4 ring-white">
              <step.Icon className="h-6 w-6" />
            </div>

            <p className="mt-5 text-xs font-medium text-neutral-500">{step.eyebrow}</p>
            <h2
              id="welcome-tour-title"
              className="mt-1.5 text-[1.6rem] font-semibold leading-[1.1] tracking-[-0.035em] text-neutral-900"
            >
              <MaskLine delay={80}>{step.title}</MaskLine>
            </h2>
            <p
              className="mt-3 text-sm leading-6 text-neutral-600"
              style={{ animation: "lu-success-rise 520ms var(--ease-arrive) 180ms backwards" }}
            >
              {step.description}
            </p>
          </div>

          <div className="mt-8 flex items-center gap-3">
            {!isFirst ? (
              <button
                type="button"
                onClick={goBack}
                className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Back
              </button>
            ) : null}

            {isLast ? (
              <button
                type="button"
                onClick={handleFinalCta}
                className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                {finalCtaLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                Next
              </button>
            )}
          </div>

          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="mt-3 w-full text-center text-xs font-medium text-neutral-400 transition hover:text-neutral-600"
            >
              I&apos;ll do this later
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
