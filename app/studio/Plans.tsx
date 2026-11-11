"use client";

// The two studio plans as cards.

import { Check } from "lucide-react";
import { STUDIO_PLANS, type StudioPlan } from "@/app/lib/plans";
import { Button, panelClass } from "./ui";

export function PlanPicker({
  isOwner,
  current,
  busy,
  onChoose,
  compact = false,
  stacked = false,
}: {
  isOwner: boolean;
  current: StudioPlan | null;
  busy: string | null;
  onChoose: (plan: StudioPlan) => void;
  compact?: boolean;
  // One above the other, features shown (for a narrow panel).
  stacked?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${compact || stacked ? "" : "md:grid-cols-2"}`}>
      {(Object.keys(STUDIO_PLANS) as StudioPlan[]).map((key) => {
        const plan = STUDIO_PLANS[key];
        const featured = key === "studio_plus";
        const isCurrent = current === key;
        return (
          <div
            key={key}
            className={`flex flex-col rounded-2xl p-6 ${
              featured ? "bg-ink text-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.55)]" : `${panelClass} text-ink`
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">{plan.label}</h3>
                <p className={`mt-0.5 text-[13px] ${featured ? "text-white/60" : "text-neutral-500"}`}>
                  {featured ? "Everything, plus pay and rent for the shop" : "Run the floor and take bookings"}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{plan.priceLabel}</span>
                <span className={`block text-xs ${featured ? "text-white/60" : "text-neutral-500"}`}>CAD a month</span>
              </p>
            </div>
            {!compact ? (
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className={`flex gap-2.5 text-sm leading-6 ${featured ? "text-white/85" : "text-neutral-700"}`}>
                    <Check className={`mt-1 h-4 w-4 shrink-0 ${featured ? "text-white" : "text-ink"}`} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
            {isCurrent ? (
              <p
                className={`mt-6 flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-medium ${
                  featured ? "bg-white/10 text-white" : "bg-ink/[0.05] text-ink"
                }`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Your current plan
              </p>
            ) : isOwner ? (
              <Button
                variant={featured ? "secondary" : "primary"}
                disabled={!!busy || isCurrent}
                loading={busy === `plan-${key}`}
                onClick={() => onChoose(key)}
                className={`mt-6 w-full ${featured ? "!bg-white !text-ink" : ""}`}
              >
                {isCurrent ? "Your plan" : current ? `Switch to ${plan.label}` : `Choose ${plan.label}`}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
