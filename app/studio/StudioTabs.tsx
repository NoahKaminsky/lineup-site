"use client";

// The shop's sections as one segmented control: a soft track with a white
// pill that slides to the section you tap. On phones the track scrolls and
// keeps the active section in view.

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { Armchair, CalendarDays, Contact, Crown, Inbox, Receipt, Sun, Users, type LucideIcon } from "lucide-react";
import { studioHref } from "./StudioContext";

const ICONS: Record<string, LucideIcon> = {
  "": Sun,
  calendar: CalendarDays,
  requests: Inbox,
  team: Users,
  clients: Contact,
  memberships: Crown,
  chairs: Armchair,
  earnings: Receipt,
};

export default function StudioTabs({
  sections,
  active,
  counts = {},
}: {
  sections: readonly { slug: string; label: string }[];
  active: string;
  counts?: Record<string, number>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[active];
      if (!el) return setPill(null);
      setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Slide only after the first placement, so it doesn't fly in on load.
    const id = requestAnimationFrame(() => setAnimate(true));
    tabRefs.current[active]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
    };
  }, [active, sections.length]);

  return (
    <div
      ref={trackRef}
      className="relative flex w-full gap-1 overflow-x-auto rounded-full bg-ink/[0.05] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {pill ? (
        <span
          aria-hidden="true"
          className={`absolute bottom-1 top-1 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-4px_rgba(0,0,0,0.15)] ${
            animate ? "transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]" : ""
          }`}
          style={{ left: pill.left, width: pill.width }}
        />
      ) : null}
      {sections.map((s) => {
        const Icon = ICONS[s.slug] || Sun;
        const isActive = s.slug === active;
        const count = counts[s.slug] || 0;
        return (
          <Link
            key={s.slug || "today"}
            ref={(el) => {
              tabRefs.current[s.slug] = el;
            }}
            href={studioHref(s.slug)}
            aria-current={isActive ? "page" : undefined}
            className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium sm:flex-1 sm:py-2.5 sm:text-sm transition-colors duration-200 ${
              isActive ? "text-ink" : "text-neutral-500 hover:text-ink"
            }`}
          >
            <Icon aria-hidden="true" className={`h-4 w-4 ${isActive ? "text-ink" : "text-neutral-400"}`} strokeWidth={isActive ? 2.2 : 1.8} />
            {s.label}
            {count > 0 ? (
              <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C8102E] px-1 text-[10px] font-semibold tabular-nums text-white">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
