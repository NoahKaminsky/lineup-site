"use client";

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
        throw new Error(data.error || "Failed to unsubscribe");
      }

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16 text-ink">
      <div className="lu-dialog-in w-full max-w-xl rounded-2xl border border-hairline bg-surface p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.18)] sm:p-9">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          LineUp
        </p>

        <h1 className="mb-4 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">
          Unsubscribe
        </h1>

        {done ? (
          <p className="text-base leading-7 text-neutral-600">
            You have been unsubscribed from LineUp marketing emails for{" "}
            <span className="font-medium text-ink">{email}</span>.
          </p>
        ) : (
          <>
            <p className="mb-6 text-base leading-7 text-neutral-600">
              Click below to stop receiving newsletters, launch updates,
              promotions, and product news for{" "}
              <span className="font-medium text-ink">{email || "this address"}</span>.
            </p>

            {error ? (
              <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>
            ) : null}

            <button
              onClick={handleUnsubscribe}
              disabled={loading || !email}
              className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}