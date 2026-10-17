// Every image upload runs through this first, so whatever gets stored is
// something every browser can display.
//
// Why: iPhones save photos as HEIC, which only Safari renders, and files
// also arrive mislabelled (an AVIF saved with a .HEIC name was stored as
// image/heic and showed as a broken image everywhere). The file's real
// contents decide what happens, never its name:
//   1. JPEG / PNG / WebP / GIF that really are what they say: untouched.
//   2. Anything the browser itself can decode (AVIF everywhere, HEIC in
//      Safari, a mislabelled file): redrawn and re-encoded as JPEG.
//   3. Genuine HEIC that this browser can't decode: converted with heic-to,
//      which is only downloaded when such a file is actually picked.
// If nothing can read it, the original goes up unchanged, as before.

const WEB_SAFE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

// Sniff the real format from the first bytes.
async function sniff(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (HEIC_BRANDS.includes(brand)) return "image/heic";
  }
  return null;
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "photo";
}

async function toJpeg(source: ImageBitmap, name: string, lastModified: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not encode JPEG");
  return new File([blob], `${baseName(name)}.jpg`, { type: "image/jpeg", lastModified });
}

export async function normalizeImageFile(file: File): Promise<File> {
  let actual: string | null = null;
  try {
    actual = await sniff(file);
  } catch {
    return file;
  }

  // 1. Already web-safe and honestly labelled.
  if (actual && WEB_SAFE.includes(actual)) {
    return file.type === actual ? file : new File([file], file.name, { type: actual, lastModified: file.lastModified });
  }

  // 2. The browser can read it: re-encode as JPEG.
  try {
    const bitmap = await createImageBitmap(file);
    return await toJpeg(bitmap, file.name, file.lastModified);
  } catch {
    // fall through
  }

  // 3. HEIC this browser can't decode.
  if (actual === "image/heic" || /\.(heic|heif)$/i.test(file.name)) {
    try {
      const { heicTo } = await import("heic-to/next");
      const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
      return new File([jpeg], `${baseName(file.name)}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
    } catch (error) {
      console.error("HEIC conversion failed:", error);
    }
  }

  return file;
}
