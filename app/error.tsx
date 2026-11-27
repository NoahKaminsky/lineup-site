"use client";

import Link from "next/link";
import { useEffect } from "react";

// An unexpected crash on any page: say so plainly and offer a way forward,
// instead of a blank screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[80dvh] items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-sm font-medium text-neutral-500">Something went wrong</p>
        <h1 className="mt-3 text-[clamp(2.25rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
          This page didn&rsquo;t load.
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-neutral-600">
          Nothing was lost. Try again. If it keeps happening, let us know.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try again
          </button>
          <Link
            href="/contact"
            className="rounded-full border border-neutral-300 bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Contact us
          </Link>
        </div>
      </div>
    </main>
  );
}
