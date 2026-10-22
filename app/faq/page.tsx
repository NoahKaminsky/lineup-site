import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import FaqList, { type FaqGroup } from "./FaqList";

export const metadata: Metadata = {
  title: "FAQ | LineUp",
  description: "How booking, payments, cancellations, verification and plans work on LineUp.",
};

const linkClass = "font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

// What each plan actually unlocks in the app today.
const PLANS = [
  {
    name: "Basic",
    price: "Free",
    note: "Where every pro starts",
    features: [
      "Profile, portfolio and reviews",
      "Show up in Browse once verified",
      "Get requests and send offers",
      "Up to 15 request bookings a month",
    ],
  },
  {
    name: "Apprentice",
    price: "$25/mo",
    note: "Everything in Basic, plus",
    features: [
      "Instant-booking calendar on your profile",
      "Your own booking link",
      "Weekly hours, time off and booking window",
      "Up to 25 request bookings a month",
      "Basic analytics",
      "Apprentice badge and a boost in Browse",
    ],
  },
  {
    name: "Pro",
    price: "$50/mo",
    note: "Everything in Apprentice, plus",
    trial: "7-day free trial",
    features: [
      "Unlimited request bookings",
      "Full analytics",
      "Pro badge",
      "Higher placement in Browse and the Spotlight row",
    ],
    highlight: true,
  },
  {
    name: "Master",
    price: "$75/mo",
    note: "Everything in Pro, plus",
    trial: "5-day free trial",
    features: ["Master badge", "Top placement in Browse and first in the Spotlight row"],
  },
];

function PlanBreakdown() {
  return (
    <div className="not-prose">
      <p>Direct calendar bookings never count toward the monthly limit, on any plan.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl p-4 ${plan.highlight ? "bg-ink text-white" : "bg-white ring-1 ring-ink/[0.08]"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-base font-semibold ${plan.highlight ? "text-white" : "text-ink"}`}>{plan.name}</p>
              <p className={`text-sm font-semibold tabular-nums ${plan.highlight ? "text-white" : "text-ink"}`}>{plan.price}</p>
            </div>
            <p className={`mt-0.5 text-xs ${plan.highlight ? "text-white/60" : "text-neutral-500"}`}>
              {plan.note}
              {plan.trial ? ` · ${plan.trial}` : ""}
            </p>
            <ul className="mt-3 space-y-1.5">
              {plan.features.map((feature) => (
                <li key={feature} className={`flex gap-2 text-sm leading-6 ${plan.highlight ? "text-white/85" : "text-neutral-700"}`}>
                  <svg viewBox="0 0 16 16" className="mt-1 h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
                    <path d="M3 8.5l3 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4">
        Compare and switch plans on the{" "}
        <Link href="/subscription" className={linkClass}>
          plans page
        </Link>
        .
      </p>
    </div>
  );
}

const GROUPS: FaqGroup[] = [
  {
    id: "clients",
    label: "For clients",
    items: [
      {
        q: "What is LineUp?",
        a: "LineUp connects you with beauty and grooming pros across Canada: barbers, stylists, lash and brow artists, nail techs and more. Browse real work, then book a time or post what you're looking for and let pros come to you.",
      },
      {
        q: "How do I book?",
        a: (
          <>
            Two ways. If a pro has their calendar on, pick an open time on their profile and book it straight away.
            Or <Link href="/requests/new" className={linkClass}>post a request</Link> with what you want, where and
            when, and pros send you offers to choose from.
          </>
        ),
      },
      {
        q: "Does it cost anything to use?",
        a: "No. Signing up and browsing are free, and you pay the price of the service you book. There's no extra booking fee on top.",
      },
      {
        q: "When do I pay?",
        a: "When you book. Payment goes through LineUp, so you don't need to bring cash or send an e-transfer.",
      },
      {
        q: "Can I cancel?",
        a: "Yes. Cancel more than 24 hours before your appointment and you get a full refund. Inside 24 hours you can't cancel in the app, so message your pro if something comes up.",
      },
      {
        q: "Can a pro come to me?",
        a: "Yes. Post a request and choose \"Mobile: at my place\", and pros who travel can send you offers.",
      },
      {
        q: "Are the pros checked?",
        a: "Every pro has to be verified before they can be booked. We review their credential (or proof they're in training) and a government photo ID, and verification has to be renewed when it expires.",
      },
      {
        q: "Where is LineUp available?",
        a: "Across Canada. Pros sign up and get verified under their own province's rules, so their credentials match where they work.",
      },
    ],
  },
  {
    id: "pros",
    label: "For pros",
    items: [
      {
        q: "How much does LineUp cost?",
        a: (
          <>
            Basic is free. Paid plans are Apprentice ($25/month), Pro ($50/month, 7-day free trial) and Master
            ($75/month, 5-day free trial). See everything each plan includes on the{" "}
            <Link href="/subscription" className={linkClass}>plans page</Link>.
          </>
        ),
      },
      {
        q: "What do I get on each plan?",
        a: <PlanBreakdown />,
      },
      {
        q: "What does LineUp take from a booking?",
        a: "LineUp keeps a 15% service fee on bookings paid through the app. The rest is yours.",
      },
      {
        q: "How do I get paid?",
        a: "Connect your payout account in Account. Part of your earnings is sent when the client books, and the rest once the appointment is marked complete. If no one marks it, it completes on its own the day after.",
      },
      {
        q: "How does verification work?",
        a: (
          <>
            Upload your credential (or proof you&apos;re enrolled in training) and a government photo ID on the{" "}
            <Link href="/verification" className={linkClass}>verification page</Link>. Once you&apos;re approved you show
            up in Browse and clients can book you.
          </>
        ),
      },
      {
        q: "Can I control when people book me?",
        a: "Yes. Set your weekly hours, add time off for breaks, and choose how far ahead clients can book. You can also turn instant booking off at any time.",
      },
      {
        q: "I only do mobile appointments. Can I still use LineUp?",
        a: "Yes. You'll get requests from clients who want a pro to come to them. Instant calendar booking is for in-shop and home-studio appointments, since it needs a fixed address.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="FAQ"
        title={
          <>
            Questions,
            <span className="text-neutral-400"> answered.</span>
          </>
        }
        subtitle="How booking, payments and plans work. Pick your side below."
      />
      <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        <FaqList groups={GROUPS} />
      </section>
    </PublicLayout>
  );
}
