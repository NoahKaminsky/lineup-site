import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { isResizablePhoto } from "@/app/lib/photo";

type PhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string;
  /** Widest the photo shows, in CSS px (e.g. 48 for an avatar). Used when `sizes` isn't given. */
  width?: number;
  /** For photos whose width follows the screen, e.g. "(min-width: 1024px) 25vw, 50vw". */
  sizes?: string;
  /** Above-the-fold photo: load right away instead of lazily. */
  priority?: boolean;
};

// A plain <img> (same classes and layout as before) whose uploaded photo is
// served resized as AVIF/WebP instead of the full-size original.
export function Photo({ src, width = 640, sizes, priority, alt = "", loading, ...rest }: PhotoProps) {
  if (!isResizablePhoto(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading={priority ? "eager" : loading ?? "lazy"} decoding="async" {...rest} />;
  }
  const { props } = getImageProps({ src, alt, width, height: width, sizes, quality: 75 });
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      width={undefined}
      height={undefined}
      style={undefined}
      decoding="async"
      loading={priority ? "eager" : loading ?? "lazy"}
      fetchPriority={priority ? "high" : undefined}
      {...rest}
      alt={alt}
    />
  );
}
