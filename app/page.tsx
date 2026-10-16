"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import LuLoader from "@/app/components/LuLoader";

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

// The tour is told in chapters rather than as 13 loose screens. `at` is the
// index in appTourScreens where each chapter begins.
const tourChapters = [
  { at: 0, short: "Find", title: "Find a professional", body: "Browse nearby pros, their work, and real reviews before you commit." },
  { at: 3, short: "Request", title: "Post your request", body: "Share the service, your budget, preferred timing, and where you want it done." },
  { at: 6, short: "Offers", title: "Professionals respond", body: "Nearby professionals send you offers with their pricing, availability, and details." },
  { at: 8, short: "Choose", title: "Choose the best fit", body: "Review offers side by side — price, reviews, specialty, and timing — then book." },
  { at: 9, short: "Book", title: "Book and stay in touch", body: "Pay securely, message your professional, and keep every booking in one place." },
];

const heroSteps = [
  { label: "Find a pro", src: "/images/app-screenshots/01-browse.png", alt: "Browsing nearby professionals in LineUp" },
  { label: "Compare offers", src: "/images/app-screenshots/04-offers-compare.png", alt: "Comparing offers from professionals" },
  { label: "Book & pay", src: "/images/app-screenshots/07-payment.png", alt: "Paying securely for a booking" },
];

const details = [
  {
    label: "Service mode",
    title: "Choose where it happens",
    body: "Have the professional come to you, visit their shop, or head to their home studio — whatever setup fits best.",
  },
  {
    label: "Direct booking",
    title: "Skip the request next time",
    body: "Already found someone you like? Book straight from their calendar. For professionals, it doubles as a real scheduling tool — no separate booking system needed.",
  },
  {
    label: "Transparency",
    title: "Every offer, side by side",
    body: "Clients choose the service style and location they want, then compare offers in one place.",
  },
];

const proFeatures = [
  { title: "Live marketplace matching", body: "Post a request once and get real offers from professionals ready to work — no cold outreach either way." },
  { title: "Secure payments built in", body: "Every booking is paid through LineUp — protected and tracked." },
  { title: "In-app messaging", body: "Coordinate details without ever leaving the platform." },
  { title: "Verified reviews", body: "Every completed job adds to a professional's public track record." },
  { title: "Verified payouts", body: "Identity confirmed with our payment partner — every payment processed securely through Stripe." },
  { title: "Free to start", body: "No subscription required to take on real, paying clients — upgrade later if you want more." },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

// A heading line that GSAP lifts out from behind its own baseline. The outer
// span is the mask; `.js-line` is what moves.
function Line({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`block overflow-hidden pb-[0.08em] ${className}`}>
      <span className="js-line block will-change-transform">{children}</span>
    </span>
  );
}

// Modern device frame: thin bezel, pill-shaped island, one soft layered shadow.
function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative aspect-[9/19.5] rounded-[2.6rem] bg-ink p-[5px] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_30px_60px_-28px_rgba(0,0,0,0.4)] ring-1 ring-black/5 ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white">
        {children}
        <div aria-hidden="true" className="absolute left-1/2 top-[1.4%] z-10 h-[3.1%] w-[31%] -translate-x-1/2 rounded-full bg-ink" />
      </div>
    </div>
  );
}

function Phone({ src, alt, sizes, className = "" }: { src: string; alt: string; sizes: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover object-top" />
    </PhoneFrame>
  );
}

