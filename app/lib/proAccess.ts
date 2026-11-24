// Who a signed-in account is, for page guards, in one place so pages can't
// disagree. Old profiles carry onboarding labels like "I am a customer".
//   customer: books pros
//   shop:     runs a studio but doesn't take clients (lives in /studio)
//   pro:      takes clients (solo or on a studio's team)
export type AccountKind = "customer" | "shop" | "pro";

export function accountKind(role: string | null | undefined): AccountKind | null {
  const r = String(role || "").toLowerCase().trim();
  if (!r) return null;
  if (r.includes("customer") || r === "client") return "customer";
  if (r === "shop") return "shop";
  return "pro";
}

// Where a non-pro goes when they open a pro-only page. `shopPath` is the
// studio version of the page, if there is one.
export function proPageRedirect(role: string | null | undefined, shopPath = "/studio"): string | null {
  const kind = accountKind(role);
  if (kind === "pro") return null;
  if (kind === "shop") return shopPath;
  return "/requests";
}

// A paid solo plan (Apprentice and up) unlocks the instant-booking schedule.
export function isSubscribedToSchedule(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const live = profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return live && !!profile.subscription_plan && profile.subscription_plan !== "basic";
}
