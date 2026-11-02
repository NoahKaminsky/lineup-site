"use client";

import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// "Book now, pay at the shop": the client saves a card instead of paying.
// It's only charged if they don't show up (the shop's no-show fee).

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function formatCad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function SaveCardForm({ onSaved, noShowFeeCents }: { onSaved: (setupIntentId: string) => Promise<void>; noShowFeeCents: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSaving(true);
    setMessage("");

    const result = await stripe.confirmSetup({ elements, redirect: "if_required" });

    if (result.error || !result.setupIntent) {
      setMessage(result.error?.message || "Your card couldn't be saved. Please try again.");
      setSaving(false);
      return;
    }

    setMessage("Card saved. Booking you in…");
    await onSaved(result.setupIntent.id);
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />

      {message ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">{message}</div>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || !elements || saving}
        className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save card and book"}
      </button>
      <p className="text-center text-xs leading-5 text-neutral-500">
        You won&apos;t be charged today.{" "}
        {noShowFeeCents > 0 ? `Only if you miss the appointment: ${formatCad(noShowFeeCents)}.` : null}
      </p>
    </form>
  );
}

export default function CardSetupModal({
  clientSecret,
  priceCents,
  noShowFeeCents,
  shopName,
  onClose,
  onSaved,
}: {
  clientSecret: string;
  priceCents: number;
  noShowFeeCents: number;
  shopName?: string | null;
  onClose: () => void;
  onSaved: (setupIntentId: string) => Promise<void>;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="lu-fade-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/60 p-4 sm:items-center">
      <div className="lu-dialog-in my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-panel bg-white p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:rounded-panel">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Pay at the shop</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-neutral-900">Hold your spot with a card</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              You&apos;ll pay {priceCents > 0 ? formatCad(priceCents) : "for your service"} at{" "}
              {shopName || "the shop"}. Your card is only charged if you don&apos;t show up.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: { theme: "stripe", variables: { borderRadius: "14px" } } }}
        >
          <SaveCardForm onSaved={onSaved} noShowFeeCents={noShowFeeCents} />
        </Elements>
      </div>
    </div>
  );
}
