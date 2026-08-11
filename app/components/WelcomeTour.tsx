"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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

  function finish() {
    localStorage.setItem(storageKey(userId, role), "1");
    setVisible(false);
    supabase
      .from("profiles")
      .update({ [profileColumn(role)]: true })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.error("Failed to persist welcome tour seen state:", error);
      });
  }

  function handleFinalCta() {
    finish();
    router.push(finalCtaHref);
  }

  if (!visible) return null;

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overscroll-none bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[2rem] bg-white p-7 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={finish}
          aria-label="Skip"
          className="absolute right-5 top-5 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-black" : "bg-neutral-100"
              }`}
            />
          ))}
        </div>

        <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
          <step.Icon className="h-6 w-6 text-neutral-700" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {step.eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
          {step.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{step.description}</p>

        <div className="mt-8 flex items-center gap-3">
          {!isFirst ? (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Back
            </button>
          ) : null}

          {isLast ? (
            <button
              type="button"
              onClick={handleFinalCta}
              className="flex-1 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {finalCtaLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="flex-1 rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
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
            I'll do this later
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
