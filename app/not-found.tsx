import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

// Shown for any address that doesn't exist, in LineUp's own voice instead of
// the framework's bare "404".
export default function NotFound() {
  return (
    <main className="flex min-h-[80dvh] items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-xl">
        <p className="lu-rise-in font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500" style={{ animationDelay: "40ms" }}>
          404
        </p>
        <h1
          className="lu-rise-in mt-4 text-[clamp(2.25rem,7vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]"
          style={{ animationDelay: "110ms" }}
        >
          Not in the lineup. <span className="text-neutral-400">This page doesn&rsquo;t exist.</span>
        </h1>
        <p className="lu-rise-in mt-5 max-w-md text-base leading-7 text-neutral-600" style={{ animationDelay: "190ms" }}>
          The link may be old, or the page may have moved. Here&rsquo;s where to go next.
        </p>
        <div className="lu-rise-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
          <Link
            href="/"
            className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Back to LineUp
          </Link>
          <Link
            href="/discover"
            className="rounded-full border border-neutral-300 bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            Browse pros
          </Link>
        </div>
      </div>
    </main>
  );
}
