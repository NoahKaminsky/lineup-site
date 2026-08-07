"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const serviceTags = [
  "Barbers",
  "Hairstylists",
  "Nail Techs",
  "Lash Artists",
  "Brow Artists",
  "Makeup Artists",
  "Body Sugaring",
];

function SectionFade() {
  return (
    <div className="pointer-events-none relative -mt-10 h-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/80" />
    </div>
  );
}

export default function Page() {
  const router = useRouter();

  const [authResolved, setAuthResolved] = useState<boolean>(false);

  useEffect(() => {
    const redirectIfSignedIn = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/requests");
        return;
      }

      setAuthResolved(true);
    };

    redirectIfSignedIn();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;

      if (user) {
        router.replace("/requests");
        return;
      }

      setAuthResolved(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (!authResolved) {
    return (
      <main className="min-h-screen bg-white text-neutral-900">
        <div className="flex min-h-screen items-center justify-center px-6">
          <p className="text-sm text-neutral-500">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            LineUp
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-neutral-600 md:flex">
            <a href="#how-it-works" className="transition hover:text-neutral-900">
              How it works
            </a>
            <a href="#who-we-are" className="transition hover:text-neutral-900">
              Why LineUp
            </a>
            <a href="#using-lineup" className="transition hover:text-neutral-900">
              For professionals
            </a>
            <a href="#founders" className="transition hover:text-neutral-900">
              Founders
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Sign in
            </Link>

            <Link
              href="/login?mode=signup"
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Join LineUp
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white">
        <img
          src="/images/hero-barber-mobile.jpg"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-50 md:hidden"
        />

        <img
          src="/images/hero-barber.jpg"
          alt=""
          className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-full object-cover object-right opacity-65 md:block"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/35 md:from-white md:via-white/82 md:to-white/18" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/55" />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pt-24">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm shadow-emerald-100">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Now live
            </div>

            <p className="text-sm font-medium text-neutral-500">
              A live marketplace for beauty services
            </p>

            <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
              Clients post what they want. Professionals choose the work.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              LineUp lets clients post the exact service they’re looking for and gives
              barbers, stylists, nail techs, lash artists, brow artists, and more the
              option to respond on their own terms.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login?mode=signup"
                className="rounded-full bg-neutral-900 px-6 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
              >
                Join LineUp
              </Link>

              <a
                href="#how-it-works"
                className="rounded-full border border-neutral-300 px-6 py-3 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                See how it works
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
              <span className="font-medium text-neutral-700">
                Built for flexible beauty work
              </span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>At home</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>In shop</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>Home studio</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>Live marketplace</span>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              {serviceTags.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative flex items-center">
            <div className="absolute left-8 top-8 h-36 w-36 rounded-full bg-emerald-100/50 blur-3xl" />
            <div className="absolute bottom-8 right-8 h-44 w-44 rounded-full bg-sky-100/30 blur-3xl" />

            <div className="relative w-full rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-[0_18px_70px_rgba(0,0,0,0.05)]">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">
                Welcome to LineUp
              </p>

              <h2 className="mt-4 max-w-md text-3xl font-semibold tracking-tight text-neutral-900">
                Not a traditional booking app.
              </h2>

              <p className="mt-4 max-w-lg leading-8 text-neutral-600">
                Clients submit a request, professionals send offers, and the client
                chooses who fits best. It’s designed to help you grow your client base,
                stay in control, and work on your own terms.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">For clients</p>
                  <p className="mt-2 font-semibold text-neutral-900">
                    Post once. Receive offers from multiple professionals. Pick the best fit.
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">For professionals</p>
                  <p className="mt-2 font-semibold text-neutral-900">
                    Get notified when matching requests go live. Respond on your own terms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionFade />

      <section
        id="who-we-are"
        className="relative overflow-hidden border-t border-neutral-200 bg-neutral-50"
      >
        <img
          src="/images/who-we-are1.jpg"
          alt=""
          className="pointer-events-none absolute right-0 top-0 h-full w-full object-cover object-right opacity-95"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-neutral-50 via-neutral-50/94 to-neutral-50/62" />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-50/10 via-transparent to-neutral-50/60" />

        <div className="relative">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                WHY LINEUP
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
                A more flexible way to connect clients and professionals.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                LineUp supports a more flexible beauty marketplace, whether services
                happen at home, in-shop, or from a home studio.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-neutral-200 bg-white p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                    <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold">For clients</h3>
                <p className="mt-2 leading-7 text-neutral-600">
                  Post what you need once and let qualified professionals come to you with offers.
                </p>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                    <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold">For professionals</h3>
                <p className="mt-2 leading-7 text-neutral-600">
                  Get discovered by clients who already want what you offer. Respond only to work that fits your schedule.
                </p>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                    <path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold">For the industry</h3>
                <p className="mt-2 leading-7 text-neutral-600">
                  One marketplace for at-home, in-shop, and home studio services — all in one place.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="how-it-works" className="relative overflow-hidden bg-white">
        <img
          src="/images/howitworks.png"
          alt=""
          className="pointer-events-none absolute right-[-20px] top-[38%] w-[320px] opacity-35 md:right-0 md:top-1/2 md:w-[620px] md:-translate-y-1/2 md:opacity-70 lg:w-[720px]"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/88 to-white/22" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/50" />

        <div className="relative mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              How It Works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Built for cleaner booking decisions.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-neutral-200 p-7">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">1</div>
              <h3 className="mt-4 text-xl font-semibold">Post your request</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Share the service, your budget, preferred timing, and where you want it done.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 p-7">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">2</div>
              <h3 className="mt-4 text-xl font-semibold">Professionals respond</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Nearby professionals send you offers with their pricing, availability, and details.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 p-7">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">3</div>
              <h3 className="mt-4 text-xl font-semibold">Choose the best fit</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Review offers side by side — price, reviews, specialty, and timing — then book.
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-neutral-500">
                Service mode
              </p>
              <h3 className="mt-2 text-lg font-semibold">Choose where it happens</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                At home, in shop, or home studio — clients choose the setup that fits best.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-900" fill="none">
                  <rect x="6" y="1.5" width="1.4" height="3.5" rx="0.7" fill="currentColor" />
                  <rect x="12.6" y="1.5" width="1.4" height="3.5" rx="0.7" fill="currentColor" />
                  <rect x="2.25" y="3.75" width="15.5" height="14.75" rx="3" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M2.25 8.25h15.5" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="13.25" cy="12.5" r="1.55" fill="currentColor" />
                </svg>
              </div>
              <p className="mt-4 text-sm font-medium uppercase tracking-[0.16em] text-neutral-500">
                Direct booking
              </p>
              <h3 className="mt-2 text-lg font-semibold">Skip the request next time</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Already found someone you like? Book straight from their calendar. For
                professionals, it doubles as a real scheduling tool — no separate
                booking system needed.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-900 p-6 text-white">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-neutral-300">
                Core value
              </p>
              <h3 className="mt-2 text-lg font-semibold">
                Booking becomes more flexible and transparent
              </h3>
              <p className="mt-2 leading-7 text-neutral-300">
                Clients choose the service style and location they want, then compare
                offers in one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="using-lineup" className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Using LineUp
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Reach clients who are already looking for you.
            </h2>
            <p className="mt-5 leading-8 text-neutral-600">
              Whether you're just starting out or have years of clients behind you,
              growing further usually means building visibility — and a strong
              Instagram following is real work that pays off for a lot of
              professionals. LineUp gives you another way in alongside that: clients
              post exactly what they need, and you get matched directly, wherever
              you already work — home, a shared space, or a shop chair.
            </p>
          </div>

          <h3 className="mt-14 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            What you get
          </h3>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <path d="M4 7h9m0 0l-3-3m3 3l-3 3M16 13H7m0 0l3-3m-3 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Live marketplace matching</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Post a request once and get real offers from professionals ready
                to work — no cold outreach either way.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <rect x="5" y="9" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 9V6a3 3 0 016 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Secure payments built in</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Every booking is paid through LineUp — protected, tracked, and
                hassle-free for both sides.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <path d="M3 5.5A2.5 2.5 0 015.5 3h9A2.5 2.5 0 0117 5.5v6A2.5 2.5 0 0114.5 14H9l-4 3v-3H5.5A2.5 2.5 0 013 11.5v-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">In-app messaging</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Coordinate details, timing, and expectations without ever
                leaving the platform.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <path d="M10 2.5l2.1 4.5 4.9.6-3.6 3.4.9 4.9L10 13.5l-4.3 2.4.9-4.9L3 7.6l4.9-.6L10 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Verified reviews</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Every completed job adds to a professional's public track
                record.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <path d="M10 2.5l6 2.2v4.8c0 4-2.6 6.9-6 8-3.4-1.1-6-4-6-8V4.7l6-2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M7.2 10l1.9 1.9L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Identity-verified professionals</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                Every professional is verified through the same process used
                to set up payouts, so clients know who they're actually
                booking.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                  <path d="M3 3h6.5L17 10.5 10.5 17 3 9.5V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="6.5" cy="6.5" r="1" fill="currentColor"/>
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Free to start</h3>
              <p className="mt-2 leading-7 text-neutral-600">
                No subscription required to take on real, paying clients —
                upgrade later if you want more.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="founders" className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                About the Founders
              </p>

              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
                Built by founders who saw the problem firsthand.
              </h2>

              <p className="mt-6 max-w-2xl text-base leading-8 text-neutral-600">
                LineUp was founded by three University of Manitoba students — Dan
                Latimer, Noah Kaminsky, and Max Kochan — with backgrounds in design,
                agriculture, and economics.
              </p>

              <p className="mt-5 max-w-2xl text-base leading-8 text-neutral-600">
                We created LineUp to solve a simple problem: discovering trusted beauty
                professionals in a fragmented and inconsistent industry should not be
                difficult. LineUp is a marketplace built to connect clients with vetted
                beauty professionals in a way that is more transparent, reliable, and
                convenient.
              </p>

              <p className="mt-5 max-w-2xl text-base leading-8 text-neutral-600">
                Launching first in Winnipeg, Manitoba, our goal is to build a platform
                that makes finding and booking aesthetic services feel just as rewarding
                as the service itself.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
              {[
                { name: "Noah Kaminsky", title: "Co-Founder & COO", initials: "NK" },
                { name: "Dan Latimer", title: "Co-Founder & CFO", initials: "DL" },
                { name: "Max Kochan", title: "Co-Founder & CEO", initials: "MK" },
              ].map((founder) => (
                <div key={founder.name} className="flex items-center gap-4 rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                    {founder.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{founder.name}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">{founder.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="join-lineup" className="mx-auto max-w-5xl px-6 pb-24 pt-20">
        <div className="rounded-[2rem] bg-neutral-900 px-6 py-12 text-white md:px-10 md:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-300">
              Get started
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Ready to join LineUp?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-neutral-300 md:text-lg">
              Create your account in under a minute — as a customer looking to book, or a professional ready to get matched with work.
            </p>

            <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
              <Link
                href="/login?mode=signup"
                className="flex-1 rounded-full bg-white px-6 py-3 text-center font-medium text-neutral-900 transition hover:opacity-90"
              >
                Join LineUp
              </Link>
              <Link
                href="/login"
                className="flex-1 rounded-full border border-white/20 px-6 py-3 text-center font-medium text-white transition hover:bg-white/10"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} LineUp — Beauty marketplace for trusted on-demand services.</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="transition hover:text-neutral-900">Terms</Link>
            <Link href="/privacy" className="transition hover:text-neutral-900">Privacy</Link>
            <a href="mailto:lineupmb@gmail.com" className="transition hover:text-neutral-900">Contact</a>
            <Link href="/login" className="transition hover:text-neutral-900">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
