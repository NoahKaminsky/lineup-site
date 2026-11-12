"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useModalSheet } from "@/app/lib/useModalSheet";

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
  coveredBy,
  onClose,
  onSaved,
}: {
  clientSecret: string;
  priceCents: number;
  noShowFeeCents: number;
  shopName?: string | null;
  // The client's membership name when this visit is covered by it.
  coveredBy?: string | null;
  onClose: () => void;
  onSaved: (setupIntentId: string) => Promise<void>;
}) {
  // Pins the page behind and keeps the sheet inside the visible screen.
  const overlayRef = useModalSheet();

  return (
    <div ref={overlayRef} role="dialog" aria-modal="true" className="lu-fade-in lu-sheet-overlay z-50 bg-ink/60">
      {/* The overlay is the one scroller. The sheet sits at the bottom on phones
          and in the middle on wider screens; when it's taller than the screen
          (card form, keyboard open) you scroll the whole sheet. */}
      <div className="flex min-h-full items-end justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div className="lu-dialog-in w-full max-w-lg rounded-panel bg-white p-6 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-neutral-500">
              {coveredBy ? "Member booking" : "Pay at the shop"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-neutral-900">Hold your spot with a card</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              {coveredBy ? (
                <>
                  Covered by your {coveredBy} membership. Your card is only charged if you don&apos;t show up.
                </>
              ) : (
                <>
                  You&apos;ll pay {priceCents > 0 ? formatCad(priceCents) : "for your service"} at{" "}
                  {shopName || "the shop"}. Your card is only charged if you don&apos;t show up.
                </>
              )}
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
    </div>
  );
}
