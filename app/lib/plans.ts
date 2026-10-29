import { MASTER_COMMISSION_PERCENT, STANDARD_COMMISSION_PERCENT } from "./commission";

// What each plan includes, in one place: the plans page (where pros buy a
// plan) and the FAQ both read from here, so they can't drift apart.
// Each paid plan also includes everything in the plan below it.
export const PLAN_FEATURES: Record<"basic" | "apprentice" | "pro" | "master", string[]> = {
  basic: [
    "Profile, portfolio and reviews",
    "Show up in Browse once verified",
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
    "Apprentice badge and a boost in Browse",
  ],
  pro: [
    "Unlimited request bookings",
    "Full analytics",
    "10 Explore Page promotions per month",
    "Pro badge",
    "Higher placement in Browse and the Spotlight row",
  ],
  master: [
    `Reduced ${MASTER_COMMISSION_PERCENT}% LineUp commission (instead of ${STANDARD_COMMISSION_PERCENT}%)`,
    "Unlimited Explore Page promotions",
    "Master badge",
    "Top placement in Browse and first in the Spotlight row",
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
    priceLabel: "$39",
    features: [
      "For teams of 2 or more, one flat price, no cap on team size",
      "Each pro gets their own login and Pro features",
      "Every member's schedule in one place",
      "Front desk: book walk-ins and phone-ins, paid at the shop",
      "Sell monthly memberships to your clients",
      "Post chair openings, seen only by pros in that trade",
      "0% LineUp commission on your own clients",
      "Commission only on new clients LineUp sends you through requests",
    ],
  },
  studio_plus: {
    label: "Studio Plus",
    priceLabel: "$99",
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
