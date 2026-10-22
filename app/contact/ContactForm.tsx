"use client";

import { useState } from "react";

const TOPICS = ["Client", "Pro", "Business", "Press", "Other"];

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Client");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, website }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  const field =
    "w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] text-ink outline-none transition focus:border-ink";

  if (state === "sent") {
    return (
      <div className="lu-rise-in flex min-h-[420px] flex-col items-center justify-center rounded-[28px] bg-white p-8 text-center ring-1 ring-ink/[0.07]">
        <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
          <circle cx="28" cy="28" r="28" className="fill-ink" style={{ animation: "lu-dot-in 420ms var(--ease-arrive) backwards" }} />
          <path
            d="M17 29l7 7 15-16"
            fill="none"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            style={{ animation: "lu-stroke-draw 520ms var(--ease-arrive) 220ms backwards" }}
          />
        </svg>
        <p className="mt-6 text-2xl font-semibold tracking-[-0.03em]">Message sent</p>
        <p className="mt-2 max-w-xs text-sm leading-6 text-neutral-500">
          Thanks, {name.split(" ")[0] || "friend"}. We&apos;ll reply to {email} as soon as we can.
        </p>
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setState("idle");
          }}
          className="mt-6 rounded-full px-5 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/15 transition hover:ring-ink/30"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8" noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-neutral-700">I&apos;m a…</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={topic === t}
              onClick={() => setTopic(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-[var(--ease-arrive)] active:scale-95 ${
                topic === t ? "bg-ink text-white" : "text-ink ring-1 ring-inset ring-ink/15 hover:ring-ink/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-700">Email</span>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={field}
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={4000}
          className={`${field} resize-none`}
          placeholder={topic === "Pro" ? "Tell us what you do and where you work." : "How can we help?"}
        />
      </label>
      {/* Hidden from people; catches bots. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "sending"}
          className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send message"}
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" fill="none" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {state === "error" ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
