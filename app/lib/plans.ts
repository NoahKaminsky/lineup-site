import { MASTER_COMMISSION_PERCENT, STANDARD_COMMISSION_PERCENT } from "./commission";

// What each plan includes, in one place: the plans page (where pros buy a
// plan) and the FAQ both read from here, so they can't drift apart.
// Each paid plan also includes everything in the plan below it.
export const PLAN_FEATURES: Record<"basic" | "apprentice" | "pro" | "master", string[]> = {
  basic: [
    "Profile, portfolio and reviews",
    "Show up in Explore once verified",
    "Get requests and send offers",
    "Up to 15 request bookings per month",
    `${STANDARD_COMMISSION_PERCENT}% LineUp commission`,
  ],
  apprentice: [
    "Instant-booking calendar on your profile",
    "Your own booking link",
    "Weekly hours, time off and booking window",
    "Up to 25 request bookings per month",
    "Basic analytics",
    "Apprentice badge, ranked higher in Explore",
  ],
  pro: [
    "Unlimited request bookings",
    "Full analytics",
    "In the Explore Spotlight, the big card at the top",
    "Pro badge",
    "Higher placement in Explore",
  ],
  master: [
    `Reduced ${MASTER_COMMISSION_PERCENT}% LineUp commission (instead of ${STANDARD_COMMISSION_PERCENT}%)`,
    "Twice the Spotlight time of Pro",
    "Master badge",
    "Top placement in Explore",
  ],
};

// Studio plans: one flat price for the whole shop, any number of pros.
// Prices are CAD per month. Every member gets Pro features (unlimited request
// bookings, instant-booking calendar, booking link) without paying for their
// own plan.
export type StudioPlan = "studio" | "studio_plus";

export const STUDIO_PLANS: Record<
  StudioPlan,
  { label: string; priceLabel: string; features: string[] }
> = {
  studio: {
    label: "Studio",
    priceLabel: "$79",
    features: [
      "One calendar for the whole shop, with online booking",
      "Client requests near your shop, passed to the right pro",
      "Walk-ins and phone bookings at the front desk",
      "0% LineUp commission on your own clients",
      "Chair openings, seen only by pros in that trade",
      "Monthly memberships for your regulars",
      "Every pro gets their own login and Pro features (2 pros or more)",
    ],
  },
  studio_plus: {
    label: "Studio Plus",
    priceLabel: "$149",
    features: [
      "Everything in Studio",
      "Set the shop's commission, for the whole team or per pro",
      "Or charge booth rent, collected by card automatically",
      "The shop's cut is paid out to the shop automatically",
      "Shop earnings by member",
    ],
  },
};

// Read with literal names so Next.js inlines them in the browser bundle.
export function studioPriceIdFor(plan: StudioPlan) {
  return plan === "studio_plus"
    ? process.env.NEXT_PUBLIC_STRIPE_STUDIO_PLUS_PRICE_ID
    : process.env.NEXT_PUBLIC_STRIPE_STUDIO_PRICE_ID;
}

export function studioPlanFromPriceId(priceId: string | null | undefined): StudioPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_STUDIO_PRICE_ID) return "studio";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_STUDIO_PLUS_PRICE_ID) return "studio_plus";
  return null;
}
