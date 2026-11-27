"use client";

// The gear on a profile: the handful of settings people look for, one tap
// away. Each item is a link (another page, or a spot on this one) or an action.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";

export type GearItem = { label: string; href?: string; onSelect?: () => void; icon?: ReactNode; group?: string };

export default function GearMenu({ items, label = "Settings" }: { items: GearItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row =
    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-ink transition-colors hover:bg-ink/[0.05] sm:min-h-10";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          open ? "bg-ink text-white" : "bg-surface text-neutral-600 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] hover:text-ink"
        }`}
      >
        <Settings className={`h-[18px] w-[18px] transition-transform duration-300 ${open ? "rotate-45" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="lu-pop-in absolute right-0 top-[3.25rem] z-40 w-60 rounded-2xl bg-surface p-1.5 shadow-[0_0_0_1px_rgba(10,10,10,0.08),0_20px_48px_-16px_rgba(0,0,0,0.35)]"
        >
          {items.map((item, i) => {
            const newGroup = item.group && item.group !== items[i - 1]?.group;
            const inner = (
              <>
                {item.icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-500">{item.icon}</span> : null}
                {item.label}
              </>
            );
            return (
              <div key={item.label}>
                {newGroup ? <p className={`px-3 pb-1 text-xs font-medium text-neutral-400 ${i ? "mt-1 border-t border-hairline pt-2.5" : "pt-1.5"}`}>{item.group}</p> : null}
                {item.href ? (
                  <Link role="menuitem" href={item.href} onClick={() => setOpen(false)} className={row}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                    className={row}
                  >
                    {inner}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
