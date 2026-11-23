"use client";

// Account › notifications: the opt-in Monday push summary for pros and shop
// owners. Off by default. Push only.

import { useEffect, useState } from "react";
import { studioFetch } from "@/app/studio/studioApi";
import { Toggle } from "@/app/studio/ui";

export default function WeeklyPushToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studioFetch<{ on?: boolean }>("/api/notifications/weekly-push").then((res) => setOn(res.ok ? !!res.data.on : false));
  }, []);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    const res = await studioFetch<{ on?: boolean; error?: string }>("/api/notifications/weekly-push", { method: "POST", body: { on: next } });
    if (!res.ok) {
      setOn(!next);
      setError(res.data.error || "Could not save that.");
    }
  }

  if (on === null) return <div className="h-20 animate-pulse rounded-panel bg-neutral-100" />;
  return (
    <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-6">
      <Toggle
        checked={on}
        onChange={(v) => void change(v)}
        label="Weekly summary by push"
        description="Monday morning: last week's revenue, bookings and new clients, with one thing to try. Tap it to open Analytics. Needs push notifications turned on above."
      />
      {error ? <p className="mt-2 text-xs text-[#A30D25]">{error}</p> : null}
    </div>
  );
}
