// Paid boosts (see supabase/migrations/20261102_chairs_and_boosts.sql).
// Prices in CAD cents. Safe to import from the browser.

export type BoostKind = "profile" | "chair_opening";

export const BOOSTS: Record<BoostKind, { label: string; cents: number; days: number; description: string }> = {
  profile: {
    label: "Boost your profile",
    cents: 1500,
    days: 7,
    description: "Shown near the top of Browse and in the Spotlight row for a week, marked Promoted.",
  },
  chair_opening: {
    label: "Feature this opening",
    cents: 1000,
    days: 7,
    description: "Pinned to the top of chair openings for a week.",
  },
};

export function formatBoostPrice(kind: BoostKind) {
  return `$${(BOOSTS[kind].cents / 100).toFixed(0)}`;
}
