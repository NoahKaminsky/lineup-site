"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { buttonClass, panelClass } from "@/app/components/ui";
import { replayGuides, useGuides } from "@/app/components/guides/useGuides";
import { supabase } from "@/lib/supabaseClient";

// Signed in: bring back the welcome tour and every page tip, then go Home
// where the tour starts again.
export default function GuideControls() {
  const { ready, userId } = useGuides();
  const router = useRouter();
  const [working, setWorking] = useState(false);
  if (!ready) return null;

  async function replay() {
    setWorking(true);
    await replayGuides();
    // Shop accounts start in Studio; everyone else on their Home.
    const { data } = await supabase.from("profiles").select("role").eq("id", userId!).maybeSingle();
    router.push(data?.role === "shop" ? "/studio" : "/requests");
  }

  return (
    <div className={`${panelClass} mt-6 flex flex-wrap items-center justify-between gap-4 p-5`}>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">New here, or want a refresher?</p>
        <p className="mt-0.5 text-sm text-neutral-500">Replay the welcome tour and bring back the tips on each page.</p>
      </div>
      <button type="button" onClick={replay} disabled={working} className={buttonClass("primary", "md")}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {working ? "One moment…" : "Replay the tour"}
      </button>
    </div>
  );
}
