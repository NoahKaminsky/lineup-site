"use client";

// Invite a pro, get a free month: the pro's referral link and how it's doing.

import { useEffect, useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Info = { link: string; joined: number; earned: number; waiting: number };

export default function ReferPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/referrals", { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
      if (res.status === 401) return window.location.assign("/login?next=/refer");
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) setInfo(json);
      else setError(json.error || "Couldn't load your link.");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* visible to copy by hand */
    }
  }

  async function share() {
    if (!info) return;
    const text = "I take bookings on LineUp. Join with my link:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on LineUp", text, url: info.link });
        return;
      } catch {
        /* closed the share sheet */
      }
    }
    void copy();
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl py-6 sm:py-8">
        <Gift className="h-7 w-7 text-neutral-400" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Invite a pro, get a free month.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-neutral-600">
          Share your link with barbers, stylists and artists you know. When one of them joins LineUp and starts a paid plan, your
          next month is on us. Up to 12 free months a year.
        </p>

        {error ? <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {info ? (
          <>
            <div className="mt-8 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
              <p className="text-xs font-medium text-neutral-500">Your link</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={info.link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Your referral link"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-neutral-50 px-3.5 text-sm text-neutral-700 outline-none ring-1 ring-inset ring-ink/[0.08]"
                />
                <button type="button" onClick={copy} className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset ring-ink/15 hover:bg-neutral-50">
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button type="button" onClick={share} className="mt-4 w-full rounded-full bg-ink py-3 text-sm font-medium text-white hover:bg-neutral-800">
                Share your link
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["Joined with your link", info.joined],
                ["Free months earned", info.earned],
                ["Waiting to apply", info.waiting],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-ink/[0.06]">
                  <dt className="text-xs text-neutral-500">{label}</dt>
                  <dd className="mt-0.5 text-2xl font-semibold tracking-[-0.02em]">{value}</dd>
                </div>
              ))}
            </dl>
            {info.waiting ? (
              <p className="mt-3 text-sm text-neutral-500">Free months waiting are added to your bill as soon as you&apos;re on a paid plan.</p>
            ) : null}
          </>
        ) : !error ? (
          <p className="mt-8 text-sm text-neutral-500">Loading your link…</p>
        ) : null}
      </div>
    </main>
  );
}
