"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, X, type LucideIcon } from "lucide-react";
import { buttonClass } from "@/app/components/ui";
import { markGuideSeen, useGuides } from "./useGuides";
import type { GuideKey } from "@/app/lib/guides";

export type TipPoint = { text: string; href?: string };

// A short "here's what this page is for" card, shown the first time someone
// opens a page. It sits above the page (over the phone tab bar's top edge on
// mobile, bottom-right on desktop) so the page never shifts when it appears,
// and it goes away for good on "Got it" — on every device.
export default function PageTip({
  id,
  Icon,
  title,
  body,
  points = [],
  show = true,
}: {
  // Only for some viewers (e.g. customers on a page pros can open too).
  show?: boolean;
  id: GuideKey;
  Icon: LucideIcon;
  title: string;
  body: string;
  points?: TipPoint[];
}) {
  const { shouldShow } = useGuides();
  if (!show || !shouldShow(id) || typeof document === "undefined") return null;

  const close = () => markGuideSeen(id);

  return createPortal(
    <aside
      role="complementary"
      aria-label={`Tip: ${title}`}
      data-guide={id}
      className="lu-sheet-in fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[60] mx-auto max-w-md rounded-2xl bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_24px_48px_-20px_rgba(0,0,0,0.35)] ring-1 ring-ink/[0.08] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[23rem]"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</p>
          <p className="mt-1 text-[13px] leading-5 text-neutral-600">{body}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close tip"
          className="-mr-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {points.length ? (
        <ul className="mt-3.5 space-y-1 border-t border-ink/[0.06] pt-3">
          {points.map((p) => (
            <li key={p.text}>
              {p.href ? (
                <Link
                  href={p.href}
                  onClick={close}
                  className="group flex min-h-9 items-center gap-2 rounded-lg px-1 text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.04]"
                >
                  <span className="flex-1">{p.text}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
                </Link>
              ) : (
                <p className="flex min-h-9 items-center gap-2 px-1 text-[13px] text-neutral-600">
                  <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                  {p.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link href="/help" onClick={close} className="text-[13px] font-medium text-neutral-500 underline-offset-4 transition-colors hover:text-ink hover:underline">
          All guides
        </Link>
        <button type="button" onClick={close} className={buttonClass("primary", "sm")}>
          Got it
        </button>
      </div>
    </aside>,
    document.body
  );
}
