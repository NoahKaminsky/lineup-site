"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSignedInUser } from "@/lib/getSignedInUser";
import SiteMenu, { SITE_PAGES } from "./SiteMenu";

// Shared frame for the public info pages (About, FAQ, News, Contact):
// header with the page menu, Log in and Join beside it, and a footer.

export function PublicHeader() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getSignedInUser().then((user) => {
      if (!cancelled) setSignedIn(!!user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-ink/[0.06] bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1.5">
          <SiteMenu className="-ml-2" />
          <Link href="/" className="rounded text-lg font-semibold tracking-tight sm:text-xl">
            LineUp
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <Link
              href="/requests"
              className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 sm:px-5 sm:py-2.5"
            >
              Open LineUp
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.05]"
              >
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 sm:px-5 sm:py-2.5"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-ink/[0.08] bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-lg font-semibold tracking-tight">LineUp</p>
          <p className="mt-1 text-sm text-neutral-500">Beauty and grooming, booked. Winnipeg, Manitoba.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-600">
            {SITE_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="hover:text-ink">
                  {page.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/privacy" className="hover:text-ink">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-ink">
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

// Big page title with a masked rise, used at the top of each info page.
export function PageIntro({ eyebrow, title, subtitle }: { eyebrow: string; title: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6 sm:pb-14 sm:pt-20">
      <p className="lu-rise-in text-xs font-medium text-neutral-500" style={{ animationDelay: "40ms" }}>
        {eyebrow}
      </p>
      <h1
        className="lu-rise-in mt-3 max-w-3xl text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.02] tracking-[-0.045em]"
        style={{ animationDelay: "110ms" }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="lu-rise-in mt-5 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8" style={{ animationDelay: "190ms" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
