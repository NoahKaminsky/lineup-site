"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buttonClass, textareaClass } from "@/app/components/ui";
import { containsProfanity } from "@/app/lib/profanityFilter";

// After a completed visit at a shop: rate the shop itself (the space, the
// welcome, the whole visit), separate from the pro's own review.
export default function ShopReviewCard({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<{ shopName: string | null; canReview: boolean; review: { rating: number; comment: string | null } | null } | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/shop-reviews?bookingId=${encodeURIComponent(bookingId)}`, { headers: await authHeaders() });
      const json = await res.json().catch(() => null);
      if (!cancelled && res.ok && json) setState(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (!state?.shopName || (!state.canReview && !state.review)) return null;

  async function submit() {
    if (!rating) return setError("Choose 1 to 5 stars.");
    if (containsProfanity(comment)) return setError("Please remove inappropriate language before posting.");
    setSaving(true);
    setError("");
    const res = await fetch("/api/shop-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ bookingId, rating, comment }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(json.error || "Could not post your review.");
    setState((s) => (s ? { ...s, canReview: false, review: { rating, comment: comment.trim() || null } } : s));
  }

  return (
    <section aria-labelledby="shop-review" className="mt-4 rounded-3xl bg-white p-6 ring-1 ring-ink/[0.07]">
      <p id="shop-review" className="font-semibold text-ink">
        {state.review ? `You rated ${state.shopName}` : `How was ${state.shopName}?`}
      </p>
      {state.review ? (
        <>
          <p className="mt-2 flex gap-0.5" role="img" aria-label={`${state.review.rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} aria-hidden="true" className={`h-5 w-5 ${i <= state.review!.rating ? "fill-ink text-ink" : "fill-transparent text-neutral-300"}`} />
            ))}
          </p>
          {state.review.comment ? <p className="mt-2 text-sm leading-6 text-neutral-600">{state.review.comment}</p> : null}
          <p className="mt-2 text-[13px] text-neutral-500">Thanks. It's on the shop's page now.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-6 text-neutral-500">Rate the shop itself: the space, the welcome, the whole visit. It shows on the shop's page.</p>
          <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} ${i === 1 ? "star" : "stars"}`}
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-ink/[0.04]"
              >
                <Star aria-hidden="true" className={`h-7 w-7 transition-colors ${i <= (hover || rating) ? "fill-ink text-ink" : "fill-transparent text-neutral-300"}`} />
              </button>
            ))}
          </div>
          {rating ? (
            <div className="mt-3 space-y-3">
              <textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={textareaClass} aria-label="Your review (optional)" placeholder="What stood out? (optional)" />
              {error ? <p className="text-sm text-[#A30D25]">{error}</p> : null}
              <button type="button" onClick={submit} disabled={saving} className={buttonClass("primary", "md")}>
                {saving ? "Posting…" : "Post review"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
