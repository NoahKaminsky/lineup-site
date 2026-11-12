"use client";

// "Sync to your calendar": a pro's LineUp bookings in Apple, Google or
// Outlook calendar, kept up to date automatically by a private feed link.

import { useState } from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Sheet, panelClass } from "@/app/studio/ui";

type Links = { url: string; apple: string; google: string; outlook: string };

export default function CalendarSync() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Links | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function openSheet() {
    setOpen(true);
    if (links) return;
    setError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/calendar/link", {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setLinks(json);
    else setError(json.error || "Couldn't get your calendar link.");
  }

  async function copy() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  const option = "flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-ink/[0.04]";

  return (
    <>
      <Button onClick={openSheet}>
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        Sync to your calendar
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Sync to your calendar"
        description="Your LineUp bookings and shop appointments show up in your phone's calendar and stay up to date on their own. New bookings appear, and cancelled ones disappear."
      >
        {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {!links && !error ? <p className="text-sm text-neutral-500">Getting your link…</p> : null}
        {links ? (
          <div className="space-y-6">
            <div className={`${panelClass} divide-y divide-hairline`}>
              <a href={links.apple} className={option}>
                Apple Calendar (iPhone, Mac)
                <span className="text-sm font-normal text-neutral-500">Add</span>
              </a>
              <a href={links.google} target="_blank" rel="noopener noreferrer" className={option}>
                Google Calendar
                <span className="text-sm font-normal text-neutral-500">Add</span>
              </a>
              <a href={links.outlook} target="_blank" rel="noopener noreferrer" className={option}>
                Outlook
                <span className="text-sm font-normal text-neutral-500">Add</span>
              </a>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">Or copy your link</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                For any other calendar app: look for &ldquo;Subscribe&rdquo; or &ldquo;Add from URL&rdquo; and paste it in.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={links.url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Your calendar link"
                  className="h-10 min-w-0 flex-1 truncate rounded-xl bg-surface px-3 text-xs text-neutral-600 shadow-[inset_0_0_0_1px_rgba(10,10,10,0.12)] outline-none"
                />
                <Button onClick={copy}>
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <p className="text-xs leading-5 text-neutral-500">
              Google checks for changes every few hours, Apple about every 15 minutes, so a brand-new booking can take a
              little while to appear. Keep this link to yourself: anyone with it can see your bookings (clients&apos;
              first names only, no phone numbers).
            </p>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
