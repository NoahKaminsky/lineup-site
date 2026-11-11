"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";

/* Saved pros: a client hearts a pro and they land in the "Saved pros" list on
   the client's account page. One row per (client, pro) in saved_pros; row-level
   security keeps each list private to its owner.

   canSave is only true for a signed-in client once their list has loaded, so
   hearts never show for pros, shops, signed-out visitors, or before the
   saved_pros table exists. */

function isClientRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().includes("customer");
}

export function useSavedPros() {
  const [canSave, setCanSave] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const userIdRef = useRef<string | null>(null);
  const savedRef = useRef<Set<string>>(savedIds);

  useEffect(() => {
    savedRef.current = savedIds;
  }, [savedIds]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const user = await getSignedInUser();
      if (!user || cancelled) return;

      const [profileResult, savedResult] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("saved_pros").select("professional_id").eq("client_id", user.id),
      ]);
      if (cancelled) return;
      if (savedResult.error || !isClientRole(profileResult.data?.role)) return;

      userIdRef.current = user.id;
      setSavedIds(new Set((savedResult.data || []).map((row: { professional_id: string }) => row.professional_id)));
      setCanSave(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flips straight away so the heart feels instant; puts it back if the save fails.
  const toggle = useCallback(async (professionalId: string) => {
    const userId = userIdRef.current;
    if (!userId) return false;

    const wasSaved = savedRef.current.has(professionalId);
    const apply = (saved: boolean) =>
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(professionalId);
        else next.delete(professionalId);
        return next;
      });

    apply(!wasSaved);

    const { error } = wasSaved
      ? await supabase.from("saved_pros").delete().eq("client_id", userId).eq("professional_id", professionalId)
      : await supabase
          .from("saved_pros")
          .upsert({ client_id: userId, professional_id: professionalId }, { onConflict: "client_id,professional_id" });

    if (error) {
      apply(wasSaved);
      return false;
    }
    return true;
  }, []);

  return { canSave, savedIds, toggle };
}
