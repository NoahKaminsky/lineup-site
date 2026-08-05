"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Steps = {
  photo: boolean;
  service: boolean;
  availability: boolean;
  stripe: boolean;
};

const STEPS = [
  {
    key: "photo" as keyof Steps,
    label: "Add a profile photo",
    description: "Help clients recognise you",
    href: "/account",
  },
  {
    key: "service" as keyof Steps,
    label: "Add your first service",
    description: "Let clients know what you offer",
    href: "/services",
  },
  {
    key: "availability" as keyof Steps,
    label: "Set your weekly availability",
    description: "So clients can book the right time",
    href: "/services",
  },
  {
    key: "stripe" as keyof Steps,
    label: "Connect Stripe for payouts",
    description: "Get paid when jobs are completed",
    href: "/account",
  },
];

function storageKey(userId: string) {
  return `lineup_onboarding_dismissed_${userId}`;
}

export default function OnboardingChecklist({ userId }: { userId: string }) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [steps, setSteps] = useState<Steps | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(storageKey(userId))) return; // already dismissed
    setDismissed(false);
    loadSteps();
  }, [userId]);

  async function loadSteps() {
    const [profileRes, servicesRes, availabilityRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("avatar_url, stripe_account_id")
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
    ]);

    const profile = profileRes.data;
    const resolved: Steps = {
      photo: !!profile?.avatar_url,
      service: (servicesRes.count ?? 0) > 0,
      availability: (availabilityRes.count ?? 0) > 0,
      stripe: !!profile?.stripe_account_id,
    };

    setSteps(resolved);

    // Auto-dismiss if everything is done
    if (Object.values(resolved).every(Boolean)) {
      dismiss(userId);
    }
  }

  function dismiss(uid: string) {
    localStorage.setItem(storageKey(uid), "1");
    setDismissed(true);
  }

  if (dismissed || !steps) return null;

  const completed = Object.values(steps).filter(Boolean).length;
  const total = STEPS.length;
  const allDone = completed === total;

  return (
    <div className="mt-8 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Getting started
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-neutral-900">
            {allDone ? "You're all set up!" : "Set up your LineUp profile"}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {allDone
              ? "Your profile is complete. You're ready to take bookings."
              : `${completed} of ${total} steps complete — finish your setup to start receiving bookings.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => dismiss(userId)}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-5 px-6 sm:px-8">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-black transition-all duration-500"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="mt-4 divide-y divide-neutral-100 px-2 pb-3 sm:px-4">
        {STEPS.map((step) => {
          const done = steps[step.key];
          return (
            <div
              key={step.key}
              className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
            >
              {/* Check circle */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
                  done ? "bg-black" : "border-2 border-neutral-200 bg-white"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path d="M2 6l2.5 2.5L10 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : null}
              </div>

              {/* Label */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? "text-neutral-400 line-through" : "text-neutral-900"}`}>
                  {step.label}
                </p>
                {!done ? (
                  <p className="mt-0.5 text-xs text-neutral-400">{step.description}</p>
                ) : null}
              </div>

              {/* Action */}
              {!done ? (
                <Link
                  href={step.href}
                  className="shrink-0 rounded-full border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  Go →
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
