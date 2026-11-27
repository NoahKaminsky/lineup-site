// The browser tab title for each page. The root layout adds " — LineUp", so
// "Earnings" shows as "Earnings — LineUp". Plain words, matching what the
// menu calls each page.

export const PAGE_TITLES = {
  "/account": "Account",
  "/admin": "Admin",
  "/analytics": "Analytics",
  "/archive": "Archived services",
  "/bookings/[id]": "Booking",
  "/calendar": "Calendar",
  "/chairs": "Chair openings",
  "/discover": "Browse pros",
  "/earnings": "Earnings",
  "/gift-cards": "Gift cards",
  "/import": "Bring your clients over",
  "/login": "Sign in",
  "/onboarding": "Set up your account",
  "/privacy": "Privacy",
  "/profile/[id]": "Profile",
  "/refer": "Invite a pro",
  "/regular/[id]": "Regular appointment",
  "/requests": "Requests",
  "/requests/[id]": "Request",
  "/requests/[id]/respond": "Send an offer",
  "/requests/new": "New request",
  "/reset-password": "Reset password",
  "/services": "Services",
  "/studio": "Studio",
  "/studio/join": "Join a shop",
  "/subscription": "Subscription",
  "/terms": "Terms",
  "/unsubscribe": "Unsubscribe",
  "/verification": "Verification",
  "/work": "Bookings",
} as const;

// Kept here rather than read from StudioContext (a client file the server
// can't read values from). A test checks it matches the Studio tabs.
const STUDIO_SECTION_LABELS: Record<string, string> = {
  profile: "Profile",
  calendar: "Calendar",
  requests: "Requests",
  team: "Team",
  clients: "Clients",
  import: "Import",
  memberships: "Memberships",
  chairs: "Chairs",
  analytics: "Analytics",
  earnings: "Earnings",
};

/** "Calendar · Studio" for /studio/calendar; just "Studio" for anything unknown. */
export function studioSectionTitle(section: string | undefined | null): string {
  const label = section ? STUDIO_SECTION_LABELS[section] : undefined;
  return label ? `${label} · Studio` : PAGE_TITLES["/studio"];
}

/** A pro's own name for their profile's tab and link previews, or "Profile". */
export function profileTitle(profile: { business_name?: string | null; full_name?: string | null } | null | undefined): string {
  const name = profile?.business_name?.trim() || profile?.full_name?.trim();
  return name || PAGE_TITLES["/profile/[id]"];
}
