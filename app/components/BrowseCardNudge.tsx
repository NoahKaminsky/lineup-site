"use client";

// "This is you in Explore." Shown on a pro's Home until they have three photos
// of their work: a live preview of their Browse card next to the one step that
// changes it most.

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Photo } from "@/app/components/Photo";
import { buttonClass } from "@/app/components/ui";
import { browsePreview, portfolioPreviewQuery, type BrowsePreview, type PreviewProfile } from "@/app/lib/browsePreview";

type Preview = BrowsePreview;

// `initial`: the page already loaded it (so the card appears with the page
// instead of pushing it down a moment later). Without it, it loads its own.
export default function BrowseCardNudge({ userId, initial }: { userId: string; initial?: BrowsePreview | null }) {
  const [fetched, setFetched] = useState<Preview | null>(null);
  const preview = initial !== undefined ? initial : fetched;

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    (async () => {
      const [profileRes, photosRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, avatar_url, banner_url, professional_type, professional_types")
          .eq("id", userId)
          .maybeSingle(),
        portfolioPreviewQuery(supabase, userId),
      ]);
      if (cancelled || !profileRes.data) return;
      setFetched(browsePreview(profileRes.data as PreviewProfile, photosRes.data || [], photosRes.count ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, initial]);

  if (!preview || preview.photos >= 3) return null;

  const left = 3 - preview.photos;
  return (
    <section className="lu-rise mt-8 flex items-center gap-5 overflow-hidden rounded-3xl bg-white p-4 pr-5 ring-1 ring-ink/[0.06] sm:p-5">
      <div className="lu-pinstripe relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-[18px] bg-[#efece6] sm:w-28">
        {preview.image ? (
          <Photo src={preview.image} width={112} className="h-full w-full object-cover" />
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
          className={buttonClass("primary", "sm", "mt-3")}
        >
          Add photos
        </Link>
      </div>
    </section>
  );
}
