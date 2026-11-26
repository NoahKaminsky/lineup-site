// Every first-run tip in one place, in LineUp's voice: plain, short, and
// always "request", "offer", "shop". Each tip says what the page is for and
// the two or three things people come there to do. Pure data, so
// tests/guides can check every link points at a real page.
import type { GuideKey } from "./guides";

export type TipContent = {
  id: GuideKey;
  title: string;
  body: string;
  points?: { text: string; href?: string }[];
};

export const TIPS = {
  // Customers
  discover: {
    id: "tip:discover",
    title: "Find a pro near you",
    body: "Every pro here is verified. Tap a card to see their work, reviews and prices.",
    points: [
      { text: "Tap the heart to save a pro for later" },
      { text: "Book an open time right on their profile" },
      { text: "Or post a request and get offers", href: "/requests/new" },
    ],
  },
  customerBookings: {
    id: "tip:customer-bookings",
    title: "Your bookings",
    body: "Upcoming and past appointments. The address shows here once you've booked.",
    points: [
      { text: "Open a booking to message your pro or cancel" },
      { text: "After your visit, confirm it's done so your pro gets paid" },
      { text: "Leave a review. It helps the next client choose" },
    ],
  },
  newRequest: {
    id: "tip:new-request",
    title: "Post a request",
    body: "Say what you want, when and where. Pros nearby send offers with a price, and you only pay once you accept one.",
    points: [
      { text: "Add a reference photo for better offers" },
      { text: "Have a pro in mind? Choose them so they see it first" },
    ],
  },

  // Pros
  work: {
    id: "tip:work",
    title: "Requests, offers and bookings",
    body: "Requests near you, the offers you've sent and your upcoming bookings all live here.",
    points: [
      { text: "Send an offer on a request you want to take" },
      { text: "Withdraw an offer any time before it's accepted" },
      { text: "After the appointment, mark it done to get paid" },
    ],
  },
  services: {
    id: "tip:services",
    title: "What clients can book",
    body: "Add each service with a price and how long it takes, then set where you work: your place, theirs or a shop.",
    points: [
      { text: "Your address stays private until someone books" },
      { text: "On a paid plan, set weekly hours so clients book open times instantly", href: "/subscription" },
    ],
  },
  calendar: {
    id: "tip:calendar",
    title: "Your week at a glance",
    body: "Every booking from LineUp and your shop in one calendar.",
    points: [
      { text: "Sync it to your phone's calendar so it's always up to date" },
      { text: "Set up regulars once and their visits repeat on their own" },
    ],
  },
  earnings: {
    id: "tip:earnings",
    title: "Your money in one place",
    body: "What you've earned, what's on its way, and a statement you can download any time.",
    points: [
      { text: "Add cash or outside income so your totals are complete" },
      { text: "Use Tax year to track expenses and keep receipts" },
    ],
  },
  analytics: {
    id: "tip:analytics",
    title: "How your business is doing",
    body: "Bookings, how often clients come back, your busiest hours and your goals.",
    points: [
      { text: "Set a goal for the month and watch it fill up" },
      { text: "Win back clients you haven't seen in a while" },
    ],
  },
  giftCards: {
    id: "tip:gift-cards",
    title: "Sell gift cards",
    body: "Share your gift card link. People buy online, and you take the code off the bill at the appointment.",
  },
  chairs: {
    id: "tip:chairs",
    title: "Find a chair",
    body: "Shops near you post open chairs here. Apply with your resume in a couple of taps.",
  },
  importClients: {
    id: "tip:import",
    title: "Bring your clients over",
    body: "Upload the export from your old booking app. Your clients and upcoming appointments come with you, so nobody gets lost.",
  },
  subscription: {
    id: "tip:subscription",
    title: "Pick how you want to grow",
    body: "Basic is free. Paid plans add instant booking, your own booking link and more, and you can change plans any time.",
  },
  account: {
    id: "tip:account",
    title: "This is what clients see",
    body: "Your photo, bio and portfolio decide who books you, and payouts decide how you get paid. Fill these in first.",
  },

  // Shops (Studio sections)
  studioProfile: {
    id: "tip:studio-profile",
    title: "Your shop's page",
    body: "Add a cover photo, your space, hours and how to reach you. It's what clients see before they book, and where they review you.",
  },
  studioCalendar: {
    id: "tip:studio-calendar",
    title: "The shop calendar",
    body: "Everyone's day side by side. Add walk-ins and phone bookings, and mark each visit done or a no-show.",
  },
  studioRequests: {
    id: "tip:studio-requests",
    title: "Requests near the shop",
    body: "Clients nearby who want to come in to a shop. Pass each request to the right pro on your team.",
  },
  studioTeam: {
    id: "tip:studio-team",
    title: "Your team",
    body: "Invite pros by email and set what each person can do. On Studio Plus, choose commission or booth rent for each pro.",
  },
  studioClients: {
    id: "tip:studio-clients",
    title: "Your client list",
    body: "Everyone who's booked the shop. Import the list you already have, or invite clients to book on LineUp.",
  },
  studioImport: {
    id: "tip:studio-import",
    title: "Bring your calendar over",
    body: "Upload the export from your old booking app. Clients and upcoming appointments come in so the switch is painless.",
  },
  studioMemberships: {
    id: "tip:studio-memberships",
    title: "Memberships for regulars",
    body: "Monthly plans your regulars pay for online. Check them in at the desk when they come in.",
  },
  studioChairs: {
    id: "tip:studio-chairs",
    title: "Chair openings",
    body: "Post an open chair, review the pros who apply, and boost the post to reach more people.",
  },
  studioAnalytics: {
    id: "tip:studio-analytics",
    title: "Shop analytics",
    body: "Sales by pro, by chair and by hour, with alerts when something changes.",
  },
  studioEarnings: {
    id: "tip:studio-earnings",
    title: "Shop earnings",
    body: "Your pros' sales, the shop's cut, booth rent, memberships and gift cards, all in one report.",
  },
  studioSettings: {
    id: "tip:studio-settings",
    title: "Shop settings",
    body: "Your shop's public page, your plan, where the shop gets paid, and the default commission.",
  },
} as const satisfies Record<string, TipContent>;

// Which tip belongs to which Studio section slug ("" is Today, which has the tour).
export const STUDIO_SECTION_TIPS: Record<string, TipContent> = {
  profile: TIPS.studioProfile,
  calendar: TIPS.studioCalendar,
  requests: TIPS.studioRequests,
  team: TIPS.studioTeam,
  clients: TIPS.studioClients,
  import: TIPS.studioImport,
  memberships: TIPS.studioMemberships,
  chairs: TIPS.studioChairs,
  analytics: TIPS.studioAnalytics,
  earnings: TIPS.studioEarnings,
  settings: TIPS.studioSettings,
};

// Every guide key, for test users who should start with all guides already
// seen (scripts/test-data.mts) and for "seen everything" checks.
export const ALL_GUIDE_KEYS: string[] = [
  "legacy:imported",
  "tour:customer",
  "tour:pro",
  "tour:shop",
  "tour:shop-member",
  "checklist:customer",
  "checklist:pro",
  "checklist:shop",
  "checklist:shop-shared",
  ...Object.values(TIPS).map((t) => t.id),
];
