"use client";

import { useState, type MouseEvent } from "react";
import { useWebPush } from "@/app/lib/useWebPush";
import { burstOrigin, fireBurst } from "@/app/components/moments/Burst";

// Drop this anywhere a user should be able to turn on/off browser push —
// it loads its own state via useWebPush() and renders nothing on a
// platform that doesn't support it (e.g. iOS Safari before "Add to Home
// Screen", or a browser without Push API support at all).
export default function PushNotificationToggle() {
  const { supported, permission, subscribed, loading, isIOS, isStandalone, subscribe, unsubscribe } = useWebPush();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [justEnabled, setJustEnabled] = useState(false);

  if (loading) return null;

  // iOS Safari doesn't expose the Push API at all until the site has been
  // added to the home screen — there's no "Install" button Apple lets a
  // website trigger, so the only thing to do is show them exactly how.
  if (isIOS && !isStandalone) {
    return (
      <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          Push notifications
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          On iPhone, add LineUp to your Home Screen first — then notifications work just like a
          real app, with the LineUp icon and everything.
        </p>
        <ol className="mt-4 space-y-2 text-sm leading-6 text-neutral-700">
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
              1
            </span>
            {/* One text node per step: as bare children of the flex row, the
                plain text and <strong> became separate columns with a gap. */}
            <span>
              Tap the <strong>Share</strong> button in Safari (the square with an arrow, in the bottom toolbar).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
              2
            </span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
              3
            </span>
            <span>
              Open LineUp from the icon on your Home Screen, then come back to this page to turn
              notifications on.
            </span>
          </li>
        </ol>
      </div>
    );
  }

  if (!supported) return null;

  async function handleEnable(e: MouseEvent<HTMLButtonElement>) {
    const origin = burstOrigin(e);
    setWorking(true);
    setMessage("");
    const result = await subscribe();
    if (!result.ok) setMessage(result.error || "Couldn't turn on notifications.");
    else {
      // The bell rings once as the "on" pill lands.
      if (origin) fireBurst(origin, "spark");
      setJustEnabled(true);
    }
    setWorking(false);
  }

  async function handleDisable() {
    setWorking(true);
    setMessage("");
    await unsubscribe();
    setWorking(false);
  }

  return (
    <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
        Push notifications
      </p>
      <p className="mt-2 text-sm leading-6 text-neutral-500">
        Get instant alerts right on this device — new offers, matching requests, and appointment
        reminders — even when LineUp isn&apos;t open. Free, and nothing to type in.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {subscribed ? (
          <>
            <span
              className={`inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900 ${
                justEnabled ? "lu-pop-in" : ""
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 ${justEnabled ? "lu-bell-ring" : ""}`}
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10 2.75a4.75 4.75 0 0 0-4.75 4.75v2.6L4 12.75h12l-1.25-2.65V7.5A4.75 4.75 0 0 0 10 2.75zM8 15a2 2 0 0 0 4 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Notifications on
            </span>
            <button
              type="button"
              onClick={handleDisable}
              disabled={working}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white disabled:opacity-60"
            >
              Turn off
            </button>
          </>
        ) : permission === "denied" ? (
          <p className="text-sm text-neutral-500">
            Notifications are blocked for LineUp in your browser settings. Allow them there to turn this on.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={working}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {working ? "Enabling…" : "Enable notifications"}
          </button>
        )}
      </div>

      {message ? <p className="mt-2 text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
