"use client";

import { useState } from "react";

const input =
  "h-12 w-full rounded-xl bg-white px-4 text-[15px] text-ink outline-none ring-1 ring-inset ring-ink/[0.12] transition focus:ring-2 focus:ring-ink";

function cad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

export default function GiftForm({
  kind,
  slug,
  sellerName,
  amounts,
  minCents,
  maxCents,
}: {
  kind: "pro" | "shop";
  slug: string;
  sellerName: string;
  amounts: number[];
  minCents: number;
  maxCents: number;
}) {
  const [amount, setAmount] = useState<number | "custom">(amounts[1] ?? amounts[0]);
  const [custom, setCustom] = useState("");
  const [sendToRecipient, setSendToRecipient] = useState(true);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amountCents = amount === "custom" ? Math.round(Number(custom.replace(/[^0-9.]/g, "")) * 100) : amount;
  const amountOk = Number.isFinite(amountCents) && amountCents >= minCents && amountCents <= maxCents;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!amountOk) return setError(`Pick an amount between ${cad(minCents)} and ${cad(maxCents)}.`);
    setBusy(true);
    const res = await fetch("/api/gift-cards/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, slug, amountCents, sendToRecipient, recipientName, recipientEmail, buyerName, message }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.url) {
      window.location.assign(json.url);
      return;
    }
    setBusy(false);
    setError(json.error || "Something went wrong. Please try again.");
  }

  const chip = (active: boolean) =>
    `h-12 rounded-xl text-[15px] font-medium ring-1 ring-inset transition ${
      active ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-ink/[0.12] hover:ring-ink/40"
    }`;

  return (
    <form onSubmit={submit} className="rounded-3xl bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Amount</legend>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {amounts.map((a) => (
            <button key={a} type="button" aria-pressed={amount === a} onClick={() => setAmount(a)} className={chip(amount === a)}>
              {cad(a)}
            </button>
          ))}
          <button type="button" aria-pressed={amount === "custom"} onClick={() => setAmount("custom")} className={chip(amount === "custom")}>
            Other
          </button>
        </div>
        {amount === "custom" ? (
          <input
            inputMode="decimal"
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={`${cad(minCents)} to ${cad(maxCents)}`}
            aria-label="Gift card amount in dollars"
            className={`${input} mt-2`}
          />
        ) : null}
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-sm font-medium text-ink">How should it get to them?</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={sendToRecipient} onClick={() => setSendToRecipient(true)} className={chip(sendToRecipient)}>
            Email it to them
          </button>
          <button type="button" aria-pressed={!sendToRecipient} onClick={() => setSendToRecipient(false)} className={chip(!sendToRecipient)}>
            Send it to me
          </button>
        </div>
      </fieldset>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">Their name</span>
          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={80} className={`${input} mt-2`} />
        </label>
        {sendToRecipient ? (
          <label className="block">
            <span className="text-sm font-medium text-ink">Their email</span>
            <input
              type="email"
              required
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className={`${input} mt-2`}
            />
          </label>
        ) : null}
        <label className="block">
          <span className="text-sm font-medium text-ink">Your name</span>
          <input required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={80} autoComplete="name" className={`${input} mt-2`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">
            A note <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Happy birthday! Treat yourself."
            className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-[15px] leading-6 text-ink outline-none ring-1 ring-inset ring-ink/[0.12] transition focus:ring-2 focus:ring-ink"
          />
        </label>
      </div>

      {error ? <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !amountOk}
        className="mt-8 flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : amountOk ? `Pay ${cad(amountCents)}` : "Pay"}
      </button>
      <p className="mt-3 text-center text-xs leading-5 text-neutral-500">
        You pay {amountOk ? cad(amountCents) : "the card's value"} and nothing more. Secure checkout by Stripe, with Apple
        Pay and Google Pay. For use with {sellerName} only.
      </p>
    </form>
  );
}
