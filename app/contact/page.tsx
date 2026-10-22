import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact | LineUp",
  description: "Get in touch with the LineUp team in Winnipeg.",
};

const WAYS = [
  {
    label: "Email us",
    value: "lineupmb@gmail.com",
    href: "mailto:lineupmb@gmail.com",
    note: "We usually reply within a day.",
  },
  {
    label: "Quick answers",
    value: "Read the FAQ",
    href: "/faq",
    note: "Booking, payments, plans and verification.",
  },
  {
    label: "Join as a pro",
    value: "Create your profile",
    href: "/login?mode=signup",
    note: "Free to start. Get verified and get booked.",
  },
];

export default function ContactPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Contact"
        title={
          <>
            Say hi.
            <span className="text-neutral-400"> We&apos;re real people.</span>
          </>
        }
        subtitle="Questions, feedback, partnerships, or you just want to tell us about a great barber. We read everything."
      />

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-12">
        <ul className="space-y-3 lg:col-span-4">
          {WAYS.map((way, index) => (
            <li key={way.label} className="lu-rise-in" style={{ animationDelay: `${240 + index * 70}ms` }}>
              <Link
                href={way.href}
                className="group block rounded-3xl bg-white p-5 ring-1 ring-ink/[0.07] transition-all duration-500 ease-[var(--ease-arrive)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] hover:ring-ink/15"
              >
                <p className="text-xs font-medium text-neutral-500">{way.label}</p>
                <p className="mt-1 flex items-center justify-between gap-3 text-lg font-semibold tracking-[-0.02em] text-ink">
                  {way.value}
                  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" fill="none" aria-hidden="true">
                    <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </p>
                <p className="mt-1 text-sm text-neutral-500">{way.note}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="lu-rise-in lg:col-span-7 lg:col-start-6" style={{ animationDelay: "300ms" }}>
          <ContactForm />
        </div>
      </section>
    </PublicLayout>
  );
}
