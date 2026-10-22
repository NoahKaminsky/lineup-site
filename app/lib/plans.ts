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
