// Which image URLs go through Next's image resizer. Only photos people upload to
// LineUp's Supabase Storage (live and the TEST project); anything else (blob:
// previews, other hosts) is shown as-is, because the resizer refuses unknown hosts.
export const PHOTO_HOSTS = ["rbsgsymjmptwczecgohb.supabase.co", "zfxeymtuwrjtccxqymrj.supabase.co"];

export function isResizablePhoto(src: string | null | undefined): src is string {
  if (!src) return false;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && PHOTO_HOSTS.includes(url.hostname) && url.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}
