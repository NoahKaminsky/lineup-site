import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

// Any address that doesn't exist: a plain message and a way back, instead of
// the framework's bare "404".
export default function NotFound() {
  return (
    <main className="flex min-h-[80dvh] items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-xl">
        <p className="lu-rise-in text-sm font-medium text-neutral-500" style={{ animationDelay: "40ms" }}>
          Page not found
        </p>
        <h1
          className="lu-rise-in mt-3 text-[clamp(2.25rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]"
          style={{ animationDelay: "110ms" }}
        >
          This page doesn&rsquo;t exist.
        </h1>
        <p className="lu-rise-in mt-5 max-w-md text-base leading-7 text-neutral-600" style={{ animationDelay: "190ms" }}>
          The link may be old, or the page may have moved.
        </p>
        <div className="lu-rise-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
          <Link href="/" className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800">
            Go home
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
