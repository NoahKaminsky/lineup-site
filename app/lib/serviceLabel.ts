// Requests used to save their service as "Category: Service" (e.g.
// "Hair: Haircut", or "Hair: Haircut • Lashes: Classic set"), which then
// showed up verbatim on cards and bookings. Show just the services.
export function cleanServiceLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split(" • ")
    .map((part) => part.replace(/^[^:•]{1,40}:\s*/, "").trim())
    .filter(Boolean)
    .join(" • ");
}
