"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

export default function CheckoutForm({
  onSuccess,
  redirectTo = "/work",
}: {
  onSuccess?: () => void;
  redirectTo?: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) return;

    setLoading(true);
    setMessage("");

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setMessage(result.error.message || "Payment failed. Please try again.");
      setLoading(false);
      return;
    }

    setMessage("Payment received. Confirming your booking...");
    onSuccess?.();

    if (redirectTo) {
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 1200);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />

      {message ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || !elements || loading}
        className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Processing..." : "Confirm payment"}
      </button>
    </form>
  );
}