"use client";

import { buttonClass } from "@/app/components/ui";

import { useState } from "react";

type UnsubscribeClientProps = {
  email: string;
};

export default function UnsubscribeClient({
  email,
}: UnsubscribeClientProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleUnsubscribe() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "We couldn't unsubscribe you. Try again.");
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-16 text-ink">
      <div className="w-full max-w-md rounded-3xl bg-surface p-7 ring-1 ring-ink/[0.07] sm:p-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{done ? "You're unsubscribed" : "Unsubscribe"}</h1>

        {done ? (
          <p className="mt-3 text-[15px] leading-7 text-neutral-600">
            We won&apos;t send newsletters or news to <span className="font-medium text-ink">{email}</span> any more. Booking emails still
            arrive as usual.
          </p>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-7 text-neutral-600">
              Stop newsletters and LineUp news for <span className="font-medium text-ink">{email || "this address"}</span>. Booking emails
              still arrive as usual.
            </p>

            {error ? <p className="mt-4 text-sm text-[#A30D25]">{error}</p> : null}

            <button type="button" onClick={handleUnsubscribe} disabled={loading || !email} className={buttonClass("primary", "md", "mt-6 w-full")}>
              {loading ? "Unsubscribing…" : "Unsubscribe"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
