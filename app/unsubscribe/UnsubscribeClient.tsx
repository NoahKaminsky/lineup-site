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
    <main className="flex min-h-screen items-center justify-center bg-[#07080d] px-6 py-16 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-neutral-500">
          LineUp Aesthetics
        </p>

        <h1 className="mb-4 text-4xl font-semibold tracking-tight">
          Unsubscribe
        </h1>

        {done ? (
          <p className="text-base leading-7 text-neutral-300">
            You have been unsubscribed from LineUp marketing emails for{" "}
            <span className="text-white">{email}</span>.
          </p>
        ) : (
          <>
            <p className="mb-6 text-base leading-7 text-neutral-300">
              Click below to stop receiving newsletters, launch updates,
              promotions, and product news for{" "}
              <span className="text-white">{email || "this address"}</span>.
            </p>

            {error ? (
              <p className="mb-4 text-sm text-red-400">{error}</p>
            ) : null}

            <button
              onClick={handleUnsubscribe}
              disabled={loading || !email}
              className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Unsubscribing..." : "Confirm unsubscribe"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