// Hero product shot: one device cycling through the three moments that
// matter, with labelled controls underneath. The fill animation pauses on
// hover/focus, and with Reduce Motion there's no auto-advance at all — the
// steps become plain buttons.
function HeroDevice() {
  const [active, setActive] = useState(0);
  // Only ever mounts client-side (the page shows a loader until auth
  // resolves), so reading matchMedia during init is safe.
  const [autoplay] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  return (
    <div className="group/device flex flex-col items-center">
      <div className="hero-device relative w-[236px] sm:w-[256px] lg:w-[min(268px,30vh)]">
        <div
          aria-hidden="true"
          className="absolute -bottom-8 left-1/2 h-12 w-[80%] -translate-x-1/2 rounded-[50%] bg-black/20 blur-2xl"
        />
        <PhoneFrame>
          {heroSteps.map((step, index) => (
            <Image
              key={step.src}
              src={step.src}
              alt={index === active ? step.alt : ""}
              aria-hidden={index !== active}
              fill
              priority
              sizes="(min-width: 1024px) 268px, 256px"
              className={`object-cover object-top transition-[opacity,transform] duration-700 ease-premium ${
                index === active ? "scale-100 opacity-100" : "scale-[1.03] opacity-0"
              }`}
            />
          ))}
        </PhoneFrame>
      </div>

      <div className="hero-fade mt-12 grid w-full max-w-[380px] grid-cols-3 gap-5">
        {heroSteps.map((step, index) => (
          <button
            key={step.label}
            type="button"
            aria-pressed={index === active}
            onClick={() => setActive(index)}
            className={`group cursor-pointer rounded-sm pt-0 text-left ${focusRing}`}
          >
            <span className="block h-px w-full overflow-hidden bg-ink/15">
              {index === active &&
                (autoplay ? (
                  <span
                    key={active}
                    onAnimationEnd={() => setActive((active + 1) % heroSteps.length)}
                    className="block h-px origin-left animate-[lu-progress_4.5s_linear_forwards] bg-ink group-hover/device:[animation-play-state:paused] group-focus-within/device:[animation-play-state:paused]"
                  />
                ) : (
                  <span className="block h-px bg-ink" />
                ))}
            </span>
            <span className="mt-3 block font-mono text-[11px] tabular-nums text-neutral-400">0{index + 1}</span>
            <span
              className={`mt-0.5 block text-sm font-medium transition-colors duration-300 ${
                index === active ? "text-ink" : "text-neutral-400 group-hover:text-neutral-600"
              }`}
            >
              {step.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p data-reveal className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
      {children}
    </p>
  );
}

export default function Page() {
  const router = useRouter();
  const [authResolved, setAuthResolved] = useState<boolean>(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const tourSectionRef = useRef<HTMLElement | null>(null);
  const tourTrackRef = useRef<HTMLDivElement | null>(null);
  const tourProgressRef = useRef<HTMLDivElement | null>(null);

  // Lets the header nav underline the section currently in view.
  const [activeSection, setActiveSection] = useState<string>("");
  useEffect(() => {
    if (!authResolved) return;
    const sections = ["app-tour", "how-it-works", "using-lineup", "founders"]
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
  }, [authResolved]);

  // Header steps out of the way while reading down the page and returns the
  // moment you scroll up.
  const [headerHidden, setHeaderHidden] = useState(false);
  useEffect(() => {
    if (!authResolved) return;
    let lastY = window.scrollY;
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (Math.abs(y - lastY) < 6) return;
        setHeaderHidden(y > 160 && y > lastY);
        lastY = y;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [authResolved]);

  // The tour's one video only plays while it's on screen, and never with
  // Reduce Motion on (the poster frame stands in).
  useEffect(() => {
    if (!authResolved) return;
    const video = document.querySelector<HTMLVideoElement>("#app-tour video");
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 }
    );
    observer.observe(video);
    return () => observer.disconnect();
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

  // All motion lives here, inside a "no-preference" matchMedia: with Reduce
  // Motion on nothing is ever hidden or moved — the page renders final.
  useGSAP(
    () => {
      if (!authResolved) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // First visit of a session shows the splash for ~1.1s — start the hero
        // as it lifts instead of playing the intro underneath it.
        const splashUp = !!document.querySelector(".z-\\[200\\]");
        gsap
          .timeline({ delay: splashUp ? 0.95 : 0.1, defaults: { ease: "expo.out" } })
          .from(".hero .js-line", { yPercent: 115, duration: 1.3, stagger: 0.1 })
          .from(".hero-fade", { y: 14, autoAlpha: 0, duration: 1, stagger: 0.07 }, "-=1")
          .from(".hero-device", { y: 70, autoAlpha: 0, duration: 1.6 }, 0.2);

        gsap.utils.toArray<HTMLElement>("[data-split]").forEach((heading) => {
          gsap.from(heading.querySelectorAll(".js-line"), {
            yPercent: 115,
            duration: 1.2,
            stagger: 0.08,
            ease: "expo.out",
            scrollTrigger: { trigger: heading, start: "top 85%" },
          });
        });

        // Supporting copy settles in — the skill's "Subtle" tier (small y,
        // short stagger) so it reads as arrival, not choreography.
        ScrollTrigger.batch("[data-reveal]", {
          start: "top 90%",
          once: true,
          onEnter: (batch) => gsap.from(batch, { y: 14, autoAlpha: 0, duration: 0.9, stagger: 0.07, ease: "power3.out" }),
        });

        gsap.from(".cta-line .js-line", {
          yPercent: 115,
          stagger: 0.1,
          ease: "none",
          scrollTrigger: { trigger: "#join-lineup", start: "top 85%", end: "top 40%", scrub: 1 },
        });
      });

      // Desktop: pin the tour and move it sideways with the vertical scroll.
      // The only pinned section on the page, per the skill's guidance.
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const section = tourSectionRef.current;
        const track = tourTrackRef.current;
        if (!section || !track) return;

        track.style.overflow = "visible";
        const distance = () => track.scrollWidth - track.clientWidth;
        const markers = gsap.utils.toArray<HTMLElement>(".js-chapter", track);
        const labels = gsap.utils.toArray<HTMLElement>(".js-chapter-label", section);

        const setChapter = (index: number) =>
          labels.forEach((label, i) => {
            label.classList.toggle("text-ink", i === index);
            label.classList.toggle("text-neutral-400", i !== index);
          });

        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (tourProgressRef.current) gsap.set(tourProgressRef.current, { scaleX: self.progress });
              const x = -distance() * self.progress;
              const anchor = window.innerWidth * 0.55;
              let current = 0;
              markers.forEach((marker, i) => {
                if (marker.offsetLeft + x < anchor) current = i;
              });
              setChapter(current);
            },
          },
        });

        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener("load", onLoad);
        return () => {
          window.removeEventListener("load", onLoad);
          track.style.overflow = "";
        };
      });
    },
    { dependencies: [authResolved], scope: rootRef }
  );

  if (!authResolved) {
    return <LuLoader />;
  }

  // animate-none!: the global page-enter animation leaves a transform on
  // <main>, which would break ScrollTrigger's position:fixed pinning.
  return (
    <main ref={rootRef} className="min-h-screen animate-none! overflow-x-clip bg-paper text-ink">
      <header
        className={`sticky top-0 z-50 border-b border-ink/[0.08] bg-paper/80 backdrop-blur-md transition-transform duration-500 ease-premium focus-within:translate-y-0 ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className={`rounded text-xl font-semibold tracking-tight ${focusRing}`}>
            LineUp
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm lg:flex">
            {[
              { id: "app-tour", label: "See It In Action" },
              { id: "how-it-works", label: "For clients" },
              { id: "using-lineup", label: "For professionals" },
              { id: "founders", label: "Founders" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`relative rounded pb-1 transition-colors ${focusRing} ${
                  activeSection === item.id ? "text-ink" : "text-neutral-500 hover:text-ink"
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-0 -bottom-0.5 h-px bg-ink transition-transform duration-300 ease-premium ${
                    activeSection === item.id ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            <Link href="/login" className={`rounded text-sm text-neutral-600 hover:text-ink ${focusRing}`}>
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className={`rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 ${focusRing}`}
            >
              Join LineUp
            </Link>
          </div>
        </div>
      </header>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="hero">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-10 lg:pb-28 lg:pt-14">
          <div className="lg:col-span-7">
            <p className="hero-fade font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Beauty marketplace · Winnipeg, MB
            </p>

            <h1 className="mt-6 max-w-[15ch] text-[clamp(2.5rem,4.6vw,4rem)] font-semibold leading-[1.03] tracking-[-0.04em] lg:max-w-none">
              <Line>This is LineUp.</Line>
              <Line className="text-balance text-neutral-400">From posting a request to getting booked.</Line>
            </h1>

            <p className="hero-fade mt-7 max-w-md text-lg leading-8 text-neutral-600">
              Post what you need once. Nearby beauty professionals send offers with their price and timing — you
              pick the one that fits.
            </p>

            <div className="hero-fade mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login?mode=signup"
                className={`group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-4 font-medium text-white transition-colors hover:bg-neutral-800 ${focusRing}`}
              >
                Post a request
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform duration-300 ease-premium group-hover:translate-x-1"
                />
              </Link>
              <a
                href="#using-lineup"
                className={`inline-flex items-center justify-center rounded-full px-7 py-4 font-medium text-ink ring-1 ring-ink/15 transition hover:ring-ink ${focusRing}`}
              >
                I&apos;m a professional
              </a>
            </div>

            <ul className="hero-fade mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/[0.08] pt-6 text-sm text-neutral-500">
              {["Secure payments via Stripe", "Verified reviews", "Free to start"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="h-4 w-4 text-ink" strokeWidth={2.25} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5">
            <HeroDevice />
          </div>
        </div>
      </section>

      {/* ──────────────────── App tour (pinned on desktop) ──────────────────── */}
      <section
        id="app-tour"
        ref={tourSectionRef}
        className="relative overflow-hidden border-t border-ink/[0.08] bg-white py-24 lg:flex lg:h-screen lg:flex-col lg:justify-center lg:pb-0 lg:pt-[72px]"
      >
        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="flex items-end justify-between gap-8">
            <div>
              <SectionLabel>See it in action</SectionLabel>
              <h2
                data-split
                className="mt-5 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]"
              >
                <Line>Every step,</Line>
                <Line className="text-neutral-400">right in the app.</Line>
              </h2>
            </div>

            <div className="hidden shrink-0 flex-col items-end gap-3 lg:flex" aria-hidden="true">
              <ol className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em]">
                {tourChapters.map((chapter, i) => (
                  <li
                    key={chapter.short}
                    className={`js-chapter-label transition-colors duration-300 ${i === 0 ? "text-ink" : "text-neutral-400"}`}
                  >
                    {chapter.short}
                  </li>
                ))}
              </ol>
              <div className="h-px w-full bg-ink/10">
                <div ref={tourProgressRef} className="h-px origin-left scale-x-0 bg-ink" />
              </div>
            </div>
          </div>
        </div>

        <div
          ref={tourTrackRef}
          className="mt-14 flex snap-x snap-proximity scroll-px-6 gap-8 overflow-x-auto px-6 pb-6 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mt-[5vh] lg:gap-12 lg:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
        >
          {appTourScreens.map((screen, index) => {
            const chapterIndex = tourChapters.findIndex((c) => c.at === index);
            const chapter = chapterIndex >= 0 ? tourChapters[chapterIndex] : null;

            return (
              <React.Fragment key={screen.src}>
                {chapter ? (
                  <div className="js-chapter flex w-[200px] shrink-0 snap-start flex-col border-l border-ink/10 pl-6 lg:w-[220px]">
                    <span className="text-5xl font-light tabular-nums tracking-[-0.04em] text-ink">
                      0{chapterIndex + 1}
                    </span>
                    <p className="mt-6 text-lg font-semibold leading-snug tracking-tight">{chapter.title}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-500">{chapter.body}</p>
                  </div>
                ) : null}

                <figure
                  className={`group flex shrink-0 snap-start flex-col ${
                    screen.stackedSrc ? "w-[270px] lg:w-[min(300px,31vh)]" : "w-[220px] lg:w-[min(236px,24vh)]"
                  }`}
                >
                  {screen.stackedSrc ? (
                    <div className="relative h-[470px] w-full lg:h-[min(512px,52vh)]">
                      <div className="absolute left-0 top-0 w-[186px] -rotate-[5deg] transition-transform duration-700 ease-premium group-hover:-translate-x-1.5 group-hover:-rotate-[3deg] lg:w-[min(204px,21vh)]">
                        <Phone src={screen.stackedSrc} alt="" sizes="204px" />
                      </div>
                      <div className="absolute bottom-0 right-0 w-[186px] rotate-[3deg] transition-transform duration-700 ease-premium group-hover:translate-x-1.5 group-hover:rotate-[1deg] lg:w-[min(204px,21vh)]">
                        <Phone src={screen.src} alt={screen.tag} sizes="204px" />
                      </div>
                    </div>
                  ) : screen.video ? (
                    <PhoneFrame>
                      <video
                        src={screen.video}
                        poster={screen.src}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        aria-label={screen.tag}
                        className="h-full w-full object-cover object-top"
                      />
                    </PhoneFrame>
                  ) : (
                    <Phone src={screen.src} alt={screen.tag} sizes="(min-width: 1024px) 236px, 220px" />
                  )}
                  <figcaption className="mt-6">
                    <p className="text-[15px] font-semibold tracking-tight">{screen.tag}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-500">{screen.description}</p>
                  </figcaption>
                </figure>
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* ───────────────────────── For clients ───────────────────────── */}
      <section id="how-it-works" className="border-t border-ink/[0.08] bg-paper">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 py-28 lg:grid-cols-12 lg:gap-10 lg:py-36">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <SectionLabel>For clients</SectionLabel>
              <h2
                data-split
                className="mt-5 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]"
              >
                <Line>Built for cleaner</Line>
                <Line className="text-neutral-400">booking decisions.</Line>
              </h2>
              <div data-reveal className="mt-10">
                <Link
                  href="/login?mode=signup"
                  className={`group inline-flex items-center gap-2 rounded-full font-medium text-ink underline decoration-ink/20 underline-offset-[6px] transition hover:decoration-ink ${focusRing}`}
                >
                  Post your first request
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform duration-300 ease-premium group-hover:translate-x-1"
                  />
                </Link>
              </div>
            </div>
          </div>

          <dl className="lg:col-span-6 lg:col-start-7">
            {details.map((item, index) => (
              <div
                key={item.title}
                data-reveal
                className={`py-10 ${index === 0 ? "pt-0 lg:pt-2" : "border-t border-ink/10"}`}
              >
                <div>
                  <dt>
                    <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{item.label}</span>
                    <span className="mt-3 block text-2xl font-semibold tracking-[-0.025em]">{item.title}</span>
                  </dt>
                  <dd className="mt-3 max-w-md leading-7 text-neutral-600">{item.body}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────────────────────── For professionals ───────────────────────── */}
      <section id="using-lineup" className="border-t border-ink/[0.08] bg-white text-ink">
        <div className="mx-auto max-w-7xl px-6 py-28 lg:py-36">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-3 lg:pt-3">
              <SectionLabel>For professionals</SectionLabel>
            </div>
            <div className="lg:col-span-9">
              <h2 data-split className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
                <Line>Reach clients who are</Line>
                <Line className="text-neutral-400">already looking for you.</Line>
              </h2>
              <p data-reveal className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">
                Whether you&apos;re just starting out or have years of clients behind you, growing further usually
                means building visibility — and a strong Instagram following is real work that pays off for a lot of
                professionals. LineUp gives you another way in alongside that: clients post exactly what they need,
                and you get matched directly, wherever you already work — home, a shared space, or a shop chair.
              </p>
            </div>
          </div>

          <ul className="mt-20 border-t border-ink/10 lg:ml-[25%]">
            {proFeatures.map((feature, index) => (
              <li
                key={feature.title}
                data-reveal
                className="group grid gap-2 border-b border-ink/10 py-7 transition-colors duration-500 hover:bg-paper md:grid-cols-12 md:items-baseline md:gap-6"
              >
                <span className="font-mono text-[11px] tabular-nums text-neutral-400 md:col-span-1">
                  0{index + 1}
                </span>
                <h3 className="text-xl font-semibold tracking-[-0.02em] transition-transform duration-500 ease-premium group-hover:translate-x-1 md:col-span-5">
                  {feature.title}
                </h3>
                <p className="leading-7 text-neutral-600 md:col-span-6">{feature.body}</p>
              </li>
            ))}
          </ul>

          <div data-reveal className="mt-14 lg:ml-[25%]">
            <Link
              href="/login?mode=signup"
              className={`group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-medium text-white transition-colors hover:bg-neutral-800 ${focusRing}`}
            >
              Join as a professional
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-300 ease-premium group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Founders ───────────────────────── */}
      <section id="founders" className="bg-paper">
        <div className="mx-auto max-w-7xl px-6 py-28 lg:py-36">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-3 lg:pt-3">
              <SectionLabel>About the founders</SectionLabel>
            </div>
            <blockquote data-split className="lg:col-span-9">
              <p className="text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em]">
                <Line className="-ml-[0.42em] pl-[0.42em]">
                  <span className="-ml-[0.42em]">“</span>Discovering trusted beauty professionals
                </Line>
                <Line className="text-neutral-400">shouldn&apos;t be difficult.”</Line>
              </p>
            </blockquote>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-12">
            <div className="space-y-5 text-base leading-8 text-neutral-600 lg:col-span-5 lg:col-start-4">
              <p data-reveal>
                LineUp was founded by two University of Manitoba students — Dan Latimer and Noah Kaminsky — with
                backgrounds in design and agriculture.
              </p>
              <p data-reveal>
                We created LineUp to solve a simple problem: discovering trusted beauty professionals in a fragmented
                and inconsistent industry should not be difficult. LineUp is a marketplace built to connect clients
                with vetted beauty professionals in a way that is more transparent, reliable, and convenient.
              </p>
              <p data-reveal>
                Launching first in Winnipeg, Manitoba, our goal is to build a platform that makes finding and booking
                aesthetic services feel just as rewarding as the service itself.
              </p>
            </div>

            <ul className="lg:col-span-3 lg:col-start-10">
              {[
                { name: "Noah Kaminsky", title: "Co-Founder & CEO" },
                { name: "Dan Latimer", title: "Co-Founder & CFO" },
              ].map((founder) => (
                <li key={founder.name} data-reveal className="border-t border-ink/10 py-5">
                  <p className="font-semibold tracking-tight">{founder.name}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    {founder.title}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Closing CTA ───────────────────────── */}
      <section id="join-lineup" className="overflow-hidden border-t border-ink/[0.08] bg-white text-ink">
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-28 lg:pt-36">
          <h2 className="cta-line text-[clamp(2.75rem,6.5vw,5.5rem)] font-semibold leading-[1] tracking-[-0.045em]">
            <Line>Ready when</Line>
            <Line className="text-neutral-400">you are.</Line>
          </h2>

          <div className="mt-14 grid gap-10 border-t border-ink/10 pt-10 lg:grid-cols-12 lg:items-end">
            <p className="max-w-md text-lg leading-8 text-neutral-600 lg:col-span-6">
              Create your account in under a minute — as a customer looking to book, or a professional ready to get
              matched with work.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-6 lg:justify-end">
              <Link
                href="/login?mode=signup"
                className={`inline-flex items-center justify-center rounded-full bg-ink px-8 py-4 font-medium text-white transition-colors hover:bg-neutral-800 ${focusRing}`}
              >
                Join LineUp
              </Link>
              <Link
                href="/login"
                className={`inline-flex items-center justify-center rounded-full px-8 py-4 font-medium text-ink ring-1 ring-ink/15 transition hover:ring-ink ${focusRing}`}
              >
                Log in
              </Link>
            </div>
          </div>
        </div>

        <footer className="border-t border-ink/[0.08] py-8">
          <div className="mx-auto flex max-w-7xl flex-col px-6 gap-4 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} LineUp — Beauty marketplace for trusted on-demand services.</p>
            <div className="flex items-center gap-6">
              <Link href="/terms" className="transition-colors hover:text-ink">Terms</Link>
              <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
              <a href="mailto:lineupmb@gmail.com" className="transition-colors hover:text-ink">Contact</a>
              <Link href="/login" className="transition-colors hover:text-ink">Sign in</Link>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
