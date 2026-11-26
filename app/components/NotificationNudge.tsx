"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { useWebPush } from "@/app/lib/useWebPush";
import { buttonClass } from "@/app/components/ui";

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
            className={buttonClass("secondary", "md")}
          >
            Show me how
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={working}
            className={buttonClass("primary", "md")}
          >
            {working ? "Enabling…" : "Enable notifications"}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white hover:text-neutral-600"
        >
          <X aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
