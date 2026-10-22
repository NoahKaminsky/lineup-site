"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";
import Link from "next/link";
import SiteMenu from "@/app/components/site/SiteMenu";
import FounderCards from "@/app/components/landing/FounderCards";
import {
  focusRing,
  Line,
  PhoneFrame,
  Screen,
  Station,
  StationKind,
  StudioPlate,
} from "./parts";

/* ── Content ─────────────────────────────────────────────────────────────── */

// Left to right across the studio. The phone rises in the gap between the
// second and third station.
const stations: { kind: StationKind; left: string; leftMobile: string; spread: number; height: number }[] = [
  { kind: "barber", left: "14%", leftMobile: "4%", spread: 1, height: 82 },
  { kind: "styling", left: "31%", leftMobile: "22%", spread: 0.45, height: 74 },
  { kind: "nail", left: "69%", leftMobile: "78%", spread: -0.45, height: 62 },
  { kind: "lash", left: "86%", leftMobile: "96%", spread: -1, height: 72 },
];

const tourSteps = [
  {
    title: "Find a professional",
    body: "Browse beauty and grooming professionals near you. Their work, prices and real reviews, before you commit.",
    src: "/images/app-screenshots/01-browse.png",
  },
  {
    title: "Post your request",
    body: "Say what you want, where you want it done and when. Add reference photos so nobody has to guess.",
    src: "/images/app-screenshots/00-post-request-poster.jpg",
    video: "/videos/post-a-request.mp4",
  },
  {
    title: "Offers line up",
    body: "Pros nearby answer with their price, their time and a message. Every offer side by side.",
    src: "/images/app-screenshots/04-offers-compare.png",
  },
  {
    title: "Book, pay, chat",
    body: "Accept the one that fits, pay securely through Stripe and sort out the details in the app.",
    src: "/images/app-screenshots/07-payment.png",
  },
];

type Offer = { area: string; price: number; time: string };
const services: { id: string; name: string; trade: string; offers: Offer[] }[] = [
  {
    id: "fade",
    name: "Skin fade",
    trade: "Barber",
    offers: [
      { area: "Osborne Village", price: 35, time: "4:30 PM" },
      { area: "Exchange District", price: 40, time: "5:15 PM" },
      { area: "St. Vital", price: 45, time: "6:00 PM" },
    ],
  },
  {
    id: "silk",
    name: "Silk press",
    trade: "Stylist",
    offers: [
      { area: "Wolseley", price: 85, time: "11:00 AM" },
      { area: "The Forks", price: 95, time: "1:30 PM" },
      { area: "St. Boniface", price: 110, time: "3:00 PM" },
    ],
  },
  {
    id: "gel",
    name: "Gel manicure",
    trade: "Nail tech",
    offers: [
      { area: "Corydon", price: 45, time: "12:00 PM" },
      { area: "Osborne Village", price: 50, time: "2:45 PM" },
      { area: "Transcona", price: 55, time: "5:30 PM" },
    ],
  },
  {
    id: "lash",
    name: "Classic lash set",
    trade: "Lash artist",
    offers: [
      { area: "River Heights", price: 120, time: "10:00 AM" },
      { area: "Exchange District", price: 135, time: "1:00 PM" },
      { area: "St. James", price: 150, time: "4:00 PM" },
    ],
  },
];

const places = [
  { id: "me", label: "Come to me", short: "at your place" },
  { id: "shop", label: "Their shop", short: "at their shop" },
  { id: "studio", label: "Home studio", short: "at their home studio" },
];

const days = [
  { id: "today", label: "Today", prefix: "Today" },
  { id: "tomorrow", label: "Tomorrow", prefix: "Tomorrow" },
  { id: "weekend", label: "This weekend", prefix: "Sat" },
];

const proFeatures = [
  { title: "Clients come to you", body: "Requests arrive with the service, the place and the time already decided. You answer with your price." },
  { title: "Your calendar, built in", body: "Set your hours once. Clients who already know you can book you directly, no separate booking tool." },
  { title: "Paid through LineUp", body: "Every booking is paid securely through Stripe before the appointment, so nobody chases anybody." },
  { title: "A record that follows you", body: "Every completed job adds a verified review to your public profile and portfolio." },
  { title: "Work where you already work", body: "A shop chair, a shared space, your home studio or the client's place. You choose what you offer." },
  { title: "Free to start", body: "Take on real, paying clients without a subscription. Upgrade later if you want more." },
];

