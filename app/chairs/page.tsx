"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import LuLoader from "@/app/components/LuLoader";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { formatCad, studioFetch } from "@/app/studio/studioApi";

// Chair openings for professionals: only chairs in their own trade(s).
// Studios post these from the Chairs tab on /studio.

type Opening = {
  id: string;
  title: string;
  studioName: string;
  studioSlug: string | null;
  professions: string[];
  arrangement: "booth_rent" | "commission" | "either";
  rentCents: number | null;
  rentInterval: "week" | "month" | null;
  commissionNote: string | null;
  description: string | null;
  availableFrom: string | null;
  areaLabel: string | null;
  distanceKm: number | null;
  featured: boolean;
  postedAt: string;
  applied: string | null;
};

function moneyLine(o: Opening) {
  const rent = o.rentCents !== null ? `${formatCad(o.rentCents)} / ${o.rentInterval === "month" ? "month" : "week"}` : null;
  if (o.arrangement === "booth_rent") return rent ? `Booth rent · ${rent}` : "Booth rent";
  if (o.arrangement === "commission") return o.commissionNote ? `Commission · ${o.commissionNote}` : "Commission";
  return [rent ? `Rent ${rent}` : "Booth rent", o.commissionNote ? `or commission (${o.commissionNote})` : "or commission"].join(" ");
}

function postedAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  return `Posted ${days} days ago`;
}

export default function ChairsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const [composing, setComposing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await studioFetch<{ openings: Opening[]; professions: string[] }>("/api/chairs");
    if (res.status === 401) {
      router.push("/login?next=/chairs");
      return;
    }
    if (!res.ok) setError(res.data.error || "Could not load chair openings.");
    else {
      setOpenings(res.data.openings || []);
      setProfessions(res.data.professions || []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    (async () => {
      if (!(await getSignedInUser())) {
        router.push("/login?next=/chairs");
        return;
      }
      await load();
    })();
  }, [load, router]);

  async function apply(id: string) {
    setSending(true);
    const res = await studioFetch("/api/chairs/apply", { method: "POST", body: { openingId: id, message } });
    setSending(false);
    if (!res.ok) {
      setError(res.data.error || "Could not send that.");
      return;
    }
    setOpenings((prev) => prev.map((o) => (o.id === id ? { ...o, applied: "new" } : o)));
    setComposing(null);
    setMessage("");
  }

  if (loading) return <LuLoader />;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl py-6 sm:py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">For pros only</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Chair openings</h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-neutral-600">
          Shops and studios on LineUp looking for pros in your trade
          {professions.length ? ` (${professions.join(", ")})` : ""}. Only professionals in the same trade can see these.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {openings.length === 0 && !error ? (
          <div className="mt-8 rounded-panel border border-hairline bg-surface p-6 text-sm leading-6 text-neutral-600">
            No chairs open in your trade right now. When a shop near you posts one, you&apos;ll get a notification.
          </div>
        ) : (
          <ul className="lu-lineup mt-8 space-y-4">
            {openings.map((o) => (
              <li key={o.id} className="rounded-panel border border-hairline bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {o.featured ? (
                      <span className="mb-2 inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-white">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Featured
                      </span>
                    ) : null}
                    <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">{o.title}</h2>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {o.studioSlug ? (
                        <Link href={`/shop/${o.studioSlug}`} className="font-medium text-ink underline decoration-neutral-300 underline-offset-4">
                          {o.studioName}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{o.studioName}</span>
                      )}
                      {" · "}
                      {o.professions.join(", ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">{postedAgo(o.postedAt)}</span>
                </div>

                <p className="mt-3 text-sm font-semibold text-ink">{moneyLine(o)}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                  {o.areaLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {o.areaLabel}
                      {o.distanceKm !== null ? <span className="text-neutral-400"> · {o.distanceKm} km away</span> : null}
                    </span>
                  ) : null}
                  {o.availableFrom ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      From {new Date(`${o.availableFrom}T00:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric" })}
                    </span>
                  ) : null}
                </div>

                {o.description ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-700">{o.description}</p> : null}

                <div className="mt-4">
                  {o.applied ? (
                    <span className="inline-flex rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700">
                      {o.applied === "invited" ? "They've invited you. Check your email." : "Sent. The shop will reach out."}
                    </span>
                  ) : composing === o.id ? (
                    <div className="space-y-3">
                      <label htmlFor={`msg-${o.id}`} className="sr-only">
                        Message to the shop
                      </label>
                      <textarea
                        id={`msg-${o.id}`}
                        rows={3}
                        maxLength={800}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Optional: a bit about you, your experience, when you could start."
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => apply(o.id)}
                          disabled={sending}
                          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                        >
                          {sending ? "Sending…" : "Send"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposing(null)}
                          className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-500 hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500">The shop sees your LineUp profile and this message.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setComposing(o.id);
                        setMessage("");
                      }}
                      className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                    >
                      I&apos;m interested
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
