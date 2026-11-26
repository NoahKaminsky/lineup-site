// "How do I…?" guides for the Help page: every main feature, in the order
// people meet it, with where to find it. Plain voice; always "request",
// "offer", "shop". Pure data so tests/guides can check every link.

export type HelpGuide = {
  id: string;
  title: string;
  steps: string[];
  link?: { label: string; href: string };
};

export type HelpSection = { id: "clients" | "pros" | "shops"; title: string; intro: string; guides: HelpGuide[] };

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "clients",
    title: "For clients",
    intro: "Find a pro, book, pay and keep track of your appointments.",
    guides: [
      {
        id: "find-a-pro",
        title: "Find a pro",
        steps: [
          "Open Explore. It shows verified pros near you.",
          "Search for what you want, or scroll who's free soon.",
          "Tap a pro to see their work, prices and reviews.",
          "Tap the heart to save them for later. Saved pros are on your Account page.",
        ],
        link: { label: "Open Explore", href: "/discover" },
      },
      {
        id: "book-a-time",
        title: "Book an open time",
        steps: [
          "On a pro's profile, choose a service.",
          "Pick a day and an open time.",
          "Pay in the app to confirm. You'll get a confirmation and a reminder before your visit.",
        ],
        link: { label: "Find a pro", href: "/discover" },
      },
      {
        id: "post-a-request",
        title: "Post a request and get offers",
        steps: [
          "Tap New request and say what you want, when and where.",
          "Add a reference photo and a budget if you have one.",
          "Pros nearby send offers with a price and a time.",
          "Compare them, accept the one you like and pay. You only pay once you accept.",
        ],
        link: { label: "Post a request", href: "/requests/new" },
      },
      {
        id: "book-a-shop",
        title: "Book at a shop",
        steps: [
          "Open Shops to see shops near you.",
          "Pick a shop, then a pro and a time.",
          "Some shops let you save a card and pay at the shop instead.",
        ],
        link: { label: "Browse shops", href: "/shops" },
      },
      {
        id: "after-booking",
        title: "After you book",
        steps: [
          "Bookings has the address, the time and a chat with your pro.",
          "Need to change plans? Cancel from the booking.",
          "After your visit, confirm it's done. That's what pays your pro.",
          "Leave a review to help the next client choose.",
        ],
        link: { label: "Open Bookings", href: "/work" },
      },
      {
        id: "gift-cards-memberships",
        title: "Gift cards and memberships",
        steps: [
          "Buy a gift card from a pro's profile or a shop's page.",
          "Have a code? Use it at checkout, or check what's left on it any time.",
          "Some shops offer memberships for regulars. Join from the shop's page.",
        ],
        link: { label: "Check a gift card balance", href: "/gift/balance" },
      },
      {
        id: "notifications",
        title: "Never miss an offer",
        steps: [
          "Open Account and turn on notifications.",
          "On iPhone, add LineUp to your Home Screen first (Share, then Add to Home Screen).",
        ],
        link: { label: "Notification settings", href: "/account#push-notifications" },
      },
    ],
  },
  {
    id: "pros",
    title: "For pros",
    intro: "Get set up, get booked and get paid.",
    guides: [
      {
        id: "profile",
        title: "Set up a profile clients pick",
        steps: [
          "Add a clear profile photo and a short bio.",
          "Post at least three photos of your work. Your first photo is your card in Explore.",
          "Add a cover photo for the top of your profile.",
          "Home shows a checklist of anything left.",
        ],
        link: { label: "Edit my profile", href: "/account" },
      },
      {
        id: "verification",
        title: "Get verified",
        steps: [
          "Upload your licence, or your student documents if you're still in school.",
          "We review it and let you know by email.",
          "Only verified pros show in Explore and can send offers.",
        ],
        link: { label: "Get verified", href: "/verification" },
      },
      {
        id: "services",
        title: "Add services and where you work",
        steps: [
          "Add each service with its price and how long it takes.",
          "Choose where you work: your place, the client's, or a shop.",
          "Your address stays private until someone books.",
        ],
        link: { label: "Open Services", href: "/services" },
      },
      {
        id: "payouts",
        title: "Connect payouts",
        steps: [
          "On Account, tap Connect payouts and finish Stripe's short form.",
          "If Stripe needs anything else, Account tells you exactly what.",
        ],
        link: { label: "Set up payouts", href: "/account#payouts" },
      },
      {
        id: "offers",
        title: "Win requests with offers",
        steps: [
          "Requests near you that match your work show up on Home.",
          "Open one and send an offer with your price and a time.",
          "You can withdraw an offer before it's accepted.",
          "When the client accepts and pays, it becomes a booking.",
        ],
        link: { label: "Go to Home", href: "/requests" },
      },
      {
        id: "instant-booking",
        title: "Get booked instantly",
        steps: [
          "On a paid plan, set your weekly hours in Services.",
          "Clients then pick an open time on your profile and pay right there. No offers needed.",
          "Share your own booking link in your Instagram bio.",
        ],
        link: { label: "See the plans", href: "/subscription" },
      },
      {
        id: "after-appointment",
        title: "After the appointment",
        steps: [
          "Open the booking and mark it done.",
          "The client confirms, and your payout is sent.",
          "If a client didn't show up, you can mark a no-show from the booking.",
        ],
        link: { label: "Open Bookings", href: "/work" },
      },
      {
        id: "calendar",
        title: "Calendar and regulars",
        steps: [
          "Calendar shows every booking in one place.",
          "Sync it to your phone's calendar so it's always up to date.",
          "Set up regulars once and their visits repeat on their own.",
        ],
        link: { label: "Open Calendar", href: "/calendar" },
      },
      {
        id: "money",
        title: "Earnings and taxes",
        steps: [
          "Earnings shows what you've made and what's on its way.",
          "Download a statement any time.",
          "Add cash or outside income, and use Tax year for expenses and receipts.",
        ],
        link: { label: "Open Earnings", href: "/earnings" },
      },
      {
        id: "grow",
        title: "Grow your business",
        steps: [
          "Analytics shows how often clients come back and your busiest hours.",
          "Sell gift cards with your own link.",
          "Bring your clients over from your old booking app.",
          "Looking for a chair? Shops post openings under Chair openings.",
        ],
        link: { label: "Open Analytics", href: "/analytics" },
      },
    ],
  },
  {
    id: "shops",
    title: "For shops",
    intro: "Run the whole shop, front desk to payouts, from Studio.",
    guides: [
      {
        id: "open-shop",
        title: "Open your shop",
        steps: [
          "Go to Studio and follow the four steps: your shop, you, your team and a plan.",
          "Today then shows a checklist of anything left to set up.",
        ],
        link: { label: "Open Studio", href: "/studio" },
      },
      {
        id: "team",
        title: "Invite your team",
        steps: [
          "In Team, invite each pro by email.",
          "Choose who can manage the shop and who just takes clients.",
          "On Studio Plus, set commission or booth rent for each pro.",
          "Each pro adds their own services so clients can book them.",
        ],
        link: { label: "Open Team", href: "/studio/team" },
      },
      {
        id: "shop-page",
        title: "Set up and share your shop's page",
        steps: [
          "In Settings, add your address, a one-line tagline and your link.",
          "Tap Booking page at the top of Studio to copy the link.",
          "Put it in your Instagram bio and Google listing.",
        ],
        link: { label: "Open Settings", href: "/studio/settings" },
      },
      {
        id: "front-desk",
        title: "Run the front desk",
        steps: [
          "Today shows what's next and who's free right now.",
          "Add a walk-in or a phone booking in one tap.",
          "On Calendar, mark each visit done or a no-show.",
        ],
        link: { label: "Open Calendar", href: "/studio/calendar" },
      },
      {
        id: "shop-requests",
        title: "Pass requests to your pros",
        steps: [
          "Requests shows what clients nearby are looking for.",
          "Pass each one to the pro who's the best fit.",
        ],
        link: { label: "Open Requests", href: "/studio/requests" },
      },
      {
        id: "shop-money",
        title: "Payouts and earnings",
        steps: [
          "In Settings, set up the shop's payouts. It's separate from any pro's account.",
          "Earnings shows your pros' sales, the shop's cut, rent, memberships and gift cards.",
        ],
        link: { label: "Open Earnings", href: "/studio/earnings" },
      },
      {
        id: "shop-grow",
        title: "Memberships, gift cards and chairs",
        steps: [
          "Create memberships for regulars, and check members in at the desk.",
          "Sell shop gift cards from your shop's page.",
          "Hiring? Post an open chair and review who applies.",
        ],
        link: { label: "Open Memberships", href: "/studio/memberships" },
      },
      {
        id: "shop-import",
        title: "Bring your calendar over",
        steps: [
          "In Import, upload the export from your old booking app.",
          "Check what came in, then save. Clients and upcoming appointments move with you.",
        ],
        link: { label: "Open Import", href: "/studio/import" },
      },
    ],
  },
];
