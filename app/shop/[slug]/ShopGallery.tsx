"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Photo } from "@/app/components/Photo";

type Pic = { id: string; url: string; caption: string | null };

// The shop's photos: a swipeable row on phones, a tidy grid on laptops, and a
// full-screen viewer (arrow keys, swipe, Esc) when one is tapped.
export default function ShopGallery({ photos, shopName }: { photos: Pic[]; shopName: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, step]);

  const [touchX, setTouchX] = useState<number | null>(null);
  const shown = photos.slice(0, 9);

  return (
    <>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {shown.map((p, i) => (
          <li key={p.id} className={`shrink-0 snap-start ${i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block aspect-[4/5] w-[68vw] overflow-hidden rounded-2xl bg-ink/[0.05] sm:aspect-square sm:w-full"
              aria-label={`Open photo ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`}
            >
              <Photo
                src={p.url}
                alt={p.caption || `${shopName}, photo ${i + 1}`}
                width={i === 0 ? 900 : 480}
                sizes={i === 0 ? "(min-width: 640px) 440px, 68vw" : "(min-width: 640px) 220px, 68vw"}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-premium group-hover:scale-[1.03]"
              />
              {i === shown.length - 1 && photos.length > shown.length ? (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">+{photos.length - shown.length} more</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {open !== null && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${shopName} photos`}
              className="lu-fade-in fixed inset-0 z-[120] flex flex-col bg-ink/95 text-white"
              onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchX === null) return;
                const dx = e.changedTouches[0].clientX - touchX;
                if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
                setTouchX(null);
              }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-sm tabular-nums text-white/70">
                  {open + 1} / {photos.length}
                </p>
                <button type="button" onClick={close} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10">
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[open].url} alt={photos[open].caption || `${shopName}, photo ${open + 1}`} className="max-h-full max-w-full rounded-xl object-contain" />
                {photos.length > 1 ? (
                  <>
                    <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </div>
              <p className="min-h-12 px-6 py-4 text-center text-sm text-white/80">{photos[open].caption || ""}</p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
