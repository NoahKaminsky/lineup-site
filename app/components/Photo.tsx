"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

// Drop-in replacement for <img> for user-uploaded photos (avatars, covers,
// portfolio and reference photos).
//
// Uploads are stored at up to 800–2000px, but most of the time they are shown
// as a 40px avatar or a small thumbnail. A plain <img> downloads the full
// file every time. This asks Next's image optimizer for a copy that is the
// size actually shown on this screen, in AVIF/WebP, cached at the edge.
//
//   <Photo src={url} w={48} />                    fixed size (CSS px)
//   <Photo src={url} sizes="(min-width:1024px) 50vw, 100vw" />   fluid
//
// Anything the optimizer can't take (blob: previews, signed URLs, other
// hosts) is rendered as a normal <img>, and if an optimized request ever
// fails the original file is loaded instead, so a photo never goes missing.

const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_PREFIX = SUPABASE_ORIGIN ? `${SUPABASE_ORIGIN}/storage/v1/object/public/` : null;

// Must stay within next.config's images.imageSizes + deviceSizes (defaults).
const WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920];
const FLUID_WIDTHS = [256, 384, 640, 828, 1080, 1200, 1920];

function fit(px: number) {
  return WIDTHS.find((w) => w >= px) ?? WIDTHS[WIDTHS.length - 1];
}

function optimized(src: string, width: number) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

function canOptimize(src: string) {
  if (!PUBLIC_PREFIX || !src.startsWith(PUBLIC_PREFIX)) return false;
  // Animated GIFs and SVGs are passed through untouched anyway.
  return !/\.(gif|svg)(\?|$)/i.test(src);
}

type PhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string | null | undefined;
  /** Largest size this is shown at, in CSS pixels. For fixed-size images. */
  w?: number;
};

export default function Photo({ src, w, sizes, alt = "", onError, ...rest }: PhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement | null>(null);

  // A server-rendered image can fail before React is listening for errors.
  // Catch that case once the page is interactive.
  useEffect(() => {
    const img = ref.current;
    if (src && img && img.complete && img.naturalWidth === 0 && img.currentSrc.includes("/_next/image")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with the DOM image's real load state
      setFailedSrc(src);
    }
  }, [src]);

  if (!src) return null;

  if (failedSrc === src || !canOptimize(src) || (!w && !sizes)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img decoding="async" {...rest} src={src} alt={alt} onError={onError} />;
  }

  // If the optimized copy fails, fall back to the original file. The caller's
  // own onError only fires if that fails too.
  const fallback = () => setFailedSrc(src);

  if (w) {
    const x1 = fit(w);
    const x2 = fit(w * 2);
    const x3 = fit(w * 3);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        decoding="async"
        {...rest}
        alt={alt}
        src={optimized(src, x2)}
        srcSet={`${optimized(src, x1)} 1x, ${optimized(src, x2)} 2x, ${optimized(src, x3)} 3x`}
        onError={fallback}
        ref={ref}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      decoding="async"
      {...rest}
      alt={alt}
      sizes={sizes}
      src={optimized(src, 1080)}
      srcSet={FLUID_WIDTHS.map((width) => `${optimized(src, width)} ${width}w`).join(", ")}
      onError={fallback}
        ref={ref}
    />
  );
}
