"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useWebPush } from "@/app/lib/useWebPush";
import { DrawnCheck } from "@/app/components/moments/Moments";
import { buttonClass, panelClass } from "@/app/components/ui";
import { customerChecklist } from "@/app/lib/guides";
import { markGuideSeen, useGuides } from "./useGuides";

// A new customer's first four steps on Home. It's decided from what the page
// already has on first paint (their requests and bookings), so nothing below
// it jumps; saved pros, photo and notifications tick themselves off a moment
// later. Retires for good once everything's done, or when closed.
export default function CustomerChecklist({
  userId,
  requests,
  bookings,
  onVisibleChange,
}: {
  userId: string;
  requests: number;
  bookings: number;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const guides = useGuides();
  const push = useWebPush();
  const [savedPros, setSavedPros] = useState(0);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [working, setWorking] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("saved_pros").select("professional_id", { count: "exact", head: true }).eq("client_id", userId),
      supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
    ]).then(([saved, profile]) => {
      if (cancelled) return;
      setSavedPros(saved.count ?? 0);
      setHasPhoto(!!profile.data?.avatar_url);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const steps = customerChecklist({
    savedPros,
    requests,
    bookings,
    hasPhoto,
    // Until the browser has answered, show notifications as still to do.
    push: { supported: push.loading || push.supported, subscribed: push.subscribed, denied: push.permission === "denied" },
  });
  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;
  const hidden = guides.seen("checklist:customer");
  const visible = !hidden && !allDone;

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  // Finished: retire it everywhere (only once we know whose list it is).
  useEffect(() => {
    if (allDone && guides.ready) markGuideSeen("checklist:customer");
  }, [allDone, guides.ready]);

  if (!visible) return null;

  async function turnOnNotifications() {
    setWorking(true);
    setPushError("");
    const result = await push.subscribe();
    setWorking(false);
    if (!result.ok) setPushError(result.error || "Couldn't turn on notifications.");
  }

  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="get-started-title" className={`${panelClass} mt-8 overflow-hidden`}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          <h2 id="get-started-title" className="text-[1.15rem] font-semibold tracking-[-0.02em] text-ink">
            Get started
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            {done} of {steps.length} done. Four quick steps to your first booking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => markGuideSeen("checklist:customer")}
          aria-label="Hide getting started"
          className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mx-5 mt-4 h-1 overflow-hidden rounded-full bg-ink/[0.07] sm:mx-6" aria-hidden="true">
        <div className="h-full rounded-full bg-ink transition-[width] duration-700 ease-premium" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-3 px-2 pb-3 sm:px-3">
        {steps.map((s) => {
          const isNext = s === next;
          const body = (
            <>
              {s.done ? (
                <DrawnCheck size={24} />
              ) : (
                <span aria-hidden="true" className={`h-6 w-6 shrink-0 rounded-full border-2 ${isNext ? "border-ink" : "border-neutral-200"}`} />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? "text-neutral-400 line-through decoration-neutral-300" : "text-ink"}`}>
                  {s.label}
                </span>
                {!s.done ? <span className="mt-0.5 block text-[13px] leading-5 text-neutral-500">{s.why}</span> : null}
                {s.key === "notify" && pushError ? <span className="mt-1 block text-[13px] text-[#A30D25]">{pushError}</span> : null}
              </span>
            </>
          );
          const row = "group flex min-h-14 w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left transition-colors";
          if (s.done) {
            return (
              <li key={s.key}>
                <div className={row}>{body}</div>
              </li>
            );
          }
          if (s.key === "notify") {
            return (
              <li key={s.key}>
                <div className={row}>
                  {body}
                  {push.isIOS && !push.isStandalone ? (
                    <Link href="/account#push-notifications" className={buttonClass("secondary", "sm", "shrink-0")}>
                      How
                    </Link>
                  ) : (
                    <button type="button" onClick={turnOnNotifications} disabled={working} className={buttonClass(isNext ? "primary" : "secondary", "sm", "shrink-0")}>
                      {working ? "Turning on…" : "Turn on"}
                    </button>
                  )}
                </div>
              </li>
            );
          }
          return (
            <li key={s.key}>
              <Link href={s.href || "/discover"} className={`${row} hover:bg-ink/[0.03]`}>
                {body}
                {s.key === "book" ? (
                  <span className="hidden shrink-0 text-[13px] font-medium text-neutral-500 sm:inline">Post a request</span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
