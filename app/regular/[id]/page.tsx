"use client";

// A regular appointment's next visit: confirm and pay in one tap (the link in
// the reminder), or stop being a regular. The pro can open it too, to see it
// or stop it.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import PaymentModal from "@/app/components/payments/PaymentModal";

type Regular = {
  id: string;
  role: "client" | "pro";
  service: string | null;
  serviceId: string | null;
  mode: string;
  every: string;
  nextDate: string;
  start: string;
  end: string;
  priceCents: number | null;
  pro: { id: string; name: string; avatarUrl: string | null; href: string | null };
  client: { id: string; name: string };
  active: boolean;
  nextBookingId: string | null;
};

async function authed(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

function prettyDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function prettyTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export default function RegularPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [regular, setRegular] = useState<Regular | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    const res = await authed(`/api/standing?id=${encodeURIComponent(id)}`);
    if (res.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(`/regular/${id}`)}`);
      return null;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Couldn't load this regular appointment.");
      return null;
    }
    setRegular(json.regular);
    return json.regular as Regular;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    authed(`/api/standing?id=${encodeURIComponent(id)}`).then(async (res) => {
      if (cancelled) return;
      if (res.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(`/regular/${id}`)}`);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) setRegular(json.regular);
      else setError(json.error || "Couldn't load this regular appointment.");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function confirmAndPay() {
    if (!regular) return;
    setBusy(true);
    setError("");
    const res = await authed("/api/stripe/create-payment-intent", {
      method: "POST",
      body: JSON.stringify({
        flowType: "direct_booking",
        professionalId: regular.pro.id,
        serviceId: regular.serviceId,
        date: regular.nextDate,
        startTime: regular.start,
        endTime: regular.end,
        mode: regular.mode,
        standingId: regular.id,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !json.clientSecret) {
      setError(json.error || "Couldn't start the payment.");
      return;
    }
    setClientSecret(json.clientSecret);
  }

  // After paying, the booking is made by Stripe's confirmation; wait for it.
  async function waitForBooking() {
    setClientSecret(null);
    setConfirming(true);
    for (let i = 0; i < 15; i++) {
      const next = await load();
      if (next?.nextBookingId) {
        setConfirming(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setConfirming(false);
    setError("Your payment went through. The booking can take a minute to show up; check Bookings shortly.");
  }

  async function stop() {
    if (!regular || !window.confirm("Stop this regular appointment? Visits you've already booked stay booked.")) return;
    setStopping(true);
    const res = await authed("/api/standing", { method: "POST", body: JSON.stringify({ action: "end", id: regular.id }) });
    setStopping(false);
    if (res.ok) setRegular({ ...regular, active: false });
    else setError("Couldn't stop it. Please try again.");
  }

  if (!regular) {
    return (
      <main className="min-h-screen bg-paper px-4 py-16 text-center text-sm text-neutral-500">
        {error || "Loading…"}
      </main>
    );
  }

  const isClient = regular.role === "client";
  const price = regular.priceCents !== null ? (regular.priceCents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" }) : null;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-6">
      <div className="mx-auto max-w-lg py-6">
        <p className="text-xs font-medium text-neutral-500">Regular appointment · {regular.every}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {regular.service || "Appointment"} with {isClient ? regular.pro.name : regular.client.name}
        </h1>

        <div className="mt-8 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
          <p className="text-sm text-neutral-500">{regular.active ? "Next visit" : "This regular appointment has stopped."}</p>
          {regular.active ? (
            <>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{prettyDate(regular.nextDate)}</p>
              <p className="mt-1 text-neutral-600">
                {prettyTime(regular.start)} to {prettyTime(regular.end)}
                {price ? ` · ${price}` : ""}
              </p>

              {regular.nextBookingId ? (
                <Link
                  href={`/bookings/${regular.nextBookingId}`}
                  className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  {isClient ? "You're booked. See your booking" : "Booked. See the booking"}
                </Link>
              ) : isClient ? (
                <>
                  <button
                    type="button"
                    onClick={confirmAndPay}
                    disabled={busy || confirming}
                    className="mt-6 flex w-full items-center justify-center rounded-full bg-ink py-3.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {confirming ? "Confirming your booking…" : busy ? "Opening payment…" : `Confirm and pay${price ? ` ${price}` : ""}`}
                  </button>
                  <p className="mt-3 text-xs leading-5 text-neutral-500">
                    This time is held for you until two days before. If it isn&apos;t confirmed by then, it&apos;s released.
                  </p>
                </>
              ) : (
                <p className="mt-6 text-sm text-neutral-600">Held for {regular.client.name}. They&apos;ll get a link to confirm a week before.</p>
              )}
            </>
          ) : null}
        </div>

        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {regular.active ? (
          <button
            type="button"
            onClick={stop}
            disabled={stopping}
            className="mt-8 text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-red-700 disabled:opacity-60"
          >
            {stopping ? "Stopping…" : "Stop this regular appointment"}
          </button>
        ) : null}
      </div>

      {clientSecret ? (
        <PaymentModal
          clientSecret={clientSecret}
          title={`${regular.service || "Appointment"} on ${prettyDate(regular.nextDate)}`}
          proName={regular.pro.name}
          onClose={() => setClientSecret(null)}
          onSuccess={waitForBooking}
          redirectTo={null}
        />
      ) : null}
    </main>
  );
}