/* ── Scroll-scrubbed video ───────────────────────────────────────────────── */

// Scroll progress is the clip's playhead. The playhead eases toward the
// target so a fast flick glides instead of stuttering through frames. Clips
// are encoded with dense keyframes (scrollcraft encode.sh) so seeks land.
// Progress comes from whichever ScrollTrigger owns the moment, so a clip can
// ride a pinned timeline without a second trigger measured around the pin.
function videoScrubber(video: HTMLVideoElement, src: string) {
  let target = 0;
  let current = 0;
  let raf = 0;
  const tick = () => {
    current += (target - current) * 0.2;
    if (Math.abs(target - current) < 0.001) current = target;
    // Only issue a seek once the previous one has landed: phones decode
    // slower than the screen refreshes, and queued seeks are what stutter.
    if (video.duration && !video.seeking) {
      const t = current * (video.duration - 0.05);
      if (Math.abs(video.currentTime - t) > 0.008) video.currentTime = t;
    }
    raf = current === target && !video.seeking ? 0 : requestAnimationFrame(tick);
  };
  // iOS Safari won't paint a seeked frame until the element has played once.
  const onReady = () => {
    video.play().then(() => video.pause()).catch(() => {});
    tick();
  };
  video.addEventListener("loadedmetadata", onReady, { once: true });
  video.src = src;
  return {
    set(progress: number) {
      target = progress;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    kill() {
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onReady);
    },
  };
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition-[background-color,color,box-shadow] duration-150 ${focusRing} ${
        pressed ? "bg-ink text-white ring-1 ring-ink" : "bg-white text-ink ring-1 ring-ink/15 hover:ring-ink/40"
      }`}
    >
      {children}
    </button>
  );
}

function JoinButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/login?mode=signup"
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full bg-ink px-7 py-3.5 font-medium text-white transition-colors duration-150 hover:bg-neutral-800 ${focusRing} ${className}`}
    >
      {compact ? (
        <>
          <span className="sm:hidden">Join</span>
          <span className="hidden sm:inline">Join LineUp</span>
        </>
      ) : (
        "Join LineUp"
      )}
    </Link>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const rootRef = useRef<HTMLElement | null>(null);

  // The request the visitor builds in the client section. The same object
  // lands on the pro's phone further down and is named again at the close.
  const [serviceId, setServiceId] = useState(services[0].id);
  const [placeId, setPlaceId] = useState("shop");
  const [dayId, setDayId] = useState("tomorrow");
  const [chosen, setChosen] = useState<number | null>(null);
  const service = services.find((s) => s.id === serviceId)!;
  const place = places.find((p) => p.id === placeId)!;
  const day = days.find((d) => d.id === dayId)!;

  const [activeStep, setActiveStep] = useState(0);
  const [side, setSide] = useState<"clients" | "pros">("clients");
  const sideRef = useRef<"clients" | "pros">("clients");
  const [headerHidden, setHeaderHidden] = useState(false);

  // Header steps aside while reading down and returns on scroll up. The same
  // pass flips the Clients / Pros indicator once the pro side is in view.
  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const pros = document.getElementById("pros");
        if (pros) {
          const next = pros.getBoundingClientRect().top < window.innerHeight * 0.5 ? "pros" : "clients";
          if (next !== sideRef.current) {
            sideRef.current = next;
            setSide(next);
          }
        }
        if (Math.abs(y - lastY) < 6) return;
        setHeaderHidden(y > 160 && y > lastY);
        lastY = y;
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Tour: whichever step sits across the middle of the viewport drives the
  // one sticky phone.
  useEffect(() => {
    const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-step]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveStep(Number((entry.target as HTMLElement).dataset.step));
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, []);

  // The tour's one clip plays only while its step is showing, never with
  // Reduce Motion (the poster stands in).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll<HTMLVideoElement>(".js-tour-video").forEach((video) => {
      const visible = video.offsetParent !== null;
      if (activeStep === 1 && visible) video.play().catch(() => {});
      else video.pause();
    });
  }, [activeStep]);

  // All motion lives inside "no-preference": with Reduce Motion on nothing is
  // pinned, hidden or moved, and every section renders in its final state.
  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger);
      // Phones show/hide the address bar mid-scroll; recalculating every
      // trigger on that resize is what makes pinned sections jump.
      ScrollTrigger.config({ ignoreMobileResize: true });
      const mm = gsap.matchMedia();

      mm.add(
        {
          desktop: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
          mobile: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { desktop } = ctx.conditions as { desktop: boolean; mobile: boolean };
          const hero = document.querySelector<HTMLElement>(".js-hero")!;
          const titleWrap = document.querySelector<HTMLElement>(".js-title-wrap")!;

          // ── Hero reveal ─────────────────────────────────────────────
          // Opening: the word alone on paper. Then a window opens behind it
          // into the studio, the camera pulls back (each plane at its own
          // rate), the stations spread into a line, and the phone rises
          // between them while the word settles at the top.
          const splashUp = !!document.querySelector(".z-\\[200\\]");
          gsap.from(".js-title-wrap .js-line", {
            yPercent: 115,
            duration: 1.4,
            ease: "expo.out",
            delay: splashUp ? 0.95 : 0.15,
          });
          gsap.from(".js-tease-inner", { autoAlpha: 0, y: 10, duration: 1, delay: splashUp ? 1.3 : 0.5, ease: "power3.out" });

          // Distance from the title's resting place to the centre of the
          // frame, so the reveal can start with it dead centre.
          const centreOffset = () => {
            const restingCentre = titleWrap.offsetTop + (titleWrap.parentElement?.offsetTop ?? 0) + titleWrap.offsetHeight / 2;
            return hero.offsetHeight / 2 - restingCentre;
          };
          const spreadPx = () => window.innerWidth * (desktop ? 0.11 : 0.16);

          // Sources are assigned here, not in markup, so reduced-motion
          // visitors never download a clip and phones get the lighter encode.
          // On desktop the afternoon light drifts across the wall through
          // the reveal; phones keep the still portrait plate.
          const heroVideo = document.querySelector<HTMLVideoElement>(".js-hero-video");
          const heroScrub = desktop && heroVideo ? videoScrubber(heroVideo, "/videos/landing/hero-light.mp4") : null;

          const tl = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            scrollTrigger: {
              trigger: hero,
              start: "top top",
              end: () => `+=${window.innerHeight * (desktop ? 2.2 : 1.4)}`,
              pin: true,
              anticipatePin: 1,
              // Touch scrolling already carries momentum; a long catch-up on
              // top of it reads as lag, so phones follow the finger closer.
              scrub: desktop ? 1 : 0.35,
              invalidateOnRefresh: true,
              onUpdate: (self) => heroScrub?.set(self.progress),
            },
          });

          tl.to(".js-hero-tease", { autoAlpha: 0, duration: 0.8, ease: "none" }, 0.1)
            .fromTo(".js-title-wrap", { y: centreOffset, scale: desktop ? 1.55 : 1.3 }, { y: 0, scale: 1, duration: 4 }, 0.3)
            .fromTo(".js-shutter-t", { yPercent: 0 }, { yPercent: -100, duration: 4 }, 0.3)
            .fromTo(".js-shutter-b", { yPercent: 0 }, { yPercent: 100, duration: 4 }, 0.3)
            .fromTo(".js-shutter-l", { xPercent: 0 }, { xPercent: -100, duration: 4 }, 0.3)
            .fromTo(".js-shutter-r", { xPercent: 0 }, { xPercent: 100, duration: 4 }, 0.3)
            .fromTo(".js-back", { scale: 1.35 }, { scale: 1, duration: 4.4, ease: "power2.out" }, 0.3)
            .fromTo(".js-stations", { scale: 1.75, yPercent: 8 }, { scale: 1, yPercent: 0, duration: 4.4, ease: "power2.out" }, 0.3)
            .from(".js-station-inner", { x: (i) => stations[i].spread * spreadPx(), duration: 2.6, stagger: 0.12 }, 2.4)
            .from(".js-front", { yPercent: 100, duration: 3, ease: "power2.out" }, 2.2)
            .from(".js-hero-follow", { autoAlpha: 0, y: 16, duration: 1.2, stagger: 0.2, ease: "power2.out" }, 4.1)
            .from(".js-hero-phone", { yPercent: 105, duration: 3.2, ease: "power3.out" }, 4.6)
            .to({}, { duration: 1.2 });

          // ── Section headings: masked line reveals ───────────────────
          gsap.utils.toArray<HTMLElement>("[data-split]").forEach((heading) => {
            gsap.from(heading.querySelectorAll(".js-line"), {
              yPercent: 115,
              duration: 1.2,
              stagger: 0.08,
              ease: "expo.out",
              scrollTrigger: { trigger: heading, start: "top 85%" },
            });
          });

          ScrollTrigger.batch("[data-reveal]", {
            start: "top 90%",
            once: true,
            onEnter: (batch) => gsap.from(batch, { y: 14, autoAlpha: 0, duration: 0.9, stagger: 0.07, ease: "power3.out" }),
          });

          // ── Client side: offers step into line as you scroll ────────
          gsap.from(".js-offer", {
            x: 56,
            autoAlpha: 0,
            stagger: 0.3,
            ease: "none",
            scrollTrigger: { trigger: ".js-offers", start: "top 88%", end: "top 50%", scrub: desktop ? 1 : 0.35 },
          });

          // ── The relay: the request crosses into the pro side ────────
          // The card leaves from above (where the composer was) and lands on
          // the pro's phone. On desktop the stage pins so the landing holds.
          const relay = document.querySelector<HTMLElement>(".js-relay")!;
          if (desktop) {
            ScrollTrigger.create({ trigger: relay, start: "top top", end: "+=90%", pin: true, anticipatePin: 1 });
          }
          // It surfaces just as the offers leave the screen, so it never
          // sits on top of the composer the visitor is still using.
          gsap
            .timeline({
              scrollTrigger: {
                trigger: relay,
                start: desktop ? "top 55%" : "top 85%",
                end: desktop ? "top -45%" : "top 25%",
                scrub: desktop ? 1 : 0.35,
                invalidateOnRefresh: true,
              },
            })
            .from(".js-request", {
              y: () => -window.innerHeight * (desktop ? 0.7 : 0.4),
              x: () => (desktop ? window.innerWidth * 0.3 : 0),
              rotate: -6,
              scale: 1.2,
              ease: "power2.inOut",
              duration: 1,
            })
            .from(".js-request", { autoAlpha: 0, duration: 0.15, ease: "none" }, 0);
          ScrollTrigger.create({
            trigger: relay,
            start: desktop ? "top -45%" : "top 25%",
            toggleClass: { targets: relay, className: "is-landed" },
          });

          // ── Close: the studio again, and the chair turns to you ─────
          gsap.fromTo(
            ".js-close-plate",
            { scale: 1.1 },
            { scale: 1, ease: "none", scrollTrigger: { trigger: ".js-close", start: "top bottom", end: "top top", scrub: desktop ? 1 : 0.35 } }
          );
          const closeVideo = document.querySelector<HTMLVideoElement>(".js-close-video");
          const closeScrub = closeVideo
            ? videoScrubber(closeVideo, desktop ? "/videos/landing/close-turn.mp4" : "/videos/landing/close-turn-m.mp4")
            : null;
          ScrollTrigger.create({
            trigger: ".js-close",
            start: "top 85%",
            end: "top 10%",
            onUpdate: (self) => closeScrub?.set(self.progress),
          });

          const onLoad = () => ScrollTrigger.refresh();
          window.addEventListener("load", onLoad);
          return () => {
            window.removeEventListener("load", onLoad);
            heroScrub?.kill();
            closeScrub?.kill();
          };
        }
      );
    },
    { scope: rootRef }
  );

  // animate-none!: the global page-enter animation leaves a transform on
  // <main>, which would break ScrollTrigger's position:fixed pinning.
  return (
    <main ref={rootRef} className="min-h-screen animate-none! overflow-x-clip bg-paper text-ink">
      {/* ───────────────────────── Header ───────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-ink/[0.06] bg-paper/95 lg:bg-paper/80 lg:backdrop-blur-md transition-transform duration-500 ease-premium focus-within:translate-y-0 ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-0.5 sm:gap-1.5">
            <SiteMenu className="-ml-2" />
            <Link href="/" className={`rounded text-lg font-semibold tracking-tight sm:text-xl ${focusRing}`}>
              LineUp
            </Link>
          </div>

          {/* Which side of LineUp you're reading about. Flips on its own at
              the handoff; either half jumps to that side. */}
          <nav aria-label="Who LineUp is for" className="relative flex rounded-full bg-ink/[0.05] p-1 text-sm">
            <span
              aria-hidden="true"
              className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-premium ${
                side === "pros" ? "translate-x-full" : "translate-x-0"
              }`}
            />
            {(
              [
                { id: "clients", label: "Clients" },
                { id: "pros", label: "Pros" },
              ] as const
            ).map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={side === item.id ? "true" : undefined}
                className={`relative w-[68px] rounded-full py-1.5 text-center transition-colors duration-200 sm:w-[76px] ${focusRing} ${
                  side === item.id ? "text-ink" : "text-neutral-500 hover:text-ink"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-5">
            {/* Visible on every screen size — existing users shouldn't have
                to go through "Join LineUp" to get back in. */}
            <Link
              href="/login"
              className={`whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium text-ink hover:text-neutral-600 sm:px-0 sm:font-normal sm:text-neutral-600 sm:hover:text-ink ${focusRing}`}
            >
              Sign in
            </Link>
            <JoinButton compact className="px-4 py-2 text-sm sm:px-5 sm:py-2.5" />
          </div>
        </div>
      </header>

      {/* ───────────────────────── Hero: the reveal ───────────────────────── */}
      <section className="js-hero relative h-[100svh] min-h-[620px] overflow-hidden bg-paper" aria-labelledby="hero-title">
        <div className="js-scene absolute inset-0">
          <div className="js-back absolute inset-0 origin-[50%_65%]">
            <StudioPlate priority />
            <video
              className="js-hero-video absolute inset-0 hidden h-full w-full object-cover lg:block motion-reduce:hidden"
              poster="/images/landing/hero-light-poster.webp"
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          <div className="js-stations absolute inset-x-0 bottom-[9%] will-change-transform h-[34%] origin-[50%_100%] lg:bottom-[10%] lg:h-[36%]">
            {stations.map((station) => (
              <div
                key={station.kind}
                className="absolute bottom-0 h-full -translate-x-1/2 max-lg:left-[var(--l-m)] lg:left-[var(--l)]"
                style={{ "--l": station.left, "--l-m": station.leftMobile } as React.CSSProperties}
              >
                <div className="js-station-inner flex h-full flex-col items-center justify-end">
                  <Station kind={station.kind} className="w-auto max-w-none" style={{ height: `${station.height}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="js-hero-phone absolute bottom-[-24%] left-1/2 z-20 w-[min(220px,48vw)] -translate-x-1/2 lg:bottom-[-20%] lg:w-[min(268px,30vh)]">
            <PhoneFrame>
              <Screen src="/images/app-screenshots/04-offers-compare.png" alt="Offers from nearby professionals lined up in LineUp" sizes="268px" priority />
            </PhoneFrame>
          </div>

          {/* Foreground atmosphere: the daylight haze nearest the lens. It
              rises faster than the room, softens the floor's front edge and
              carries the scene into the paper of the next section. */}
          <div
            aria-hidden="true"
            className="js-front pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[9%] bg-gradient-to-t from-paper via-paper/60 to-transparent"
          />

          {/* The window into the studio: four paper shutters that slide
              outward, so the opening is pure transform (no per-frame
              repaint, unlike an animated clip-path). Hidden outright when
              motion is reduced, leaving the finished scene. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[35] overflow-hidden motion-reduce:hidden">
            <div className="js-shutter-t absolute inset-x-0 top-0 h-1/2 bg-paper will-change-transform" />
            <div className="js-shutter-b absolute inset-x-0 bottom-0 h-1/2 bg-paper will-change-transform" />
            <div className="js-shutter-l absolute inset-y-0 left-0 w-1/2 bg-paper will-change-transform" />
            <div className="js-shutter-r absolute inset-y-0 right-0 w-1/2 bg-paper will-change-transform" />
          </div>
        </div>

        <div className="relative z-40 px-6 pt-[15vh] text-center lg:pt-[14vh]">
          <div
            aria-hidden="true"
            className="js-hero-follow pointer-events-none absolute left-1/2 top-[8vh] -z-10 h-[46vh] w-[min(980px,120vw)] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(247_247_245/0.82),rgb(247_247_245/0))]"
          />
          <div className="js-title-wrap relative mx-auto w-fit origin-center">
            <h1 id="hero-title" className="text-[clamp(3rem,6.2vw,5.25rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              <Line>LineUp.</Line>
            </h1>
            <p className="js-hero-tease absolute left-1/2 top-full mt-4 w-[62vw] -translate-x-1/2 text-balance text-[13px] leading-snug text-neutral-500 sm:w-max sm:text-[15px] lg:mt-5 motion-reduce:hidden">
              <span className="js-tease-inner block">Beauty and grooming, booked the other way around.</span>
            </p>
          </div>

          <p className="js-hero-follow mx-auto mt-5 max-w-[24ch] text-[clamp(1.25rem,2.1vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] text-neutral-500 sm:max-w-none">
            <span className="text-ink">Post what you need.</span> Local pros line up to do it.
          </p>
          <div className="js-hero-follow mt-7 flex items-center justify-center gap-3">
            <JoinButton />
            <a
              href="#tour"
              className={`inline-flex items-center justify-center rounded-full bg-white/85 px-7 py-3.5 font-medium text-ink ring-1 ring-ink/15 lg:bg-white/60 lg:backdrop-blur transition hover:ring-ink ${focusRing}`}
            >
              See the app
            </a>
          </div>
        </div>
      </section>

      {/* ───────────────────────── The app, step by step ───────────────────────── */}
      <section id="tour" className="relative border-t border-ink/[0.08] bg-white">
        <div className="mx-auto max-w-7xl px-6 pt-28 lg:pt-36">
          <h2 data-split className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
            <Line>Every step,</Line>
            <Line className="text-neutral-400">right in the app.</Line>
          </h2>
        </div>

        <div className="mx-auto max-w-7xl px-6 pb-20 lg:grid lg:grid-cols-12 lg:gap-10 lg:pb-0">
          <ol className="lg:col-span-5">
            {tourSteps.map((step, i) => (
              <li key={step.title} data-step={i} className="flex flex-col justify-center py-14 lg:min-h-[80vh] lg:py-0">
                <div className="mx-auto mb-10 w-[220px] lg:hidden">
                  <PhoneFrame>
                    {step.video ? (
                      <video
                        className="js-tour-video h-full w-full object-cover object-top"
                        src={step.video}
                        poster={step.src}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        aria-label={step.title}
                      />
                    ) : (
                      <Screen src={step.src} alt={step.title} sizes="220px" />
                    )}
                  </PhoneFrame>
                </div>
                <h3
                  className={`text-[clamp(1.5rem,2.4vw,2rem)] font-semibold tracking-[-0.03em] transition-colors duration-500 ${
                    activeStep === i ? "text-ink" : "text-ink lg:text-neutral-300"
                  }`}
                >
                  {step.title}
                </h3>
                <p
                  className={`mt-3 max-w-sm leading-7 transition-colors duration-500 ${
                    activeStep === i ? "text-neutral-600" : "text-neutral-600 lg:text-neutral-300"
                  }`}
                >
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="hidden lg:col-span-6 lg:col-start-7 lg:block">
            <div className="sticky top-0 flex h-screen items-center justify-center">
              <div className="w-[min(290px,33vh)]">
                <PhoneFrame>
                  {tourSteps.map((step, i) =>
                    step.video ? (
                      <video
                        key={step.title}
                        className={`js-tour-video absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${
                          activeStep === i ? "opacity-100" : "opacity-0"
                        }`}
                        src={step.video}
                        poster={step.src}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        aria-hidden={activeStep !== i}
                        aria-label={step.title}
                      />
                    ) : (
                      <div
                        key={step.title}
                        aria-hidden={activeStep !== i}
                        className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-premium ${
                          activeStep === i ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"
                        }`}
                      >
                        <Screen src={step.src} alt={activeStep === i ? step.title : ""} sizes="290px" />
                      </div>
                    )
                  )}
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Client side: build a request ───────────────────────── */}
      <section id="clients" className="border-t border-ink/[0.08] bg-paper">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-28 lg:grid-cols-12 lg:gap-10 lg:py-36">
          <div className="lg:col-span-5">
            <h2 data-split className="text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
              <Line>Post once.</Line>
              <Line className="text-neutral-400">Let them come to you.</Line>
            </h2>
            <p data-reveal className="mt-7 max-w-md text-lg leading-8 text-neutral-600">
              Tell LineUp the service, where you want it and when. Pros nearby send offers with their price and time.
              You pick.
            </p>

            <dl className="mt-12 max-w-md">
              {[
                { t: "Where it happens is up to you", d: "They come to you, you visit their shop, or you go to their home studio." },
                { t: "Found someone you like?", d: "Next time, skip the request and book straight from their calendar." },
              ].map((item) => (
                <div key={item.t} data-reveal className="border-t border-ink/10 py-5">
                  <dt className="font-semibold tracking-tight">{item.t}</dt>
                  <dd className="mt-1.5 leading-7 text-neutral-600">{item.d}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            <div
              data-reveal
              className="rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_28px_56px_-36px_rgba(0,0,0,0.3)] ring-1 ring-ink/[0.07] sm:p-8"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-lg font-semibold tracking-tight">New request</p>
                <p className="text-xs text-neutral-400">Try it. Nothing gets posted.</p>
              </div>

              {[
                { legend: "What", items: services.map((s) => ({ id: s.id, label: s.name })), value: serviceId, set: (id: string) => { setServiceId(id); setChosen(null); } },
                { legend: "Where", items: places, value: placeId, set: setPlaceId },
                { legend: "When", items: days, value: dayId, set: setDayId },
              ].map((group) => (
                <fieldset key={group.legend} className="mt-6">
                  <legend className="text-sm text-neutral-500">{group.legend}</legend>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <Chip key={item.id} pressed={group.value === item.id} onClick={() => group.set(item.id)}>
                        {item.label}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="mt-10">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-semibold tracking-tight">Offers</p>
                <p className="text-xs text-neutral-400">Examples. Prices are illustrative.</p>
              </div>
              <ol className="js-offers mt-4 space-y-3" aria-live="polite">
                {service.offers.map((offer, i) => (
                  <li key={i} className="js-offer">
                    <div
                      key={service.id}
                      className="animate-[lu-line-in_320ms_var(--ease-premium)_backwards] motion-reduce:animate-none"
                      style={{ animationDelay: `${i * 60}ms`, "--motion-distance": "16px" } as React.CSSProperties}
                    >
                      <button
                        type="button"
                        aria-pressed={chosen === i}
                        onClick={() => setChosen(chosen === i ? null : i)}
                        className={`flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left transition-shadow duration-150 ${focusRing} ${
                          chosen === i ? "ring-2 ring-ink" : "ring-1 ring-ink/[0.08] hover:ring-ink/25"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600"
                        >
                          {service.trade[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {service.trade}, {offer.area}
                          </span>
                          <span className="block text-sm text-neutral-500">
                            {day.prefix}, {offer.time}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-lg font-semibold tabular-nums tracking-tight">${offer.price}</span>
                          <span className={`block text-xs ${chosen === i ? "text-ink" : "text-neutral-400"}`}>
                            {chosen === i ? "Chosen" : "Tap to choose"}
                          </span>
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Pro side: it lands with you ───────────────────────── */}
      <section id="pros" className="relative border-t border-ink/[0.08] bg-white">
        <div className="js-relay relative lg:h-screen">
          <div className="mx-auto grid h-full max-w-7xl items-center gap-14 px-6 py-28 lg:grid-cols-12 lg:gap-10 lg:py-0">
            <div className="relative mx-auto w-[230px] lg:col-span-4 lg:col-start-2 lg:w-[min(290px,34vh)]">
              <PhoneFrame>
                <Screen src="/images/app-screenshots/10-pro-calendar.png" alt="A professional's LineUp calendar" sizes="290px" eager />
              </PhoneFrame>

              {/* The visitor's own request, as the pro receives it. Lives
                  outside the phone's clip so it can arrive from above. */}
              <div className="js-request absolute inset-x-[5%] top-[8%] z-20">
                <div className="relative rounded-2xl bg-white p-3.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] ring-1 ring-ink/[0.08]">
                  <span
                    aria-hidden="true"
                    className="absolute -inset-px rounded-2xl opacity-0 ring-2 ring-ink [.is-landed_&]:animate-[lu-ping_1s_ease-out]"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold">LineUp</span>
                    <span className="text-neutral-400">now</span>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold leading-snug">New request nearby</p>
                  <p className="text-[12px] leading-snug text-neutral-600">
                    {service.name} · {place.short} · {day.label.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 lg:col-start-7">
              <p className="text-sm font-medium text-neutral-500">For professionals</p>
              <h2 className="mt-4 text-[clamp(2rem,3.6vw,3rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
                Your next client
                <span className="block text-neutral-400">is already asking.</span>
              </h2>
              <p className="mt-7 max-w-lg text-lg leading-8 text-neutral-600">
                That request you just built? This is where it lands. Clients post exactly what they want, where and
                when, and you answer with an offer at your price. No cold DMs, no chasing.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 pb-28 lg:pb-36 lg:pt-8">
          <ul className="border-t border-ink/10 lg:ml-[50%]">
            {proFeatures.map((feature) => (
              <li key={feature.title} data-reveal className="grid gap-2 border-b border-ink/10 py-7 md:grid-cols-12 md:items-baseline md:gap-6">
                <h3 className="text-xl font-semibold tracking-[-0.02em] md:col-span-5">{feature.title}</h3>
                <p className="leading-7 text-neutral-600 md:col-span-7">{feature.body}</p>
              </li>
            ))}
          </ul>
          <div data-reveal className="mt-12 lg:ml-[50%]">
            <JoinButton />
          </div>
        </div>
      </section>

      {/* ───────────────────────── Founders ───────────────────────── */}
      <section id="founders" className="border-t border-ink/[0.08] bg-paper">
        <div className="mx-auto max-w-7xl px-6 py-28 lg:py-36">
          <blockquote data-split className="max-w-4xl">
            <p className="text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em]">
              <Line>“Finding someone you trust</Line>
              <Line className="text-neutral-400">shouldn&apos;t take a dozen DMs.”</Line>
            </p>
          </blockquote>

          <div className="mt-16 grid gap-12 lg:grid-cols-12">
            <div className="space-y-5 text-base leading-8 text-neutral-600 lg:col-span-5 lg:col-start-4">
              <p data-reveal>
                LineUp was founded in Winnipeg by Noah Kaminsky and Dan Latimer, from the University of Manitoba,
                with backgrounds in agribusiness and design.
              </p>
              <p data-reveal>
                Beauty and grooming is a fragmented industry: the best people are spread across shops, shared spaces and
                home studios, and finding them usually means scrolling and messaging. We built LineUp so clients can
                ask once and the right pros can answer.
              </p>
              <p data-reveal>Launching first in Winnipeg, Manitoba.</p>
            </div>

            <div className="lg:col-span-3 lg:col-start-10">
              <FounderCards />
              <Link
                href="/about"
                data-reveal
                className={`mt-5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink ${focusRing}`}
              >
                More about LineUp
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Close: back in the studio ───────────────────────── */}
      <section id="join" className="relative overflow-hidden border-t border-ink/[0.08] bg-paper">
        <div className="js-close relative h-[92svh] min-h-[640px]">
          {/* One chair, turning to face you as the page arrives. With
              Reduce Motion the clip is skipped and its last frame stands in. */}
          <div aria-hidden="true" className="js-close-plate absolute inset-0 origin-[60%_70%] bg-[#ecebe6]">
            <video
              className="js-close-video absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
              poster="/images/landing/close-turn-poster.webp"
              muted
              playsInline
              preload="auto"
              tabIndex={-1}
            />
            <Image
              src="/images/landing/close-turn-end.webp"
              alt=""
              fill
              sizes="100vw"
              className="hidden object-cover motion-reduce:block"
            />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-6 pt-[16vh]">
            <h2 className="text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[1] tracking-[-0.045em]">
              Next in line:
              <span className="block text-neutral-500">you.</span>
            </h2>
            <p className="mt-8 max-w-md text-lg leading-8 text-neutral-600">
              Create your account in under a minute. As a client, that {service.name.toLowerCase()} is one step away.
              As a pro, so is your next client.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <JoinButton className="px-8 py-4" />
              <Link
                href="/login"
                className={`inline-flex items-center justify-center rounded-full bg-white/85 px-8 py-4 font-medium text-ink ring-1 ring-ink/15 lg:bg-white/60 lg:backdrop-blur transition hover:ring-ink ${focusRing}`}
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>

        <footer className="relative z-10 border-t border-ink/[0.08] bg-paper py-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} LineUp. Beauty and grooming, booked the other way around.</p>
            <div className="flex items-center gap-6">
              <Link href="/terms" className="transition-colors hover:text-ink">Terms</Link>
              <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
              <a href="mailto:lineupmb@gmail.com" className="transition-colors hover:text-ink">Contact</a>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
