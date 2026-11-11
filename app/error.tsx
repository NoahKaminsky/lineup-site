"use client";

import Link from "next/link";
import { useEffect } from "react";

// Catches an unexpected crash on any page and offers a way forward, instead
// of leaving a blank white screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[80dvh] items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Something went wrong</p>
        <h1 className="mt-4 text-[clamp(2.25rem,7vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
          That didn&rsquo;t load. <span className="text-neutral-400">It&rsquo;s us, not you.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-neutral-600">
          Nothing was lost. Try again, and if it keeps happening, let us know.
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
