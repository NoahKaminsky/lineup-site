"use client";

// "This is you in Explore." Shown on a pro's Home until they have three photos
// of their work: a live preview of their Browse card next to the one step that
// changes it most.

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Preview = { name: string; trade: string; image: string | null; photos: number };

export default function BrowseCardNudge({ userId }: { userId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [profileRes, photosRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, avatar_url, banner_url, professional_type, professional_types")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("professional_portfolio")
          .select("image_url, media_type", { count: "exact" })
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(1),
      ]);
      if (cancelled || !profileRes.data) return;
      const p = profileRes.data as {
        full_name: string | null;
        avatar_url: string | null;
        banner_url: string | null;
        professional_type: string | null;
        professional_types: string[] | null;
      };
      const firstPhoto = (photosRes.data || []).find((row) => row.media_type !== "video")?.image_url ?? null;
      const tradeKey = p.professional_types?.[0] || p.professional_type || "";
      setPreview({
        name: p.full_name || "You",
        trade: tradeKey ? tradeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Professional",
        image: firstPhoto || p.banner_url || p.avatar_url,
        photos: photosRes.count ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!preview || preview.photos >= 3) return null;

  const left = 3 - preview.photos;
  return (
    <section className="lu-rise mt-8 flex items-center gap-5 overflow-hidden rounded-[28px] bg-white p-4 pr-5 ring-1 ring-ink/[0.06] sm:p-5">
      <div className="lu-pinstripe relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-[18px] bg-[#efece6] sm:w-28">
        {preview.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="relative flex h-full w-full items-center justify-center text-4xl font-semibold tracking-[-0.06em] text-ink/80">
              {preview.name.charAt(0).toUpperCase()}
            </span>
          </>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-[-0.02em] text-ink">This is you in Explore.</p>
        <p className="mt-1 text-sm leading-6 text-neutral-500">
          Pros with photos of their work show up first. Add {left} more {left === 1 ? "photo" : "photos"} to get there.
        </p>
        <Link
          href="/account#portfolio"
          className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
        >
          Add photos
        </Link>
      </div>
    </section>
  );
}
