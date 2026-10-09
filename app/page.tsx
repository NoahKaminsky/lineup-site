"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
    src: "/images/app-screenshots/00-post-request-poster.jpg",
    video: "/videos/post-a-request.mp4",
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

function SectionFade() {
  return (
    <div className="pointer-events-none relative -mt-10 h-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/80" />
    </div>
  );
}

// Shared scroll-reveal primitive — generalizes the one-off IntersectionObserver
// the app-tour carousel already used (see appTourRevealed below) so every
// section gets the same one-shot "reveal once, never hide again" behavior
// instead of each section hand-rolling its own observer.
function useReveal<T extends HTMLElement>(options?: { threshold?: number; enabled?: boolean }) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: options?.threshold ?? 0.15 }
    );

    observer.observe(node);

    // Same safety net as the existing carousel reveal: never leave content
    // permanently invisible if the observer doesn't fire for some reason.
    const fallback = setTimeout(() => setRevealed(true), 4000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [enabled, options?.threshold]);

  return [ref, revealed] as const;
}

// A headline that rises into place from behind its own baseline instead of
// just fading — reads as considered, not a generic opacity tween. The outer
// span clips; the inner one carries the actual transform.
function RevealText({
  as: Tag = "span",
  revealed,
  delay = 0,
  className = "",
  children,
}: {
  as?: "span" | "div";
  revealed: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag className={`block overflow-hidden ${className}`}>
      <span
        className={`block transition-all duration-700 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[110%] opacity-0"
        }`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        {children}
      </span>
    </Tag>
  );
}

export default function Page() {
  const router = useRouter();

  const [authResolved, setAuthResolved] = useState<boolean>(false);
  const [appTourRevealed, setAppTourRevealed] = useState(false);
  const appTourRef = useRef<HTMLDivElement | null>(null);

  // Hero copy rises into place on arrival rather than just appearing — it's
  // above the fold, so this triggers on a short timer once the page is
  // actually ready to show, not on scroll.
  const [heroRevealed, setHeroRevealed] = useState(false);
  useEffect(() => {
    if (!authResolved) return;
    const timer = setTimeout(() => setHeroRevealed(true), 120);
    return () => clearTimeout(timer);
  }, [authResolved]);

  // Each section gets its own reveal so the page animates in as you actually
  // scroll to each part, not all at once — `enabled: authResolved` re-attaches
  // the observer once the real sections exist (see the app-tour effect below
  // for why that matters on this particular page).
  const [howItWorksRef, howItWorksRevealed] = useReveal<HTMLDivElement>({ enabled: authResolved });
  const [usingLineupRef, usingLineupRevealed] = useReveal<HTMLDivElement>({ enabled: authResolved });
  const [foundersRef, foundersRevealed] = useReveal<HTMLDivElement>({ enabled: authResolved });
  const [joinRef, joinRevealed] = useReveal<HTMLDivElement>({ enabled: authResolved, threshold: 0.3 });

  // Lets the header nav underline the section currently in view.
  const [activeSection, setActiveSection] = useState<string>("app-tour");
  const sectionIds = ["app-tour", "how-it-works", "using-lineup", "founders"];
  useEffect(() => {
    if (!authResolved) return;
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveSection(topMost.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved]);

  // Subtle parallax on the decorative blur shapes behind "How It Works" —
  // cheap (two pointer-events-none divs, no layout impact) and the kind of
  // detail that reads as deliberate rather than templated.
  const howItWorksSectionRef = useRef<HTMLElement | null>(null);
  const [parallaxY, setParallaxY] = useState(0);
  useEffect(() => {
    if (!authResolved) return;
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = howItWorksSectionRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const progress = 1 - Math.min(1, Math.max(0, rect.top / window.innerHeight));
        setParallaxY(progress * 36);
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [authResolved]);

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

          <nav className="hidden items-center gap-8 text-sm md:flex">
            {[
              { id: "app-tour", label: "See It In Action" },
              { id: "how-it-works", label: "For clients" },
              { id: "using-lineup", label: "For professionals" },
              { id: "founders", label: "Founders" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`relative pb-1 transition-colors ${
                  activeSection === item.id ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-0 -bottom-0.5 h-px bg-neutral-900 transition-transform duration-300 ease-out ${
                    activeSection === item.id ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            ))}
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
            <RevealText
              as="div"
              revealed={heroRevealed}
              className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500"
            >
              See It In Action
            </RevealText>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              <RevealText revealed={heroRevealed} delay={90}>
                This is LineUp — from posting a request to getting booked.
              </RevealText>
            </h1>
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
                      <Image
                        src={screen.stackedSrc}
                        alt=""
                        fill
                        sizes="208px"
                        className="object-cover object-top"
                        loading={index < 2 ? "eager" : "lazy"}
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 aspect-[9/19.5] w-[190px] rotate-3 overflow-hidden rounded-[2rem] border-[5px] border-neutral-900 bg-neutral-900 shadow-2xl transition-transform duration-300 ease-out sm:w-[208px] group-hover:translate-x-2 group-hover:translate-y-1 group-hover:rotate-0">
                      <div className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                      <Image
                        src={screen.src}
                        alt={screen.tag}
                        fill
                        sizes="208px"
                        className="object-cover object-top"
                        loading={index < 2 ? "eager" : "lazy"}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className={`relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.25rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl transition-transform duration-300 ease-out ${tilt} group-hover:-translate-y-3 group-hover:rotate-0 group-hover:scale-105 group-hover:shadow-2xl`}
                  >
                    <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
                    {screen.video ? (
                      <video
                        src={screen.video}
                        poster={screen.src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <Image
                        src={screen.src}
                        alt={screen.tag}
                        fill
                        sizes="(min-width: 640px) 240px, 220px"
                        className="object-cover object-top"
                        loading={index < 2 ? "eager" : "lazy"}
                      />
                    )}
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

      <section id="how-it-works" ref={howItWorksSectionRef} className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute right-[-12%] top-0 h-[26rem] w-[26rem] rounded-full bg-neutral-100/80 blur-3xl md:right-0 will-change-transform"
            style={{ transform: `translate3d(0, ${parallaxY * -1}px, 0)` }}
          />
          <div
            className="absolute bottom-[-10%] right-[18%] h-72 w-72 rounded-full bg-amber-50 blur-3xl will-change-transform"
            style={{ transform: `translate3d(0, ${parallaxY}px, 0)` }}
          />
          <div
            className="absolute inset-0 opacity-[0.3]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(23,23,23,0.07) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        <div ref={howItWorksRef} className="relative mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <RevealText as="div" revealed={howItWorksRevealed} className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              How It Works
            </RevealText>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              <RevealText revealed={howItWorksRevealed} delay={80}>
                Built for cleaner booking decisions.
              </RevealText>
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { n: "1", title: "Post your request", body: "Share the service, your budget, preferred timing, and where you want it done." },
              { n: "2", title: "Professionals respond", body: "Nearby professionals send you offers with their pricing, availability, and details." },
              { n: "3", title: "Choose the best fit", body: "Review offers side by side — price, reviews, specialty, and timing — then book." },
            ].map((step, index) => (
              <div
                key={step.n}
                className={`rounded-3xl border border-neutral-200 p-7 transition-all duration-700 ease-out ${
                  howItWorksRevealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
                style={{ transitionDelay: `${160 + index * 110}ms` }}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white transition-all duration-500 ${
                    howItWorksRevealed ? "scale-100 opacity-100" : "scale-50 opacity-0"
                  }`}
                  style={{ transitionDelay: `${320 + index * 110}ms`, transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                >
                  {step.n}
                </div>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 leading-7 text-neutral-600">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                eyebrow: "Service mode",
                title: "Choose where it happens",
                body: "Have the professional come to you, visit their shop, or head to their home studio — whatever setup fits best.",
                dark: false,
                icon: null,
              },
              {
                eyebrow: "Direct booking",
                title: "Skip the request next time",
                body: "Already found someone you like? Book straight from their calendar. For professionals, it doubles as a real scheduling tool — no separate booking system needed.",
                dark: false,
                icon: (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-900" fill="none">
                    <rect x="6" y="1.5" width="1.4" height="3.5" rx="0.7" fill="currentColor" />
                    <rect x="12.6" y="1.5" width="1.4" height="3.5" rx="0.7" fill="currentColor" />
                    <rect x="2.25" y="3.75" width="15.5" height="14.75" rx="3" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M2.25 8.25h15.5" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="13.25" cy="12.5" r="1.55" fill="currentColor" />
                  </svg>
                ),
              },
              {
                eyebrow: "Core value",
                title: "Booking becomes more flexible and transparent",
                body: "Clients choose the service style and location they want, then compare offers in one place.",
                dark: true,
                icon: null,
              },
            ].map((card, index) => (
              <div
                key={card.title}
                className={`rounded-[1.75rem] border p-6 transition-all duration-700 ease-out ${
                  card.dark ? "border-neutral-200 bg-neutral-900 text-white" : "border-neutral-200 bg-neutral-50"
                } ${howItWorksRevealed ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-[0.97] opacity-0"}`}
                style={{ transitionDelay: `${620 + index * 90}ms` }}
              >
                {card.icon ? (
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">{card.icon}</div>
                ) : null}
                <p
                  className={`${card.icon ? "mt-4" : ""} text-sm font-medium uppercase tracking-[0.16em] ${
                    card.dark ? "text-neutral-300" : "text-neutral-500"
                  }`}
                >
                  {card.eyebrow}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{card.title}</h3>
                <p className={`mt-2 leading-7 ${card.dark ? "text-neutral-300" : "text-neutral-600"}`}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="using-lineup" className="border-t border-neutral-200 bg-neutral-50">
        <div ref={usingLineupRef} className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <RevealText as="div" revealed={usingLineupRevealed} className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Using LineUp
            </RevealText>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              <RevealText revealed={usingLineupRevealed} delay={80}>
                Reach clients who are already looking for you.
              </RevealText>
            </h2>
            <p
              className={`mt-5 leading-8 text-neutral-600 transition-all duration-700 ease-out ${
                usingLineupRevealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
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
            {[
              {
                title: "Live marketplace matching",
                body: "Post a request once and get real offers from professionals ready to work — no cold outreach either way.",
                icon: <path d="M4 7h9m0 0l-3-3m3 3l-3 3M16 13H7m0 0l3-3m-3 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
              },
              {
                title: "Secure payments built in",
                body: "Every booking is paid through LineUp — protected, tracked, and hassle-free for both sides.",
                icon: (
                  <>
                    <rect x="5" y="9" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M7 9V6a3 3 0 016 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </>
                ),
              },
              {
                title: "In-app messaging",
                body: "Coordinate details, timing, and expectations without ever leaving the platform.",
                icon: <path d="M3 5.5A2.5 2.5 0 015.5 3h9A2.5 2.5 0 0117 5.5v6A2.5 2.5 0 0114.5 14H9l-4 3v-3H5.5A2.5 2.5 0 013 11.5v-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
              },
              {
                title: "Verified reviews",
                body: "Every completed job adds to a professional's public track record.",
                icon: <path d="M10 2.5l2.1 4.5 4.9.6-3.6 3.4.9 4.9L10 13.5l-4.3 2.4.9-4.9L3 7.6l4.9-.6L10 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
              },
              {
                title: "Verified payouts",
                body: "Professionals confirm their identity with our payment partner before they can be paid, and every payment is processed securely through Stripe.",
                icon: (
                  <>
                    <path d="M10 2.5l6 2.2v4.8c0 4-2.6 6.9-6 8-3.4-1.1-6-4-6-8V4.7l6-2.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M7.2 10l1.9 1.9L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ),
              },
              {
                title: "Free to start",
                body: "No subscription required to take on real, paying clients — upgrade later if you want more.",
                icon: (
                  <>
                    <path d="M3 3h6.5L17 10.5 10.5 17 3 9.5V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
                  </>
                ),
              },
            ].map((card, index) => {
              const col = index % 3;
              const row = Math.floor(index / 3);
              return (
                <div
                  key={card.title}
                  className={`rounded-3xl border border-neutral-200 bg-white p-7 transition-all duration-700 ease-out ${
                    usingLineupRevealed ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                  }`}
                  style={{ transitionDelay: `${120 + col * 90 + row * 70}ms` }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-100">
                    <svg viewBox="0 0 20 20" className="h-5 w-5 text-neutral-700" fill="none">
                      {card.icon}
                    </svg>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{card.title}</h3>
                  <p className="mt-2 leading-7 text-neutral-600">{card.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <SectionFade />

      <section id="founders" className="border-t border-neutral-200 bg-neutral-50">
        <div ref={foundersRef} className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <RevealText as="div" revealed={foundersRevealed} className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                About the Founders
              </RevealText>

              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
                <RevealText revealed={foundersRevealed} delay={80}>
                  Built by founders who saw the problem firsthand.
                </RevealText>
              </h2>

              <p
                className={`mt-6 max-w-2xl text-base leading-8 text-neutral-600 transition-all duration-700 ease-out ${
                  foundersRevealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: "180ms" }}
              >
                LineUp was founded by two University of Manitoba students — Dan
                Latimer and Noah Kaminsky — with backgrounds in design and
                agriculture.
              </p>

              <p
                className={`mt-5 max-w-2xl text-base leading-8 text-neutral-600 transition-all duration-700 ease-out ${
                  foundersRevealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: "260ms" }}
              >
                We created LineUp to solve a simple problem: discovering trusted beauty
                professionals in a fragmented and inconsistent industry should not be
                difficult. LineUp is a marketplace built to connect clients with vetted
                beauty professionals in a way that is more transparent, reliable, and
                convenient.
              </p>

              <p
                className={`mt-5 max-w-2xl text-base leading-8 text-neutral-600 transition-all duration-700 ease-out ${
                  foundersRevealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: "340ms" }}
              >
                Launching first in Winnipeg, Manitoba, our goal is to build a platform
                that makes finding and booking aesthetic services feel just as rewarding
                as the service itself.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
              {[
                { name: "Noah Kaminsky", title: "Co-Founder & CEO", initials: "NK" },
                { name: "Dan Latimer", title: "Co-Founder & CFO", initials: "DL" },
              ].map((founder, index) => (
                <div
                  key={founder.name}
                  className={`flex items-center gap-4 rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm transition-all duration-700 ease-out ${
                    foundersRevealed ? "translate-x-0 scale-100 opacity-100" : "translate-x-4 scale-95 opacity-0"
                  }`}
                  style={{ transitionDelay: `${260 + index * 120}ms` }}
                >
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

      <section id="join-lineup" ref={joinRef} className="mx-auto max-w-5xl px-6 pb-24 pt-20">
        <div
          className={`rounded-[2rem] bg-neutral-900 px-6 py-12 text-white transition-all duration-[900ms] ease-out md:px-10 md:py-14 ${
            joinRevealed ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
          }`}
        >
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
                className="flex-1 rounded-full bg-white px-6 py-3 text-center font-medium text-neutral-900 transition hover:scale-[1.03] hover:opacity-90"
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
