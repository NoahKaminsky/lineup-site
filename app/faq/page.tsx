import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import FaqList, { type FaqGroup } from "./FaqList";

export const metadata: Metadata = {
  title: "FAQ | LineUp",
  description: "How booking, payments, cancellations, verification and plans work on LineUp.",
};

const linkClass = "font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

const GROUPS: FaqGroup[] = [
  {
    id: "clients",
    label: "For clients",
    items: [
      {
        q: "What is LineUp?",
        a: "LineUp connects you with beauty and grooming pros in Winnipeg: barbers, stylists, lash and brow artists, nail techs and more. Browse real work, then book a time or post what you're looking for and let pros come to you.",
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
        a: "Winnipeg, Manitoba, to start. More cities are coming.",
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
        q: "What do paid plans add?",
        a: "Your own booking calendar and booking link, so clients can book and pay for open times without messaging you, plus more requests each month, time off, a booking window and more.",
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
