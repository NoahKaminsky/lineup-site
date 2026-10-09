"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWebPush } from "@/app/lib/useWebPush";

const DISMISS_KEY = "lineup-notif-nudge-dismissed";

// A one-time nudge toward turning on push notifications, for people who'd
// never think to go looking in Account settings. Dismisses itself for good
// once closed or once notifications are actually turned on (both stored
// per-browser, same as the subscription itself).
export default function NotificationNudge() {
  const { supported, permission, subscribed, loading, isIOS, isStandalone, subscribe } = useWebPush();
  const [dismissed, setDismissed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // Private browsing / blocked storage: just show the nudge every visit.
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to fall back to — it'll just reappear next visit.
    }
  }

  if (loading || dismissed || subscribed || permission === "denied") return null;

  const showIOSInstructions = isIOS && !isStandalone;
  if (!showIOSInstructions && !supported) return null;

  async function handleEnable() {
    setWorking(true);
    setError("");
    const result = await subscribe();
    if (!result.ok) {
      setError(result.error || "Couldn't turn on notifications.");
    } else {
      dismiss();
    }
    setWorking(false);
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
      <div>
        <p className="font-semibold text-neutral-900">
          {showIOSInstructions ? "Get instant alerts on your iPhone" : "Turn on instant alerts"}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {showIOSInstructions
            ? "Add LineUp to your Home Screen to get notified the moment you get a new offer, request, or booking update."
            : "Get notified the moment you get a new offer, request, or booking update — even when LineUp isn't open."}
        </p>
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showIOSInstructions ? (
          <Link
            href="/account#push-notifications"
            className="inline-flex rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white"
          >
            Show me how
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={working}
            className="inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {working ? "Enabling..." : "Enable notifications"}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full p-2 text-neutral-400 transition hover:bg-white hover:text-neutral-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
