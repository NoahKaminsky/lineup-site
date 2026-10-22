"use client";

import { useEffect, useState } from "react";
import { useElements } from "@stripe/react-stripe-js";
import { supabase } from "@/lib/supabaseClient";

// The tip prompt shown before paying: No tip, 15%, 18% or 20%. Picking one
// updates the payment's total on the server, then the card form appears
// with a price breakdown. Must render inside Stripe's <Elements>.
//
// The whole tip goes to the pro (LineUp's commission is only taken from the
// service price).

const OPTIONS = [0, 15, 18, 20];

export type TipSummary = { baseCents: number; tipCents: number; totalCents: number; currency: string };

function money(cents: number, currency = "cad") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

async function callTip(paymentIntentId: string, tipPercent?: number) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/stripe/tip", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ paymentIntentId, tipPercent }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Couldn't update the tip.");
  return json as TipSummary;
}

export default function TipStep({
  clientSecret,
  proName,
  children,
}: {
  clientSecret: string;
  proName?: string | null;
  // The card form, given the chosen breakdown once a tip is picked.
  children: (summary: TipSummary) => React.ReactNode;
}) {
  const elements = useElements();
  const paymentIntentId = clientSecret.split("_secret")[0];
  const [base, setBase] = useState<TipSummary | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [summary, setSummary] = useState<TipSummary | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    callTip(paymentIntentId)
      .then((info) => {
        if (!cancelled) setBase(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paymentIntentId]);

  async function choose(percent: number) {
    setError("");
    setSaving(percent);
    try {
      const next = await callTip(paymentIntentId, percent);
      // Let the card form (and Apple / Google Pay) know the new total.
      await elements?.fetchUpdates();
      setSummary(next);
      setChosen(percent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the tip.");
    } finally {
      setSaving(null);
    }
  }

  const name = proName?.split(" ")[0] || "your pro";

  if (chosen === null || !summary) {
    return (
      <div className="lu-rise-in mt-6">
        <p className="text-lg font-semibold tracking-[-0.02em] text-ink">Add a tip for {name}?</p>
        <p className="mt-1 text-sm text-neutral-500">100% of your tip goes to {name}.</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {OPTIONS.map((percent, index) => {
            const tip = base ? Math.round((base.baseCents * percent) / 100) : null;
            return (
              <button
                key={percent}
                type="button"
                disabled={saving !== null}
                onClick={() => choose(percent)}
                style={{ animationDelay: `${80 + index * 50}ms` }}
                className={`lu-rise-in group relative flex h-[84px] flex-col items-center justify-center rounded-2xl ring-1 ring-inset transition-all duration-300 ease-[var(--ease-arrive)] active:scale-[0.97] disabled:cursor-wait ${
                  saving === percent ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/15 hover:-translate-y-0.5 hover:ring-ink/40 hover:shadow-[0_14px_28px_-18px_rgba(0,0,0,0.4)]"
                }`}
              >
                <span className="text-xl font-semibold tracking-[-0.02em]">{percent === 0 ? "No tip" : `${percent}%`}</span>
                {percent > 0 ? (
                  <span className={`mt-0.5 text-xs tabular-nums ${saving === percent ? "text-white/70" : "text-neutral-500"}`}>
                    {tip !== null ? money(tip, base?.currency) : " "}
                  </span>
                ) : null}
                {saving === percent ? (
                  <span aria-hidden="true" className="absolute inset-x-6 bottom-2.5 h-0.5 overflow-hidden rounded-full bg-white/25">
                    <span className="block h-full w-1/3 animate-[lu-scan_900ms_ease-in-out_infinite] bg-white" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="lu-rise-in">
      <dl className="mt-6 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm ring-1 ring-ink/[0.06]">
        <div className="flex justify-between text-neutral-600">
          <dt>Service</dt>
          <dd className="tabular-nums">{money(summary.baseCents, summary.currency)}</dd>
        </div>
        <div className="flex items-center justify-between text-neutral-600">
          <dt className="flex items-center gap-2">
            Tip{chosen > 0 ? ` (${chosen}%)` : ""}
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="text-xs font-medium text-ink underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
            >
              Change
            </button>
          </dt>
          <dd className="tabular-nums">{money(summary.tipCents, summary.currency)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink/10 pt-2 text-base font-semibold text-ink">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(summary.totalCents, summary.currency)}</dd>
        </div>
      </dl>
      <div className="mt-5">{children(summary)}</div>
    </div>
  );
}

export { money as formatTipMoney };
