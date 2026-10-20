"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Number of OTHER pros who have an active offer on each request, keyed by
// request id. Pass only the requests the current pro hasn't bid on yet.
export function useBidCounts(requestIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = [...new Set(requestIds)].sort().join(",");

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/requests/bid-counts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ requestIds: key.split(",") }),
      }).catch(() => null);

      if (!res || !res.ok || cancelled) return;
      const body = await res.json().catch(() => null);
      if (!cancelled && body?.counts) setCounts(body.counts);
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return counts;
}
