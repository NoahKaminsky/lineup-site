"use client";

// Gift cards, for the pro or shop that sells them: the link to share,
// taking a card off a client's bill, and every card sold.

import { useEffect, useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Card = {
  id: string;
  code: string;
  forShop: boolean;
  amountCents: number;
  balanceCents: number;
  status: string;
  from: string | null;
  to: string | null;
  soldAt: string;
};

function cad(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: T & { error?: string } }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

const field =
  "h-12 w-full rounded-xl bg-surface px-4 text-[15px] text-ink outline-none ring-1 ring-inset ring-ink/[0.12] transition focus:ring-2 focus:ring-ink";

export default function GiftCardsPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [links, setLinks] = useState<{ label: string; path: string }[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [found, setFound] = useState<Card | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function reload() {
    const res = await api<{ cards: Card[]; links: { label: string; path: string }[] }>("/api/gift-cards/manage");
    if (res.status === 401) {
      window.location.assign("/login?next=/gift-cards");
      return;
    }
    if (res.ok) {
      setCards(res.json.cards);
      setLinks(res.json.links || []);
    } else setError(res.json.error || "Couldn't load your gift cards.");
  }

  useEffect(() => {
    let cancelled = false;
    api<{ cards: Card[]; links: { label: string; path: string }[] }>("/api/gift-cards/manage").then((res) => {
      if (cancelled) return;
      if (res.status === 401) {
        window.location.assign("/login?next=/gift-cards");
        return;
      }
      if (res.ok) {
        setCards(res.json.cards);
        setLinks(res.json.links || []);
      } else setError(res.json.error || "Couldn't load your gift cards.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function lookUp(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setFound(null);
    setBusy(true);
    const res = await api<{ card: Card }>(`/api/gift-cards/manage?code=${encodeURIComponent(code)}`);
    setBusy(false);
    if (res.ok) {
      setFound(res.json.card);
      setAmount(String(res.json.card.balanceCents / 100));
    } else setNotice({ tone: "error", text: res.json.error || "Couldn't find that card." });
  }

  async function redeem() {
    if (!found) return;
    const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    if (!cents || cents <= 0) return setNotice({ tone: "error", text: "Enter the amount to take off." });
    setBusy(true);
    const res = await api<{ balanceCents: number }>("/api/gift-cards/manage", {
      method: "POST",
      body: JSON.stringify({ action: "redeem", code: found.code, amountCents: cents }),
    });
    setBusy(false);
    if (!res.ok) return setNotice({ tone: "error", text: res.json.error || "Couldn't take that off the card." });
    setNotice({ tone: "ok", text: `Took ${cad(cents)} off. ${cad(res.json.balanceCents)} left on the card.` });
    setFound(null);
    setCode("");
    void reload();
  }

  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(path);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* the link is visible to copy by hand */
    }
  }

  const sold = (cards || []).reduce((sum, c) => sum + c.amountCents, 0);
  const outstanding = (cards || []).filter((c) => c.status === "active").reduce((sum, c) => sum + c.balanceCents, 0);

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-12 py-6 sm:py-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Gift cards</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
            Clients buy a gift card for you on LineUp and the money goes straight to your payouts, less 3.2% card
            processing and a $1 LineUp fee. When someone brings one in, take it off their bill here.
          </p>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Use a gift card</h2>
          <form onSubmit={lookUp} className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LU-XXXX-XXXX-XXXX"
              aria-label="Gift card code"
              autoComplete="off"
              spellCheck={false}
              className={`${field} font-mono tracking-wider`}
            />
            <button
              type="submit"
              disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 12}
              className="h-12 shrink-0 rounded-full bg-ink px-6 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Look up
            </button>
          </form>

          {found ? (
            <div className="mt-4 rounded-2xl bg-surface p-5 ring-1 ring-ink/[0.06]">
              <p className="text-sm text-neutral-500">
                {found.code}
                {found.to ? ` · for ${found.to}` : ""}
                {found.from ? ` · from ${found.from}` : ""}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{cad(found.balanceCents)} left</p>
              {found.balanceCents > 0 && found.status === "active" ? (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <label className="min-w-[10rem] flex-1">
                    <span className="text-sm font-medium">Amount to take off</span>
                    <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} mt-2`} />
                  </label>
                  <button
                    type="button"
                    onClick={redeem}
                    disabled={busy}
                    className="h-12 rounded-full bg-ink px-6 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Take it off
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">Nothing left to use on this card.</p>
              )}
            </div>
          ) : null}

          {notice ? (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
            >
              {notice.text}
            </p>
          ) : null}
        </section>

        {links.length ? (
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Your gift card link</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">Put it in your Instagram bio or send it to clients before the holidays.</p>
            <ul className="mt-4 space-y-2">
              {links.map((l) => (
                <li key={l.path} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-ink/[0.06]">
                  <Gift className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="truncate text-xs text-neutral-500">lineup-aesthetics.ca{l.path}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(l.path)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-inset ring-ink/[0.14] hover:bg-neutral-50"
                  >
                    {copied === l.path ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied === l.path ? "Copied" : "Copy"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Sold</h2>
            {cards?.length ? (
              <p className="text-sm text-neutral-500">
                {cad(sold)} sold · {cad(outstanding)} still to be used
              </p>
            ) : null}
          </div>
          {cards === null ? (
            <p className="mt-4 text-sm text-neutral-500">Loading…</p>
          ) : cards.length ? (
            <ul className="mt-4 divide-y divide-hairline rounded-2xl bg-surface ring-1 ring-ink/[0.06]">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">
                      {c.to || "Gift card"}
                      {c.forShop ? <span className="ml-2 text-xs font-normal text-neutral-500">Shop</span> : null}
                    </p>
                    <p className="truncate text-sm text-neutral-500">
                      {c.from ? `From ${c.from} · ` : ""}
                      {new Date(c.soldAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {c.code}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm">
                    <span className="font-semibold">{cad(c.balanceCents)}</span>
                    <span className="block text-xs text-neutral-500">of {cad(c.amountCents)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl bg-surface px-4 py-8 text-center text-sm text-neutral-500 ring-1 ring-ink/[0.06]">
              No gift cards sold yet. Share your link to get the first one.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
