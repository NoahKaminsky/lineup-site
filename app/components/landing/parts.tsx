import React from "react";
import Image from "next/image";

// While true, every plane that a generated photograph will replace shows a
// small label naming the asset, so the layout can be reviewed before any
// image exists. Flip to false once the real plates are dropped in.
export const SHOW_PLACEHOLDER_LABELS = false;

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

// A heading line that GSAP lifts out from behind its own baseline. The outer
// span is the mask; `.js-line` is what moves.
export function Line({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`block overflow-hidden pb-[0.08em] ${className}`}>
      <span className="js-line block will-change-transform">{children}</span>
    </span>
  );
}

// Modern device frame: thin bezel, pill-shaped island, one soft layered shadow.
export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative aspect-[9/19.5] rounded-[2.6rem] bg-ink p-[5px] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_40px_80px_-30px_rgba(0,0,0,0.45)] ring-1 ring-black/5 ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white">
        {children}
        <div aria-hidden="true" className="absolute left-1/2 top-[1.4%] z-10 h-[3.1%] w-[31%] -translate-x-1/2 rounded-full bg-ink" />
      </div>
    </div>
  );
}

export function Screen({
  src,
  alt,
  sizes,
  priority = false,
  eager = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  eager?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : eager ? "eager" : "lazy"}
      className="object-cover object-top"
    />
  );
}

export function PlaceholderTag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  if (!SHOW_PLACEHOLDER_LABELS) return null;
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 ring-1 ring-ink/10 backdrop-blur ${className}`}
    >
      {children}
    </span>
  );
}

// The studio: daylit white plaster wall meeting pale concrete, window light
// from the left. Generated (scrollcraft/builds/lineup); a portrait crop is
// art-directed for phones rather than squeezing the wide one.
export function StudioPlate({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <div aria-hidden="true" className={`absolute inset-0 bg-[#ecebe6] ${className}`}>
      <Image
        src="/images/landing/studio-wide.webp"
        alt=""
        fill
        priority={priority}
        sizes="100vw"
        className="hidden object-cover object-[50%_78%] lg:block"
      />
      <Image
        src="/images/landing/studio-tall.webp"
        alt=""
        fill
        priority={priority}
        sizes="100vw"
        className="object-cover object-[50%_70%] lg:hidden"
      />
    </div>
  );
}

export type StationKind = "barber" | "styling" | "nail" | "lash";

// Each station was shot on pure white, then "un-multiplied" from white into
// a true alpha cutout (soft contact shadow included). Plain alpha keeps the
// hero a stack of composited layers; a blend mode here re-blended every
// frame of the reveal and was the main cost on phones.
export function Station({
  kind,
  className = "",
  style,
}: {
  kind: StationKind;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/images/landing/station-${kind}-a.webp`} alt="" aria-hidden="true" draggable={false} className={className} style={style} />
  );
}
