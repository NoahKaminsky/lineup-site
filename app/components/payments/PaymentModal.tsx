"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import CheckoutForm from "./CheckoutForm";
import TipStep, { formatTipMoney } from "./TipStep";
import { useModalSheet } from "@/app/lib/useModalSheet";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function PaymentModal({
  clientSecret,
  title = "Confirm booking",
  subtitle = "Your payment is securely processed by Stripe.",
  onClose,
  onSuccess,
  redirectTo = "/work",
  proName,
}: {
  proName?: string | null;
  clientSecret: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSuccess?: () => void;
  redirectTo?: string | null;
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
              Secure payment
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-neutral-900">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              {subtitle}
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
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
              variables: {
                borderRadius: "14px",
              },
            },
          }}
        >
          <TipStep
            clientSecret={clientSecret}
            proName={proName}
            onGiftComplete={() => {
              onSuccess?.();
              if (redirectTo) setTimeout(() => (window.location.href = redirectTo), 1200);
            }}
          >
            {(summary) => (
              <CheckoutForm
                onSuccess={onSuccess}
                redirectTo={redirectTo}
                payLabel={`Pay ${formatTipMoney(summary.totalCents, summary.currency)}`}
              />
            )}
          </TipStep>
        </Elements>
      </div>
      </div>
    </div>
  );
}