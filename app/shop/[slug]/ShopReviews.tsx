"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { buttonClass } from "@/app/components/ui";

export type PublicReview = { id: string; rating: number; comment: string | null; reply: string | null; created_at: string; reviewer: string };

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden="true" style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-ink text-ink" : "fill-transparent text-neutral-300"} />
      ))}
    </span>
  );
}

// The shop's reviews: a summary with the spread of stars, then the reviews
// themselves (newest first) with the shop's replies. Five at first.
export default function ShopReviews({
  reviews,
  summary,
  shopName,
}: {
  reviews: PublicReview[];
  summary: { count: number; average: number | null; counts: number[] };
  shopName: string;
}) {
  const [shown, setShown] = useState(5);
  if (!summary.count) {
    return (
      <p className="rounded-2xl bg-surface p-6 text-sm leading-6 text-neutral-600 shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
        No reviews yet. Clients can review {shopName} after a completed visit booked on LineUp.
      </p>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(10,10,10,0.07)] md:self-start">
        <p className="text-5xl font-semibold tabular-nums tracking-[-0.04em] text-ink">{summary.average?.toFixed(1)}</p>
        <div className="mt-2">
          <Stars value={summary.average || 0} size={16} />
        </div>
        <p className="mt-1.5 text-[13px] text-neutral-500">
          {summary.count} {summary.count === 1 ? "review" : "reviews"}
        </p>
        <ul className="mt-4 space-y-1.5" aria-label="Reviews by stars">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = summary.counts[n - 1];
            return (
              <li key={n} className="flex items-center gap-2 text-[12px] tabular-nums text-neutral-500">
                <span className="w-2.5">{n}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(c / summary.count) * 100}%` }} />
                </span>
                <span className="w-5 text-right">{c}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <ul className="divide-y divide-hairline rounded-2xl bg-surface shadow-[0_0_0_1px_rgba(10,10,10,0.07)]">
          {reviews.slice(0, shown).map((r) => (
            <li key={r.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{r.reviewer}</p>
                <time dateTime={r.created_at} className="text-[12px] text-neutral-500">
                  {new Date(r.created_at).toLocaleDateString("en-CA", { month: "short", year: "numeric" })}
                </time>
              </div>
              <div className="mt-1">
                <Stars value={r.rating} />
              </div>
              {r.comment ? <p className="mt-2.5 whitespace-pre-line text-[15px] leading-7 text-neutral-700">{r.comment}</p> : null}
              {r.reply ? (
                <div className="mt-3 rounded-xl bg-ink/[0.04] px-4 py-3 text-sm leading-6 text-neutral-700">
                  <p className="text-[12px] font-semibold text-ink">Reply from {shopName}</p>
                  <p className="mt-0.5 whitespace-pre-line">{r.reply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {reviews.length > shown ? (
          <button type="button" onClick={() => setShown((n) => n + 10)} className={buttonClass("secondary", "md", "mt-4")}>
            Show more reviews
          </button>
        ) : null}
      </div>
    </div>
  );
}
