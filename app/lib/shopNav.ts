// The shop's five sections. Each one is a page or a few related pages, so the
// top bar never has more than five places to go; related pages sit behind a
// small switch inside the section. "Your page" and Settings live behind the
// gear. Shared by the top bar and Studio so they always agree.

export type ShopIcon = "dashboard" | "calendar" | "clients" | "team" | "money";

export type ShopPage = { slug: string; label: string; managersOnly?: boolean };

export type ShopSection = { key: string; label: string; icon: ShopIcon; pages: readonly ShopPage[] };

export const SHOP_SECTIONS: readonly ShopSection[] = [
  {
    key: "today",
    label: "Today",
    icon: "dashboard",
    pages: [
      { slug: "", label: "Today" },
      { slug: "requests", label: "Requests" },
    ],
  },
  { key: "calendar", label: "Calendar", icon: "calendar", pages: [{ slug: "calendar", label: "Calendar", managersOnly: true }] },
  {
    key: "clients",
    label: "Clients",
    icon: "clients",
    pages: [
      { slug: "clients", label: "Clients", managersOnly: true },
      { slug: "memberships", label: "Memberships" },
      { slug: "import", label: "Import", managersOnly: true },
    ],
  },
  {
    key: "team",
    label: "Team",
    icon: "team",
    pages: [
      { slug: "team", label: "Team" },
      { slug: "chairs", label: "Hiring", managersOnly: true },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "money",
    pages: [
      { slug: "earnings", label: "Earnings", managersOnly: true },
      { slug: "analytics", label: "Reports", managersOnly: true },
    ],
  },
];

/** Behind the gear, for owners and managers. Settings is the owner's. */
export const SHOP_GEAR_PAGES: readonly (ShopPage & { ownerOnly?: boolean })[] = [
  { slug: "profile", label: "Your page", managersOnly: true },
  { slug: "settings", label: "Settings", ownerOnly: true },
];

export function shopHref(slug: string) {
  return slug ? `/studio/${slug}` : "/studio";
}

/** The sections someone can see, each with only the pages they can open, and where its tab goes. */
export function visibleShopSections(canManage: boolean) {
  return SHOP_SECTIONS.map((s) => {
    const pages = s.pages.filter((p) => canManage || !p.managersOnly);
    return { ...s, pages, href: pages.length ? shopHref(pages[0].slug) : "" };
  }).filter((s) => s.pages.length > 0);
}

/** The Studio page slug for a path: "/studio/team/x" → "team", "/studio" → "". Null off Studio. */
export function shopSlugFromPath(pathname: string): string | null {
  if (pathname !== "/studio" && !pathname.startsWith("/studio/")) return null;
  return pathname.replace(/^\/studio\/?/, "").split("/")[0] || "";
}

/** Which section a Studio page belongs to ("chairs" → "team"). Null for gear pages and unknown ones. */
export function shopSectionKey(slug: string | null): string | null {
  if (slug === null) return null;
  return SHOP_SECTIONS.find((s) => s.pages.some((p) => p.slug === slug))?.key ?? null;
}

// ── Shop / My work ────────────────────────────────────────────────────────
// An owner or manager who also takes clients switches between running the
// shop and their own work. The page they're on decides; pages that belong to
// both (account, notifications) keep the last choice.

export type WorkMode = "shop" | "work";

const WORK_PATHS = ["/requests", "/calendar", "/services", "/work", "/earnings", "/analytics", "/subscription", "/import", "/discover", "/archive", "/refer", "/chairs", "/verification"];

export function modeForPath(pathname: string, last: WorkMode): WorkMode {
  if (shopSlugFromPath(pathname) !== null && !pathname.startsWith("/studio/join")) return "shop";
  if (WORK_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "work";
  return last;
}
