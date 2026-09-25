"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { VerificationTrack } from "@/app/lib/verificationRules";

export type VerificationState = {
  status: string | null;
  until: string | null;
  // Set once approved: what they were verified as.
  track: VerificationTrack | null;
  // What their most recent submission was, so "under review" / "rejected"
  // copy can say proof of enrollment vs licence.
  submittedTrack: VerificationTrack | null;
};

// Loads the signed-in professional's verification state. Returns null while
// loading, for customers, and if the lookup fails — every caller treats null
// as "show nothing", so a hiccup here can never block or blank a page.
export function useVerificationState(): VerificationState | null {
  const [state, setState] = useState<VerificationState | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, verification_status, verification_track, verified_until")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled || error || !profile) return;

      const role = String(profile.role || "").toLowerCase();
      if (!role || role.includes("customer")) return;

      let submittedTrack: VerificationTrack | null = null;

      if (profile.verification_status !== "verified") {
        const { data: rows } = await supabase
          .from("professional_verifications")
          .select("track")
          .eq("professional_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        submittedTrack = (rows?.[0]?.track as VerificationTrack | undefined) ?? null;
      }

      if (cancelled) return;

      setState({
        status: profile.verification_status ?? null,
        until: profile.verified_until ?? null,
        track: (profile.verification_track as VerificationTrack | null) ?? null,
        submittedTrack,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
