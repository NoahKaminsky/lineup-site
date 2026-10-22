"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The three-bar menu on public pages: the info pages only. Log in and Join
// sit beside it as their own buttons, never inside it.

export const SITE_PAGES = [
  { href: "/about", label: "About", note: "Meet the founders" },
  { href: "/faq", label: "FAQ", note: "How LineUp works" },
  { href: "/news", label: "News", note: "Updates, week by week" },
  { href: "/contact", label: "Contact", note: "Get in touch" },
];

export default function SiteMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        {/* Three bars that fold into an X. */}
        <span aria-hidden="true" className="relative block h-3.5 w-[18px]">
          <span
            className={`absolute left-0 h-[2px] w-full rounded-full bg-current transition-all duration-300 ease-[var(--ease-arrive)] ${
              open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-current transition-all duration-200 ${
              open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 h-[2px] w-full rounded-full bg-current transition-all duration-300 ease-[var(--ease-arrive)] ${
              open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
            }`}
          />
        </span>
      </button>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Site"
          className="lu-menu-in absolute left-0 top-[calc(100%+10px)] z-[60] w-[min(20rem,calc(100vw-2rem))] origin-top-left overflow-hidden rounded-3xl bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_28px_64px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5"
        >
          <ul>
            {SITE_PAGES.map((page, index) => {
              const active = pathname === page.href || pathname.startsWith(`${page.href}/`);
              return (
                <li
                  key={page.href}
                  className="lu-menu-item"
                  style={{ animationDelay: `${120 + index * 55}ms` }}
                >
                  <Link
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors ${
                      active ? "bg-ink/[0.05]" : "hover:bg-ink/[0.04]"
                    }`}
                  >
                    <span className="w-5 font-mono text-[11px] tabular-nums text-neutral-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold tracking-[-0.02em] text-ink">{page.label}</span>
                      <span className="block text-xs text-neutral-500">{page.note}</span>
                    </span>
                    <svg
                      viewBox="0 0 16 16"
                      className="h-4 w-4 shrink-0 text-neutral-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
