// Small, pure helpers for picking photos (kept apart from normalizeImageFile,
// which needs browser APIs, so they can be unit-tested).

// Some pickers (Windows, some Android) hand over HEIC photos with an empty
// type, so the file name counts too.
export function isLikelyImageFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(file.name);
}

// Plain-English note when some picked photos couldn't be read.
export function photoReadFailureMessage(failed: number): string {
  if (failed <= 0) return "";
  return failed === 1
    ? "One photo couldn't be read. Try saving it as a JPEG or PNG and add it again."
    : `${failed} photos couldn't be read. Try saving them as JPEG or PNG and add them again.`;
}
