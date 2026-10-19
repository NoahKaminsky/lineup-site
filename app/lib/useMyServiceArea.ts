"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type MyServiceArea = {
  location_lat: number | null;
  location_lng: number | null;
  service_radius_km?: number | null;
};

// The signed-in pro's base and service radius, for filtering request lists.
// Selects "*" so it works before and after the service-area migration.
export function useMyServiceArea(userId: string | null | undefined, enabled = true) {
  const [area, setArea] = useState<MyServiceArea | null>(null);
  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setArea({
          location_lat: data.location_lat ?? null,
          location_lng: data.location_lng ?? null,
          ...("service_radius_km" in data ? { service_radius_km: data.service_radius_km } : {}),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);
  return area;
}
