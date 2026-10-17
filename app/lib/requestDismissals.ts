"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Professionals can clear an open request they don't want to respond to.
// Dismissals live in request_dismissals (one row per pro + request) so they
// follow the pro across devices, and are mirrored in localStorage so they
// also work before migration 20261017_request_dismissals.sql has been run
// (database errors are ignored and the local copy carries it).

function storageKey(userId: string) {
  return `lineup_dismissed_requests_${userId}`;
}

function readLocal(userId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids.slice(-500)));
  } catch {
    // storage unavailable: the database copy still applies
  }
}

export function useDismissedRequests(userId: string | null | undefined, enabled = true) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    (async () => {
      const ids = new Set(readLocal(userId));
      const { data, error } = await supabase
        .from("request_dismissals")
        .select("request_id")
        .eq("professional_id", userId);
      if (!error && data) data.forEach((row: { request_id: string }) => ids.add(row.request_id));
      if (!cancelled) setDismissed(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  const dismiss = useCallback(
    async (requestId: string) => {
      if (!userId) return;
      setDismissed((prev) => new Set(prev).add(requestId));
      writeLocal(userId, Array.from(new Set([...readLocal(userId), requestId])));
      const { error } = await supabase
        .from("request_dismissals")
        .upsert({ professional_id: userId, request_id: requestId }, { onConflict: "professional_id,request_id" });
      if (error) console.warn("Request dismissal kept on this device only:", error.message);
    },
    [userId]
  );

  return { dismissed, dismiss };
}

// One-off dismissal outside a list (e.g. the request page).
export async function dismissRequestOnce(userId: string, requestId: string) {
  writeLocal(userId, Array.from(new Set([...readLocal(userId), requestId])));
  const { error } = await supabase
    .from("request_dismissals")
    .upsert({ professional_id: userId, request_id: requestId }, { onConflict: "professional_id,request_id" });
  if (error) console.warn("Request dismissal kept on this device only:", error.message);
}
