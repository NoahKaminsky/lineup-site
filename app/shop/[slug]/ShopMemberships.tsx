"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { loginHref } from "@/app/lib/returnTo";
import { formatCad, studioFetch } from "@/app/studio/studioApi";

// Memberships on a shop's booking page: join with a monthly card payment,
// or see your own membership and how many visits are left.

type Plan = { id: string; name: string; description: string | null; priceCents: number; visitsPerPeriod: number | null };
type Mine = {
  id: string;
  planId: string;
  planName: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  renewsOn: string | null;
  visitsUsed: number;
  visitsIncluded: number | null;
};

export default function ShopMemberships({ slug, shopName }: { slug: string; shopName: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [canJoin, setCanJoin] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSignedInUser();
      const res = await studioFetch<{ plans: Plan[]; mine: Mine[]; canJoin: boolean }>(
        `/api/memberships?slug=${encodeURIComponent(slug)}`
      );
      if (cancelled) return;
      setSignedIn(!!user);
      setPlans(res.data.plans || []);
      setMine(res.data.mine || []);
      setCanJoin(!!res.data.canJoin);
      const params = new URLSearchParams(window.location.search);
      if (params.get("joined") === "1") {
        setNotice({ tone: "success", text: `Welcome to ${shopName}. Your membership is active.` });
        window.history.replaceState({}, "", `/shop/${slug}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, shopName]);

  async function go(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNotice(null);
    const res = await studioFetch<{ url?: string }>("/api/memberships", { method: "POST", body });
    if (!res.ok || !res.data.url) {
      setNotice({ tone: "error", text: res.data.error || "Something went wrong." });
      setBusy(null);
      return;
    }
    window.location.assign(res.data.url);
  }

  if (!plans.length && !mine.length) return null;

  const minePlanIds = new Set(mine.map((m) => m.planId));

  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-[-0.02em]">Memberships</h2>
      <p className="mt-1 text-sm text-neutral-600">One monthly price, billed to your card. Cancel any time.</p>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-2xl border p-4 text-sm ${
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-neutral-200 bg-neutral-100 text-ink"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {mine.map((m) => (
        <div key={m.id} className="mt-4 rounded-panel border border-ink bg-surface p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Your membership</p>
          <p className="mt-1.5 font-semibold text-ink">{m.planName}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {m.visitsIncluded === null
              ? `Unlimited visits · ${m.visitsUsed} this month`
              : `${Math.max(m.visitsIncluded - m.visitsUsed, 0)} of ${m.visitsIncluded} visits left this month`}
            {m.renewsOn
              ? ` · ${m.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(m.renewsOn).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}`
              : ""}
          </p>
          {m.status === "past_due" ? (
            <p className="mt-2 text-sm font-medium text-red-700">Your last payment didn&apos;t go through. Update your card.</p>
          ) : null}
          <p className="mt-2 text-xs text-neutral-500">Book as usual and tell them you&apos;re a member when you arrive.</p>
          <button
            type="button"
            onClick={() => go({ action: "manage", slug }, "manage")}
            disabled={!!busy}
            className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-ink transition hover:bg-neutral-50 disabled:opacity-60"
          >
            {busy === "manage" ? "Opening…" : "Manage card or cancel"}
          </button>
        </div>
      ))}

      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {plans
          .filter((p) => !minePlanIds.has(p.id))
          .map((p) => (
            <li key={p.id} className="flex flex-col rounded-panel border border-hairline bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-ink">{p.name}</p>
                <p className="shrink-0 text-sm text-neutral-500">
                  <span className="text-xl font-semibold text-ink">{formatCad(p.priceCents)}</span>/mo
                </p>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-700">
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                {p.visitsPerPeriod === null ? "Unlimited visits" : `${p.visitsPerPeriod} ${p.visitsPerPeriod === 1 ? "visit" : "visits"} a month`}
              </p>
              {p.description ? <p className="mt-2 flex-1 text-sm leading-6 text-neutral-600">{p.description}</p> : <div className="flex-1" />}
              {canJoin ? (
                signedIn ? (
                  <button
                    type="button"
                    onClick={() => go({ action: "join", planId: p.id }, p.id)}
                    disabled={!!busy}
                    className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {busy === p.id ? "Opening checkout…" : "Join"}
                  </button>
                ) : (
                  <a
                    href={loginHref(`/shop/${slug}`, "signup")}
                    className="mt-4 rounded-full bg-ink px-5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                  >
                    Sign up to join
                  </a>
                )
              ) : (
                <p className="mt-4 text-xs text-neutral-500">Not open for sign-ups right now.</p>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
