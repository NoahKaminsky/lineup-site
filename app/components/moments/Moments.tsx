"use client";

import React from "react";
import { LuMarkPaths } from "@/app/components/LuMark";

/* Shared confirmation "moments" for the app. They only render what the page
   already decided — every caller keeps its own state, handlers, polling and
   redirects — so swapping one in never changes behaviour, only how the
   moment looks. Motion lives in globals.css under "Moments". */

// Free-text prices: add a dollar sign only when the value is a bare number.
export function formatMomentPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  return /^\d+(\.\d+)?$/.test(text) ? `$${text}` : text;
}

// "2026-10-20" → "Tue, Oct 20". Leaves anything else untouched.
export function formatMomentDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

/* A heading line that rises out of its own baseline. */
export function MaskLine({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`lu-mask-line ${className}`}>
      <span style={{ "--lu-delay": `${delay}ms` } as React.CSSProperties}>{children}</span>
    </span>
  );
}

/* Ink disc, a ring that expands once, then the check draws itself. */
export function DrawnCheck({ size = 56, delay = 0 }: { size?: number; delay?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span
        className="absolute inset-0 rounded-full border border-ink"
        style={{ animation: `lu-ring-wide 1100ms var(--ease-arrive) ${delay + 260}ms both` }}
      />
      <span
        className="absolute inset-0 rounded-full bg-ink"
        style={{ animation: `lu-dot-in 420ms var(--ease-arrive) ${delay}ms backwards` }}
      />
      <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-[46%] w-[46%]" fill="none">
        <path
          d="M5 12.5l4.2 4.2L19 7"
          pathLength={1}
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1"
          style={{ animation: `lu-stroke-draw 480ms var(--ease-arrive) ${delay + 220}ms backwards` }}
        />
      </svg>
    </span>
  );
}

/* The thing the visitor just made, as a small card. */
export function MomentCard({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: (string | null | undefined | false)[];
}) {
  const parts = (meta || []).filter(Boolean) as string[];
  return (
    <div className="rounded-2xl bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.35)] ring-1 ring-ink/[0.07]">
      <p className="text-xs font-medium text-neutral-500">{eyebrow}</p>
      <p className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</p>
      {parts.length > 0 ? <p className="mt-1.5 truncate text-sm text-neutral-500">{parts.join(" · ")}</p> : null}
    </div>
  );
}

/* The LU mark painting in left to right, for working states with no card. */
function MarkReveal() {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className="mx-auto h-16 w-16 text-ink"
      aria-hidden="true"
      style={{ animation: "lu-logo-reveal 900ms var(--ease-arrive) both" }}
    >
      <g style={{ animation: "lu-pulse-opacity 1.8s ease-in-out 1.2s infinite" }}>
        <LuMarkPaths />
      </g>
    </svg>
  );
}

/* Full-screen moment for "the thing is on its way" → "it's done".

   working: the card lifts in from below and a hairline scans underneath.
   done:    the card is pinged as it lands, a check appears on its corner,
            the headline rises in two tones and the hairline fills over
            `holdMs` — the same time the caller waits before moving on. */
export function MomentOverlay({
  status,
  workingTitle,
  workingNote = "This usually takes a few seconds.",
  title,
  subtitle,
  card,
  holdMs = 1500,
}: {
  status: "working" | "done";
  workingTitle: string;
  workingNote?: string;
  title: string;
  subtitle?: string;
  card?: React.ReactNode;
  holdMs?: number;
}) {
  const done = status === "done";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6" role="status" aria-live="polite">
      <div className="lu-fade-in absolute inset-0 bg-paper/85 backdrop-blur-md" />

      <div className="relative w-full max-w-sm text-center">
        {card ? (
          <div className="lu-lift-in relative">
            {card}
            {done ? (
              <>
                <span aria-hidden="true" className="lu-ring pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-ink" />
                <span className="absolute -right-3 -top-3">
                  <DrawnCheck size={36} />
                </span>
              </>
            ) : null}
          </div>
        ) : done ? (
          <div className="flex justify-center">
            <DrawnCheck size={56} />
          </div>
        ) : (
          <MarkReveal />
        )}

        <h2 key={status} className="mt-9 text-[1.6rem] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">
          <MaskLine>{done ? title : workingTitle}</MaskLine>
          {done && subtitle ? (
            <MaskLine delay={90} className="text-neutral-500">
              {subtitle}
            </MaskLine>
          ) : null}
        </h2>
        {!done && workingNote ? <p className="lu-fade-in mt-3 text-sm text-neutral-500">{workingNote}</p> : null}

        <div className="mx-auto mt-8 h-px w-40 overflow-hidden bg-ink/10">
          {done ? (
            <div
              className="h-px origin-left bg-ink"
              style={{ animation: `lu-progress ${holdMs}ms linear both` }}
            />
          ) : (
            <div className="h-px w-1/3 bg-ink" style={{ animation: "lu-scan 1.3s var(--ease-premium) infinite" }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* "You're booked." A sheet on phones, a dialog on desktop. Detail rows step
   into line one after another, like everything else in LineUp. */
export function BookedSheet({
  subtitle,
  body,
  rows,
  children,
  labelledBy = "lu-booked-title",
}: {
  subtitle?: string;
  body?: React.ReactNode;
  rows: { label: string; value: React.ReactNode }[];
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <div className="lu-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="lu-sheet-in max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:p-8"
      >
        <DrawnCheck size={52} delay={120} />

        <h2 id={labelledBy} className="mt-7 text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
          <MaskLine delay={200}>You&apos;re booked.</MaskLine>
          {subtitle ? (
            <MaskLine delay={290} className="text-neutral-500">
              {subtitle}
            </MaskLine>
          ) : null}
        </h2>

        {body ? <div className="lu-fade-in mt-4 text-sm leading-6 text-neutral-600">{body}</div> : null}

        {rows.length > 0 ? (
          <dl className="lu-lineup mt-6 divide-y divide-ink/[0.06] rounded-2xl bg-paper px-4 ring-1 ring-ink/[0.05]">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-6 py-3.5">
                <dt className="shrink-0 text-xs text-neutral-500">{row.label}</dt>
                <dd className="min-w-0 text-right text-sm font-medium text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-7 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}
