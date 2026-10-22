"use client";

import { useState } from "react";

// Email sign-up for the newsletter. The button turns into a check when it works.
export default function NewsSignup({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending" || state === "done") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  const done = state === "done";

  return (
    <form onSubmit={submit} className={compact ? "" : "max-w-md"} noValidate>
      <div
        className={`flex gap-1.5 bg-white p-1.5 ring-1 transition-shadow duration-300 focus-within:ring-2 ${
          compact ? "flex-col rounded-[22px]" : "items-center rounded-full"
        } ${
          state === "error" ? "ring-red-300 focus-within:ring-red-400" : "ring-ink/10 focus-within:ring-ink"
        }`}
      >
        <label htmlFor="news-email" className="sr-only">
          Email address
        </label>
        <input
          id="news-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={done}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="you@email.com"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-ink outline-none placeholder:text-neutral-400 disabled:text-neutral-500"
        />
        <button
          type="submit"
          disabled={state === "sending" || done || !email.trim()}
          aria-live="polite"
          className={`relative flex h-11 shrink-0 items-center justify-center self-center overflow-hidden rounded-full text-sm font-semibold text-white transition-all duration-500 ease-[var(--ease-arrive)] disabled:cursor-default ${
            done ? "w-11 bg-emerald-600" : compact ? "w-full bg-ink hover:bg-neutral-800 disabled:opacity-60" : "w-[7.5rem] bg-ink hover:bg-neutral-800 disabled:opacity-60"
          }`}
        >
          <span className={`transition-all duration-300 ${done ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"}`}>
            {state === "sending" ? "Joining…" : "Subscribe"}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`absolute h-5 w-5 transition-all delay-150 duration-500 ${done ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={done ? 0 : 1}
              style={{ transition: "stroke-dashoffset 500ms var(--ease-arrive) 250ms" }}
            />
          </svg>
          <span className="sr-only">{done ? "Subscribed" : ""}</span>
        </button>
      </div>
      <p className={`mt-3 min-h-5 px-4 text-sm ${state === "error" ? "text-red-600" : "text-neutral-500"}`}>
        {done
          ? "You're in. New issues will land in your inbox."
          : state === "error"
          ? error
          : "One email a week. Unsubscribe anytime."}
      </p>
    </form>
  );
}
