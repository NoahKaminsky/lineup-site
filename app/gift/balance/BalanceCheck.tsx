"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Result = { code: string; forName: string; href: string | null; amountCents: number; balanceCents: number; void: boolean };

function cad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export default function BalanceCheck({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const checkedInitial = useRef(false);

  async function check(value: string) {
    setBusy(true);
    setError("");
    setResult(null);
    const res = await fetch(`/api/gift-cards/balance?code=${encodeURIComponent(value)}`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setResult(json);
    else setError(json.error || "We couldn't check that code.");
  }

  // Opened from the link in the gift card email: check straight away.
  useEffect(() => {
    if (initialCode && !checkedInitial.current) {
      checkedInitial.current = true;
      fetch(`/api/gift-cards/balance?code=${encodeURIComponent(initialCode)}`)
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => (ok ? setResult(json) : setError(json.error || "We couldn't check that code.")))
        .catch(() => setError("We couldn't check that code."));
    }
  }, [initialCode]);

  return (
    <div className="max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check(code);
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="LU-XXXX-XXXX-XXXX"
          aria-label="Gift card code"
          autoComplete="off"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 rounded-xl bg-white px-4 font-mono text-[15px] tracking-wider text-ink outline-none ring-1 ring-inset ring-ink/[0.12] focus:ring-2 focus:ring-ink"
        />
        <button
          type="submit"
          disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 12}
          className="h-12 rounded-full bg-ink px-6 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </form>

      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {result ? (
        <div className="mt-6 rounded-3xl bg-ink p-7 text-white">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">Gift card for {result.forName}</p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.03em]">{cad(result.balanceCents)}</p>
          <p className="mt-1 text-sm text-white/60">
            {result.void ? "This card has been cancelled." : `left of ${cad(result.amountCents)}. Never expires.`}
          </p>
          {result.href && !result.void && result.balanceCents > 0 ? (
            <Link href={result.href} className="mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-neutral-200">
              Book with {result.forName}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
