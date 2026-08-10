"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const appTourScreens = [
  {
    src: "/images/app-screenshots/01-browse.png",
    tag: "Discover Pros.",
    description: "Browse hand-picked and nearby professionals in seconds.",
  },
  {
    src: "/images/app-screenshots/02-profile.png",
    tag: "See Their Work.",
    description: "Full profile, portfolio, and pricing before you commit.",
  },
  {
    src: "/images/app-screenshots/03-reviews.png",
    tag: "Read Real Reviews.",
    description: "Every completed job adds to a professional's track record.",
  },
  {
    src: "/images/app-screenshots/00-post-request.png",
    tag: "Post a Request.",
    description: "Share what you need, your budget, and when you want it done.",
  },
  {
    src: "/images/app-screenshots/00b-active-request.png",
    tag: "Track Your Request.",
    description: "See it live the moment you post, right on your home screen.",
  },
  {
    src: "/images/app-screenshots/06b-reference-photos.png",
    tag: "Add Inspiration.",
    description: "Attach reference photos so professionals know exactly what you're going for.",
  },
  {
    src: "/images/app-screenshots/04-offers-compare.png",
    tag: "Compare Offers.",
    description: "Post once, get multiple offers back from nearby pros.",
  },
  {
    src: "/images/app-screenshots/05-offer-detail.png",
    stackedSrc: "/images/app-screenshots/05b-jesse-offer.png",
    tag: "Review Every Bid.",
    description: "Price, timing, and a message from each professional.",
  },
  {
    src: "/images/app-screenshots/06-winner.png",
    tag: "Pick Your Favorite.",
    description: "Accept the offer that fits best.",
  },
  {
    src: "/images/app-screenshots/07-payment.png",
    tag: "Pay Securely.",
    description: "Payment is handled safely through Stripe, right in the app.",
  },
  {
    src: "/images/app-screenshots/09-chat.png",
    tag: "Chat Instantly.",
    description: "Coordinate every detail without leaving the app.",
  },
  {
    src: "/images/app-screenshots/08b-your-bookings.png",
    tag: "All In One Place.",
    description: "Every booking, request, and past service, organized for you.",
  },
  {
    src: "/images/app-screenshots/10-pro-calendar.png",
    tag: "Manage It All.",
    description: "A real calendar to manage every booking in one place.",
  },
];

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
  const [appTourRevealed, setAppTourRevealed] = useState(false);
  const appTourRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // This page early-returns a loading screen until authResolved flips, so the
    // carousel (and its ref) doesn't exist in the DOM on the very first mount.
    // Re-running this whenever authResolved changes ensures the observer actually
    // attaches once the real section is rendered, instead of finding a null ref
    // once and never trying again.
    if (!authResolved) return;

    const node = appTourRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAppTourRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);

    // Safety net: if the observer never fires for any reason, don't leave the
    // cards permanently invisible — reveal them anyway after a few seconds.
    const fallback = setTimeout(() => setAppTourRevealed(true), 4000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [authResolved]);

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
            <a href="#app-tour" className="transition hover:text-neutral-900">
              See It In Action
            </a>
            <a href="#how-it-works" className="transition hover:text-neutral-900">
              How it works
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

      <section id="app-tour" ref={appTourRef} className="overflow-hidden bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              See It In Action
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              This is LineUp — from posting a request to getting booked.
            </h2>
          </div>
        </div>

        <div className="mx-auto max-w-7xl">
        <div className="mt-10 flex gap-6 overflow-x-auto px-6 pb-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-12 sm:gap-8">
          {appTourScreens.map((screen, index) => {
            const tiltClasses = ["-rotate-3", "rotate-2", "-rotate-2", "rotate-3", "-rotate-1"];
            const tilt = tiltClasses[index % tiltClasses.length];

            return (
              <div
                key={screen.src}
                className={`group flex ${screen.stackedSrc ? "w-[270px] sm:w-[300px]" : "w-[220px] sm:w-[240px]"} shrink-0 flex-col transition-all duration-700 ease-out ${
                  appTourRevealed ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                }`}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                {screen.stackedSrc ? (
                  <div className="relative h-[477px] w-full sm:h-[520px]">
                    <div className="absolute left-0 top-0 aspect-[9/19.5] w-[190px] -rotate-6 overflow-hidden rounded-[2rem] border-[5px] border-neutral-900 bg-neutral-900 shadow-lg transition-transform duration-300 ease-out sm:w-[208px] group-hover:-translate-x-2 group-hover:-translate-y-1 group-hover:-rotate-3">
                      <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                      <img
                        src={screen.stackedSrc}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 aspect-[9/19.5] w-[190px] rotate-3 overflow-hidden rounded-[2rem] border-[5px] border-neutral-900 bg-neutral-900 shadow-2xl transition-transform duration-300 ease-out sm:w-[208px] group-hover:translate-x-2 group-hover:translate-y-1 group-hover:rotate-0">
                      <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                      <img
                        src={screen.src}
                        alt={screen.tag}
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.25rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl transition-transform duration-300 ease-out ${tilt} group-hover:-translate-y-3 group-hover:rotate-0 group-hover:scale-105 group-hover:shadow-2xl`}
                  >
                    <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                    <img
                      src={screen.src}
                      alt={screen.tag}
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                )}
                <p
                  className={`mt-5 text-base font-semibold tracking-tight text-neutral-900 transition-all duration-500 ease-out ${
                    appTourRevealed ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0"
                  }`}
                  style={{ transitionDelay: `${index * 90 + 200}ms` }}
                >
                  {screen.tag}
                </p>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  {screen.description}
                </p>
              </div>
            );
          })}
        </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="absolute right-[-10%] top-1/4 h-[26rem] w-[26rem] rounded-full bg-sky-100/50 blur-3xl md:right-16" />
          <div className="absolute bottom-[-15%] right-1/4 h-72 w-72 rounded-full bg-amber-100/40 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(23,23,23,0.08) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pt-24">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
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
              <span>We come to you</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>In shop</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span>Their home studio</span>
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

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">For clients</p>
                  <p className="mt-2 font-semibold text-neutral-900">
                    Post once. Compare offers. Book the best fit.
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">For professionals</p>
                  <p className="mt-2 font-semibold text-neutral-900">
                    Get matched to nearby requests. Respond on your own terms.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-[-12%] top-0 h-[26rem] w-[26rem] rounded-full bg-neutral-100/80 blur-3xl md:right-0" />
          <div className="absolute bottom-[-10%] right-[18%] h-72 w-72 rounded-full bg-emerald-50 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(23,23,23,0.07) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

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
                Have the professional come to you, visit their shop, or head to their
                home studio — whatever setup fits best.
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
