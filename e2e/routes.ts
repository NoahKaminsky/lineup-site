/**
 * Every page the smoke test opens, and who opens it.
 * `as` names a TEST account from scripts/test-data.mts (lineup.test+<as>@example.com),
 * or "public" for logged out. Dynamic ids/slugs are filled in at run time from the
 * seeded TEST data (see e2e/smoke.spec.ts), so this list stays plain data.
 */
export type Viewer = "public" | "customer" | "admin" | "basic" | "master" | "owner" | "manager" | "member1";

export type SmokeRoute = {
  path: string;
  as: Viewer;
  /** Where a correct visit should end up, if it redirects (prefix match). */
  expectPath?: string;
};

const pub = (path: string, expectPath?: string): SmokeRoute => ({ path, as: "public", expectPath });

export const SMOKE_ROUTES: SmokeRoute[] = [
  // Public
  pub("/"),
  pub("/about"),
  pub("/contact"),
  pub("/faq"),
  pub("/privacy"),
  pub("/terms"),
  pub("/news"),
  pub("/news/lineup-is-live"),
  pub("/beauty"),
  pub("/beauty/winnipeg"),
  pub("/beauty/winnipeg/barbers"),
  pub("/discover"),
  pub("/shops"),
  pub("/shop/{shopSlug}"),
  pub("/profile/{masterId}"),
  pub("/gift/shop/{shopSlug}"),
  pub("/gift/pro/{masterId}"),
  pub("/gift/balance"),
  pub("/login"),
  pub("/reset-password"),
  pub("/unsubscribe"),
  // Logged-out visits to private pages should land on /login
  pub("/requests", "/login"),
  pub("/work", "/login"),
  pub("/account", "/login"),

  // Customer
  { path: "/requests", as: "customer" },
  { path: "/requests/new", as: "customer" },
  { path: "/requests/{openRequestId}", as: "customer" },
  { path: "/bookings/{confirmedBookingId}", as: "customer" },
  { path: "/bookings/{completedBookingId}", as: "customer" },
  { path: "/regular/{standingId}", as: "customer" },
  { path: "/account", as: "customer" },
  { path: "/archive", as: "customer" },
  { path: "/discover", as: "customer" },
  { path: "/shop/{shopSlug}", as: "customer" },
  { path: "/work", as: "customer" },

  // Basic pro (no paid plan)
  { path: "/work", as: "basic" },
  { path: "/requests/{openRequestId}/respond", as: "basic" },
  { path: "/calendar", as: "basic" },
  { path: "/services", as: "basic" },
  { path: "/earnings", as: "basic" },
  { path: "/analytics", as: "basic" },
  { path: "/subscription", as: "basic" },
  { path: "/verification", as: "basic" },
  { path: "/chairs", as: "basic" },
  { path: "/refer", as: "basic" },
  { path: "/gift-cards", as: "basic" },
  { path: "/import", as: "basic" },
  { path: "/account", as: "basic" },

  // Master pro
  { path: "/work", as: "master" },
  { path: "/calendar", as: "master" },
  { path: "/earnings", as: "master" },
  { path: "/analytics", as: "master" },
  { path: "/import", as: "master" },
  { path: "/bookings/{completedBookingId}", as: "master" },
  { path: "/regular/{standingId}", as: "master" },
  { path: "/profile/{masterId}", as: "master" },

  // Studio Plus owner: every section
  { path: "/studio", as: "owner" },
  ...["calendar", "requests", "team", "clients", "import", "memberships", "chairs", "analytics", "earnings", "settings"].map(
    (s): SmokeRoute => ({ path: `/studio/${s}`, as: "owner" }),
  ),
  { path: "/earnings", as: "owner" },
  { path: "/analytics", as: "owner" },

  // Manager and plain member
  { path: "/studio", as: "manager" },
  { path: "/studio/analytics", as: "manager" },
  { path: "/studio", as: "member1" },
  { path: "/studio/requests", as: "member1" },
  { path: "/work", as: "member1" },

  // Admin
  { path: "/admin", as: "admin" },
];

/** Fill {placeholders} from the seeded TEST ids. Throws if one is missing. */
export function fillRoute(path: string, ids: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!ids[k]) throw new Error(`No TEST id for {${k}} (did the seed run?)`);
    return ids[k];
  });
}
