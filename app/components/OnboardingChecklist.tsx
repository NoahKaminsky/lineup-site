"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { DrawnCheck, MaskLine } from "@/app/components/moments/Moments";

type StepKey =
  | "verified"
  | "photo"
  | "bio"
  | "where"
  | "service"
  | "hours"
  | "portfolio"
  | "payouts"
  | "cover"
  | "instagram";

type StepState = Record<StepKey, boolean>;

type Step = {
  key: StepKey;
  label: string;
  why: string;
  href: string;
  cta: string;
};

// Everything a client looks at before choosing someone, in the order it
// matters. "Essentials" decide whether you can be found and booked at all;
// "Stand out" is what tips a client toward you over the next profile.
const ESSENTIALS: Step[] = [
  { key: "verified", label: "Get verified", why: "Only verified pros appear in Browse and can be booked.", href: "/verification", cta: "Verify" },
  { key: "photo", label: "Add a profile photo", why: "A clear photo of you is the first thing clients look for.", href: "/account", cta: "Add photo" },
  { key: "bio", label: "Write a short bio", why: "A few lines on your experience and style.", href: "/account", cta: "Write bio" },
  { key: "where", label: "Set where you work", why: "Your area, and whether you travel, host or work from a shop.", href: "/services", cta: "Set location" },
  { key: "service", label: "Add your services", why: "What you offer, with prices and how long each takes.", href: "/services", cta: "Add service" },
  { key: "hours", label: "Set your weekly hours", why: "So requests and bookings land when you're actually free.", href: "/services", cta: "Set hours" },
  { key: "portfolio", label: "Post 3 photos of your work", why: "Your work sells you better than anything you write.", href: "/account", cta: "Add photos" },
  { key: "payouts", label: "Connect payouts", why: "Set up Stripe so you get paid for completed jobs.", href: "/account", cta: "Connect" },
];

const STAND_OUT: Step[] = [
  { key: "cover", label: "Add a cover photo", why: "The banner across the top of your profile.", href: "/account", cta: "Add cover" },
  { key: "instagram", label: "Link your Instagram", why: "Let clients see more of your work.", href: "/account", cta: "Link" },
];

const ALL_STEPS = [...ESSENTIALS, ...STAND_OUT];

function storageKey(userId: string) {
  return `lineup_onboarding_dismissed_${userId}`;
}

