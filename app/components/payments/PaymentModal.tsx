"use client";

import { useEffect } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import CheckoutForm from "./CheckoutForm";

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
}: {
  clientSecret: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSuccess?: () => void;
  redirectTo?: string | null;
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
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
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
          <CheckoutForm onSuccess={onSuccess} redirectTo={redirectTo} />
        </Elements>
      </div>
    </div>
  );
}