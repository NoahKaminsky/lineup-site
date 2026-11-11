"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getProfileHref } from "@/app/lib/profileLink";
import SaveHeart from "@/app/components/SaveHeart";

/* The client's saved pros, on their account page: the people they hearted in
   Explore or on a profile, newest first, each one tap from booking again. */

type SavedPro = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  professional_type: string | null;
  professional_types: string[] | null;
  location: string | null;
};

function roleLabel(pro: SavedPro) {
  const types =
    Array.isArray(pro.professional_types) && pro.professional_types.length > 0
      ? pro.professional_types
      : pro.professional_type
      ? [pro.professional_type]
      : [];
  if (types.length === 0) return "Professional";
  return types
    .slice(0, 2)
    .map((value) => value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(" & ");
}

export default function SavedProsCard({ clientId }: { clientId: string }) {
  const [pros, setPros] = useState<SavedPro[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: rows, error } = await supabase
        .from("saved_pros")
        .select("professional_id, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setUnavailable(true);
        return;
      }

      const ids = (rows || []).map((row: { professional_id: string }) => row.professional_id);
      if (ids.length === 0) {
        setPros([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url, professional_type, professional_types, location")
        .in("id", ids);

      if (cancelled) return;
      const byId = new Map(((profiles || []) as SavedPro[]).map((pro) => [pro.id, pro]));
      setPros(ids.map((id: string) => byId.get(id)).filter((pro): pro is SavedPro => !!pro));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function remove(pro: SavedPro) {
    const before = pros;
    setPros((current) => (current || []).filter((item) => item.id !== pro.id));
    const { error } = await supabase
      .from("saved_pros")
      .delete()
      .eq("client_id", clientId)
      .eq("professional_id", pro.id);
    if (error) setPros(before);
  }

  // Saved pros isn't set up on this database yet: show nothing rather than an error.
  if (unavailable) return null;

  return (
    <div id="saved-pros" className="scroll-mt-28 rounded-[28px] bg-white p-6 ring-1 ring-ink/[0.07]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Saved pros</h2>
        {pros && pros.length > 0 ? (
          <Link href="/discover" className="text-xs font-semibold text-neutral-500 transition hover:text-ink">
            Find more
          </Link>
        ) : null}
      </div>

      {pros === null ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
                <div className="h-3 w-1/3 animate-pulse rounded-full bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      ) : pros.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm leading-6 text-neutral-600">Tap the heart on a pro to save them here.</p>
          <Link
            href="/discover"
            className="mt-4 inline-flex rounded-full bg-neutral-100 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-neutral-200"
          >
            Explore pros
          </Link>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-ink/[0.06]">
          {pros.map((pro) => {
            const name = pro.full_name?.trim() || "Professional";
            return (
              <li key={pro.id} className="flex items-center gap-3 py-3">
                <Link href={getProfileHref(pro)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-sm font-semibold text-neutral-500">
                    {pro.avatar_url ? (
                      <img loading="lazy" src={pro.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{name}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {roleLabel(pro)}
                      {pro.location?.trim() ? ` in ${pro.location.trim()}` : ""}
                    </span>
                  </span>
                </Link>
                <SaveHeart
                  saved
                  name={name}
                  onToggle={() => remove(pro)}
                  className="shrink-0 bg-transparent! shadow-none!"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