// Circular progress: the ring fills as steps are completed.
function ProgressRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-ink/[0.07]" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          className="text-ink transition-[stroke-dashoffset] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-ink">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-neutral-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" fill="none" aria-hidden="true">
      <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function OnboardingChecklist({ userId }: { userId: string }) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [steps, setSteps] = useState<StepState | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const [showDone, setShowDone] = useState(false);

  async function loadSteps() {
    const [profileRes, servicesRes, hoursRes, portfolioRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "avatar_url, banner_url, bio, instagram_handle, formatted_address, location, service_modes, stripe_account_id, verification_status, verified_until"
        )
        .eq("id", userId)
        .single(),
      supabase
        .from("professional_services")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", userId),
      supabase
        .from("professional_availability")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", userId)
        .eq("is_active", true),
      supabase
        .from("professional_portfolio")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    const profile = profileRes.data;
    const modes = Array.isArray(profile?.service_modes) ? profile.service_modes : [];
    const resolved: StepState = {
      verified: isVerifiedNow(profile),
      photo: !!profile?.avatar_url,
      bio: (profile?.bio || "").trim().length >= 40,
      where: !!(profile?.formatted_address || profile?.location) && modes.length > 0,
      service: (servicesRes.count ?? 0) > 0,
      hours: (hoursRes.count ?? 0) > 0,
      portfolio: (portfolioRes.count ?? 0) >= 3,
      payouts: !!profile?.stripe_account_id,
      cover: !!profile?.banner_url,
      instagram: !!(profile?.instagram_handle || "").trim(),
    };

    setVerificationPending(profile?.verification_status === "pending");
    setSteps(resolved);

    // Auto-dismiss once everything is done
    if (Object.values(resolved).every(Boolean)) {
      dismiss(userId);
    }
  }

  function dismiss(uid: string) {
    localStorage.setItem(storageKey(uid), "1");
    setDismissed(true);
    supabase
      .from("profiles")
      .update({ onboarding_checklist_dismissed: true })
      .eq("id", uid)
      .then(({ error }) => {
        if (error) console.error("Failed to persist onboarding checklist dismissal:", error);
      });
  }

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    // localStorage alone doesn't survive a new browser, device, or cleared
    // cache — profiles.onboarding_checklist_dismissed is the real source of
    // truth. localStorage stays as a fast no-flicker path once confirmed.
    if (localStorage.getItem(storageKey(userId))) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_checklist_dismissed")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data?.onboarding_checklist_dismissed) {
        localStorage.setItem(storageKey(userId), "1");
        return;
      }

      setDismissed(false);
      loadSteps();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (dismissed || !steps) return null;

  const completed = ALL_STEPS.filter((s) => steps[s.key]).length;
  const progress = completed / ALL_STEPS.length;
  const nextStep = ALL_STEPS.find((s) => !steps[s.key]) || null;
  const essentialsLeft = ESSENTIALS.filter((s) => !steps[s.key]).length;

  const row = (step: Step) => {
    const done = steps[step.key];
    const pending = step.key === "verified" && !done && verificationPending;
    return (
      <li key={step.key}>
        <Link
          href={step.href}
          className="group flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-paper sm:px-4"
        >
          {done ? (
            <DrawnCheck size={26} />
          ) : (
            <span
              aria-hidden="true"
              className={`h-[26px] w-[26px] shrink-0 rounded-full border-2 ${pending ? "border-dashed border-ink/40" : "border-neutral-200"}`}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium ${done ? "text-neutral-400 line-through decoration-neutral-300" : "text-neutral-900"}`}>
              {step.label}
            </span>
            {!done ? (
              <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                {pending ? "Submitted. We're reviewing it now." : step.why}
              </span>
            ) : null}
          </span>
          {!done ? <Chevron /> : null}
        </Link>
      </li>
    );
  };

  return (
    <section className="lu-dialog-in mt-8 overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-32px_rgba(0,0,0,0.3)] ring-1 ring-ink/[0.07]">
      {/* Header */}
      <div className="flex items-start gap-5 px-6 pt-6 sm:px-8 sm:pt-8">
        <ProgressRing value={progress} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.35rem] font-semibold leading-[1.1] tracking-[-0.03em] text-neutral-900">
            <MaskLine>{essentialsLeft === 0 ? "You're bookable." : "Build a profile clients pick."}</MaskLine>
            <MaskLine delay={90} className="text-neutral-500">
              {essentialsLeft === 0
                ? "A couple of extras left to stand out."
                : `${essentialsLeft} essential${essentialsLeft === 1 ? "" : "s"} left.`}
            </MaskLine>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dismiss(userId)}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Up next */}
      {nextStep ? (
        <div className="mx-4 mt-6 rounded-2xl bg-ink p-5 text-white sm:mx-6">
          <p className="text-xs font-medium text-white/60">Up next</p>
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-[-0.02em]">{nextStep.label}</p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-white/70">
                {nextStep.key === "verified" && verificationPending
                  ? "Submitted. We're reviewing it now."
                  : nextStep.why}
              </p>
            </div>
            <Link
              href={nextStep.href}
              className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-neutral-200"
            >
              {nextStep.cta}
            </Link>
          </div>
        </div>
      ) : null}

      {/* What's left, by group; finished items move to their own "Done"
          list so it's clear exactly which ones count toward the ring. */}
      <div className="px-3 pb-4 pt-5 sm:px-4">
        {[
          { label: "Essentials", items: ESSENTIALS.filter((s) => !steps[s.key]) },
          { label: "Stand out", items: STAND_OUT.filter((s) => !steps[s.key]) },
        ].map((group, gi) =>
          group.items.length > 0 ? (
            <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
              <p className="px-3 text-xs font-medium text-neutral-500 sm:px-4">{group.label}</p>
              <ul className="lu-lineup mt-1">{group.items.map(row)}</ul>
            </div>
          ) : null
        )}

        {completed > 0 ? (
          <div className="mt-4 border-t border-ink/[0.06] pt-3">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-paper hover:text-ink sm:px-4"
            >
              <span>Done ({completed})</span>
              <span>{showDone ? "Hide" : "Show"}</span>
            </button>
            {showDone ? (
              <ul className="lu-lineup mt-1">{ALL_STEPS.filter((s) => steps[s.key]).map(row)}</ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
