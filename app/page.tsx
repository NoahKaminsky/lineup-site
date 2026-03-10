"use client";

import React, { useEffect, useMemo, useState } from "react";

type LiveBid = {
  name: string;
  role: string;
  price: string;
  rating: string;
  time: string;
  mode: string;
};

type MarketplaceCard = {
  title: string;
  postedBy: string;
  badge: string;
  location: string;
  budget: string;
  timing: string;
  details: string;
  bids: LiveBid[];
};

const serviceTags = ["Barbers", "Nails", "Lashes", "Brows", "Hair"];

const joinRoles = [
  "I am a customer",
  "I am a barber",
  "I am a cosmetology student",
  "I am a salon / studio owner",
  "I am a lash artist",
  "I am a nail tech",
  "I am a brow artist",
  "I am a hairstylist",
  "Other beauty professional",
];

const aiPreviewOptions = [
  {
    name: "Low Taper Fade",
    type: "Barber",
    detail: "See how a cut could frame your face before you book.",
  },
  {
    name: "Classic Lash Set",
    type: "Lashes",
    detail: "Preview fuller lashes with a more natural look.",
  },
  {
    name: "Soft Brown Ombre Brows",
    type: "Brows",
    detail: "Visualize shape, fullness, and overall style fit.",
  },
  {
    name: "Glossy French Set",
    type: "Nails",
    detail: "Try a nail style preview before committing to a design.",
  },
];

const marketplaceCards: MarketplaceCard[] = [
  {
    title: "Fresh Fade at Home",
    postedBy: "Noah K.",
    badge: "Barber",
    location: "Winnipeg, MB",
    budget: "$35–$50",
    timing: "Tomorrow, 6:00 PM",
    details: "Looking for a clean burst fade at my place.",
    bids: [
      {
        name: "Jayden Cuts",
        role: "Barber",
        price: "$42",
        rating: "4.9",
        time: "Tomorrow, 6:15 PM",
        mode: "At home",
      },
      {
        name: "FadeHouse Studio",
        role: "Barber",
        price: "$38",
        rating: "4.8",
        time: "Tomorrow, 7:00 PM",
        mode: "In shop",
      },
      {
        name: "CutsByReese",
        role: "Barber",
        price: "$45",
        rating: "5.0",
        time: "Tomorrow, 6:00 PM",
        mode: "At home",
      },
    ],
  },
  {
    title: "Full Set Nails for Event",
    postedBy: "Sarah M.",
    badge: "Nails",
    location: "St. Vital",
    budget: "$60–$85",
    timing: "Friday, 4:30 PM",
    details: "Neutral glam set for graduation photos.",
    bids: [
      {
        name: "GlossedByT",
        role: "Nail Tech",
        price: "$70",
        rating: "5.0",
        time: "Friday, 4:30 PM",
        mode: "Mobile",
      },
      {
        name: "Studio Polished",
        role: "Nail Tech",
        price: "$62",
        rating: "4.7",
        time: "Friday, 5:00 PM",
        mode: "In shop",
      },
    ],
  },
  {
    title: "Last-Minute Chair Opening",
    postedBy: "Downtown Studio",
    badge: "Salon Slot",
    location: "Downtown Winnipeg",
    budget: "20% off",
    timing: "Today, 2:30 PM",
    details: "Open barber chair available due to cancellation.",
    bids: [
      {
        name: "Open Slot Promo",
        role: "Salon",
        price: "20% off",
        rating: "4.9",
        time: "Today, 2:30 PM",
        mode: "In shop",
      },
    ],
  },
];

const featuredPros = [
  {
    name: "Andre Styles",
    role: "Barber",
    specialty: "#1 barber in Winnipeg for burst fades",
    rating: "4.9",
    text: "Known for sharp fades, clean lineups, and reliable mobile bookings.",
  },
  {
    name: "Maria Beauty",
    role: "Lash Artist",
    specialty: "#1 lash artist in Winnipeg for natural sets",
    rating: "5.0",
    text: "Popular for soft glam work, strong retention, and trusted client reviews.",
  },
  {
    name: "Kiana Brows",
    role: "Brow Tech",
    specialty: "#1 brow artist in Winnipeg for shaping",
    rating: "4.9",
    text: "Trusted for clean shaping, tint work, and polished, repeatable results.",
  },
];

const requestModeOptions = ["At home", "In shop", "Home studio"];

function BidFeed({
  bids,
  activeIndex,
}: {
  bids: LiveBid[];
  activeIndex: number;
}) {
  const orderedBids = [...bids.slice(activeIndex), ...bids.slice(0, activeIndex)];

  return (
    <div className="space-y-3">
      {orderedBids.map((bid, index) => {
        const isLead = index === 0;

        return (
          <div
            key={`${bid.name}-${bid.price}-${bid.time}`}
            className={`rounded-[1.35rem] border px-4 py-4 transition-all duration-500 ${
              isLead
                ? "translate-y-0 border-emerald-300 bg-white opacity-100 shadow-[0_14px_34px_rgba(16,185,129,0.14)]"
                : index === 1
                  ? "translate-y-1 border-neutral-200 bg-neutral-50 opacity-90"
                  : "translate-y-2 border-neutral-200 bg-neutral-50 opacity-75"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[1.15rem] font-semibold text-neutral-900">{bid.name}</p>
                  {isLead && (
                    <span className="animate-pulse rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">
                      Live
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-neutral-500">
                  {bid.role} • ⭐ {bid.rating} • {bid.mode}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[1.15rem] font-semibold text-neutral-900">{bid.price}</p>
                <p className="mt-1 text-sm text-neutral-500">{bid.time}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Page() {
  const [joinCount, setJoinCount] = useState<number>(284);
  const [email, setEmail] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [selectedPreview, setSelectedPreview] = useState<string>("Low Taper Fade");
  const [liveTicker, setLiveTicker] = useState<number>(0);
  const [activeBidIndices, setActiveBidIndices] = useState<number[]>(
    marketplaceCards.map(() => 0),
  );
  const [selectedRequestMode, setSelectedRequestMode] = useState<string>("At home");
  const [requestService, setRequestService] = useState<string>("Haircut");
  const [requestLocation, setRequestLocation] = useState<string>("South Winnipeg");
  const [requestBudget, setRequestBudget] = useState<string>("$40–$50");
  const [requestTime, setRequestTime] = useState<string>("Tomorrow at 6:00 PM");
  const [requestDescription, setRequestDescription] = useState<string>(
    "Looking for a burst fade and beard cleanup. Want someone experienced and available after work.",
  );

  useEffect(() => {
    const countInterval = setInterval(() => {
      setJoinCount((prev) => prev + (Math.random() > 0.68 ? 1 : 0));
    }, 3200);

    return () => clearInterval(countInterval);
  }, []);

  useEffect(() => {
    const bidInterval = setInterval(() => {
      setActiveBidIndices((prev) =>
        prev.map((index, cardIndex) => {
          const bidsLength = marketplaceCards[cardIndex].bids.length;
          if (bidsLength <= 1) return 0;
          return (index + 1) % bidsLength;
        }),
      );
      setLiveTicker((prev) => (prev + 1) % 6);
    }, 2500);

    return () => clearInterval(bidInterval);
  }, []);

  const countLabel = useMemo(() => joinCount.toLocaleString(), [joinCount]);

  const currentPreview = useMemo(() => {
    return (
      aiPreviewOptions.find((item) => item.name === selectedPreview) ||
      aiPreviewOptions[0]
    );
  }, [selectedPreview]);

  const tickerMessages = [
    "Jayden Cuts just bid $42",
    "FadeHouse Studio just sent a new offer",
    "Open Slot Promo just updated a chair opening",
    "GlossedByT just matched a graduation nail request",
    "CutsByReese just responded to a mobile fade request",
    "Kiana Brows just joined the nearby recommendation list",
  ];

  const scrollToJoin = (): void => {
    const section = document.getElementById("join-lineup");
    if (section) section.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    alert(
      `Prototype only:\nEmail: ${email || "Not provided"}\nRole: ${
        selectedRole || "Not selected"
      }\nLocation: ${location || "Not provided"}`,
    );

    setEmail("");
    setSelectedRole("");
    setLocation("");
  };

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#" className="text-xl font-semibold tracking-tight">
            LineUp
          </a>

          <nav className="hidden items-center gap-8 text-sm text-neutral-600 md:flex">
            <a href="#who-we-are" className="transition hover:text-neutral-900">
              Who we are
            </a>
            <a href="#how-it-works" className="transition hover:text-neutral-900">
              How it works
            </a>
            <a href="#request-flow" className="transition hover:text-neutral-900">
              Request a service
            </a>
            <a href="#demo" className="transition hover:text-neutral-900">
              Marketplace
            </a>
            <a href="#professionals" className="transition hover:text-neutral-900">
              Spotlight
            </a>
            <a href="#ai-preview" className="transition hover:text-neutral-900">
              AI preview
            </a>
            <a href="#join-lineup" className="transition hover:text-neutral-900">
              Join the LineUp
            </a>
          </nav>

          <button
            onClick={scrollToJoin}
            className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Join the LineUp
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 md:grid-cols-[1.02fr_0.98fr] md:pt-24">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Prelaunch access: {countLabel}+ joined
          </div>

          <p className="text-sm font-medium text-neutral-500">
            Beauty services, reimagined as a live marketplace.
          </p>

          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
            Beauty booking built around flexibility, trust, and live demand.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            Request the exact service you want and compare live offers from trusted professionals before booking.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              onClick={scrollToJoin}
              className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Join the LineUp
            </button>
            <a
              href="#how-it-works"
              className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              See how it works
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
            <span className="font-medium text-neutral-700">Built for modern beauty booking</span>
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

        <div className="relative">
          <div className="absolute left-8 top-8 h-36 w-36 rounded-full bg-emerald-100/50 blur-3xl" />
          <div className="absolute bottom-8 right-8 h-44 w-44 rounded-full bg-sky-100/35 blur-3xl" />

          <div className="relative rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_70px_rgba(0,0,0,0.07)]">
            <div className="rounded-3xl bg-neutral-900 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-neutral-300">Client request</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Need a fresh burst fade tomorrow
                  </h2>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                  At home
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-neutral-300">
                Post your request and compare offers before you book.
              </p>
            </div>

            <div className="mt-5 rounded-3xl border border-neutral-200 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500">Incoming offers</p>
                  <h3 className="text-lg font-semibold">Marketplace preview</h3>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  Live bids
                </span>
              </div>

              <BidFeed bids={marketplaceCards[0].bids} activeIndex={activeBidIndices[0]} />

              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                {tickerMessages[liveTicker]}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="who-we-are" className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Who We Are
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              LineUp is building a marketplace for modern beauty booking.
            </h2>
            <p className="mt-5 max-w-2xl leading-8 text-neutral-600">
              We are creating a platform where clients can post exactly what they
              need and compare trusted beauty professionals in one cleaner flow.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <h3 className="text-xl font-semibold">For clients</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Request exactly what you want and compare offers with less guesswork.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <h3 className="text-xl font-semibold">For professionals</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Respond to active demand, build trust, and win more bookings.
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-7">
              <h3 className="text-xl font-semibold">For the industry</h3>
              <p className="mt-3 leading-7 text-neutral-600">
                Bring at-home, in-shop, and home studio services into one marketplace.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20">
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
            <p className="text-sm font-medium text-neutral-500">01</p>
            <h3 className="mt-3 text-xl font-semibold">Post your request</h3>
            <p className="mt-3 leading-7 text-neutral-600">
              Share your service, budget, timing, and preferences in one place.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 p-7">
            <p className="text-sm font-medium text-neutral-500">02</p>
            <h3 className="mt-3 text-xl font-semibold">Receive live offers</h3>
            <p className="mt-3 leading-7 text-neutral-600">
              Professionals respond with pricing, timing, and availability in a live marketplace flow.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 p-7">
            <p className="text-sm font-medium text-neutral-500">03</p>
            <h3 className="mt-3 text-xl font-semibold">Book with confidence</h3>
            <p className="mt-3 leading-7 text-neutral-600">
              Compare offers, specialties, reviews, and fit before deciding.
            </p>
          </div>
        </div>
      </section>

      <section id="request-flow" className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Request a Service
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            A cleaner way to post exactly what you need.
          </h2>
          <p className="mt-4 leading-7 text-neutral-600">
            Choose your service, set your budget, pick where the appointment should happen,
            and let professionals respond with live offers.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">Request a service</h3>
                <p className="mt-1 text-sm text-neutral-500">Interactive MVP form</p>
              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Live concept
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-600">
                  Service
                </label>
                <select
                  value={requestService}
                  onChange={(e) => setRequestService(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-neutral-900"
                >
                  <option>Haircut</option>
                  <option>Beard cleanup</option>
                  <option>Full set nails</option>
                  <option>Lash set</option>
                  <option>Brows</option>
                  <option>Hair styling</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-600">
                    Location
                  </label>
                  <input
                    type="text"
                    value={requestLocation}
                    onChange={(e) => setRequestLocation(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none placeholder:text-neutral-400 transition focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-600">
                    Budget
                  </label>
                  <input
                    type="text"
                    value={requestBudget}
                    onChange={(e) => setRequestBudget(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none placeholder:text-neutral-400 transition focus:border-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-600">
                  Appointment type
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {requestModeOptions.map((mode) => {
                    const isSelected = selectedRequestMode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedRequestMode(mode)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                          isSelected
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400"
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-600">
                  Preferred time
                </label>
                <input
                  type="text"
                  value={requestTime}
                  onChange={(e) => setRequestTime(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none placeholder:text-neutral-400 transition focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-600">
                  Describe the look
                </label>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-neutral-900 outline-none placeholder:text-neutral-400 transition focus:border-neutral-900"
                />
              </div>

              <button
                type="button"
                className="w-full rounded-2xl bg-neutral-950 px-5 py-3.5 text-sm font-medium text-white transition hover:opacity-95"
              >
                Submit request
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-neutral-500">
                Why it works
              </p>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <p className="text-sm text-neutral-500">Service mode</p>
                  <h3 className="mt-1 text-lg font-semibold">Choose where it happens</h3>
                  <p className="mt-2 text-neutral-600">
                    At home, in shop, or home studio — clients choose the setup that fits best.
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <p className="text-sm text-neutral-500">Live marketplace</p>
                  <h3 className="mt-1 text-lg font-semibold">Professionals respond to demand</h3>
                  <p className="mt-2 text-neutral-600">
                    Instead of searching blindly, clients post once and compare incoming offers.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-900 p-6 text-white">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-neutral-300">
                Core value
              </p>
              <h3 className="mt-3 text-2xl font-semibold">
                Booking becomes more flexible and more transparent.
              </h3>
              <p className="mt-4 leading-7 text-neutral-300">
                Clients choose the service style and location they want, then compare offers in one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Marketplace Preview
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Live bids that feel more like a real feed.
          </h2>
          <p className="mt-4 leading-7 text-neutral-600">
            The marketplace stays mostly neutral while motion, spacing, and live status carry the activity.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
          {tickerMessages[liveTicker]}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {marketplaceCards.map((card, cardIndex) => (
            <div
              key={card.title}
              className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[2rem] font-semibold leading-tight tracking-tight">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-[1.1rem] text-neutral-500">
                    Posted by {card.postedBy}
                  </p>
                </div>

                <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                  {card.badge}
                </span>
              </div>

              <div className="mt-8 space-y-3 text-[1.02rem] leading-8 text-neutral-700">
                <p>
                  <span className="font-medium text-neutral-900">Location:</span>{" "}
                  {card.location}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">Budget:</span>{" "}
                  {card.budget}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">Timing:</span>{" "}
                  {card.timing}
                </p>
                <p>
                  <span className="font-medium text-neutral-900">Details:</span>{" "}
                  {card.details}
                </p>
              </div>

              <div className="mt-8 rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                <h4 className="text-[1.65rem] font-semibold tracking-tight">Live bids</h4>

                <div className="mt-5">
                  <BidFeed bids={card.bids} activeIndex={activeBidIndices[cardIndex]} />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-neutral-950 px-6 py-3 text-[1.02rem] font-medium text-white transition hover:opacity-95"
                  >
                    Choose bid
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-neutral-300 bg-white px-6 py-3 text-[1.02rem] font-medium text-neutral-700 transition hover:bg-neutral-50"
                  >
                    Message
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="professionals" className="border-y border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Spotlight
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Specialties and reviews can power discovery.
            </h2>
            <p className="mt-4 leading-7 text-neutral-600">
              Spotlight is where top providers can stand out by specialty without cluttering the bidding experience.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {featuredPros.map((pro) => (
              <div
                key={pro.name}
                className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">{pro.name}</h3>
                    <p className="mt-1 text-neutral-500">{pro.role}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                    ⭐ {pro.rating}
                  </span>
                </div>

                <p className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                  {pro.specialty}
                </p>

                <p className="mt-4 leading-7 text-neutral-600">{pro.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-preview" className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              AI Preview Feature
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Preview a look before you ever book.
            </h2>
            <p className="mt-4 leading-7 text-neutral-600">
              Keep this as a future-facing feature that helps clients build more confidence before they choose a professional.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_14px_50px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500">App flow preview</p>
                  <h3 className="mt-1 text-2xl font-semibold">Create your preview</h3>
                </div>
                <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white">
                  Future feature
                </span>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-dashed border-neutral-300 bg-neutral-50 p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <svg
                      className="h-6 w-6 text-neutral-700"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 16V8M12 8L9 11M12 8L15 11M5 17.5V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V17.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Upload your photo</p>
                    <p className="text-sm text-neutral-500">
                      Selfie for cuts, lashes, and brows, or hand photo for nails.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="mb-3 block text-sm font-medium text-neutral-600">
                  Choose a service preview
                </label>
                <div className="grid gap-3">
                  {aiPreviewOptions.map((option) => {
                    const isActive = option.name === selectedPreview;

                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setSelectedPreview(option.name)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isActive
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white hover:border-neutral-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">{option.name}</p>
                            <p
                              className={`mt-1 text-sm ${
                                isActive ? "text-white/80" : "text-neutral-500"
                              }`}
                            >
                              {option.type}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs ${
                              isActive
                                ? "bg-white text-neutral-900"
                                : "bg-neutral-100 text-neutral-700"
                            }`}
                          >
                            Selected
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">Step 1</p>
                  <p className="mt-1 font-medium text-neutral-900">Upload photo</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">Step 2</p>
                  <p className="mt-1 font-medium text-neutral-900">Generate preview</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm text-neutral-500">Step 3</p>
                  <p className="mt-1 font-medium text-neutral-900">Book matching pro</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_14px_50px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500">App screen mockup</p>
                  <h3 className="mt-1 text-2xl font-semibold">Preview results</h3>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                  {currentPreview.type}
                </span>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-4">
                <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
                    <div>
                      <p className="text-sm text-neutral-500">Previewing</p>
                      <p className="font-semibold text-neutral-900">{currentPreview.name}</p>
                    </div>
                    <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-white">
                      AI render
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-[1.25rem] bg-neutral-50 p-4">
                      <p className="text-sm text-neutral-500">Your photo</p>
                      <div className="mt-3 flex h-56 items-center justify-center rounded-[1.25rem] bg-white">
                        <div className="flex flex-col items-center">
                          <div className="h-20 w-20 rounded-full bg-neutral-200" />
                          <div className="mt-4 h-24 w-28 rounded-[1.25rem] bg-neutral-200" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.25rem] bg-neutral-900 p-4 text-white">
                      <p className="text-sm text-neutral-300">AI preview result</p>
                      <div className="mt-3 flex h-56 items-center justify-center rounded-[1.25rem] bg-white/5">
                        {currentPreview.type === "Barber" && (
                          <div className="flex flex-col items-center">
                            <div className="relative h-20 w-20 rounded-full bg-white/20">
                              <div className="absolute inset-x-3 top-2 h-4 rounded-full bg-white/80" />
                              <div className="absolute inset-y-5 left-2 w-2 rounded-full bg-white/30" />
                              <div className="absolute inset-y-5 right-2 w-2 rounded-full bg-white/30" />
                            </div>
                            <div className="mt-4 h-24 w-28 rounded-[1.25rem] bg-white/15" />
                          </div>
                        )}

                        {currentPreview.type === "Lashes" && (
                          <div className="flex flex-col items-center">
                            <div className="relative h-20 w-20 rounded-full bg-white/20">
                              <div className="absolute left-4 top-8 h-1.5 w-4 rounded-full bg-white/90" />
                              <div className="absolute right-4 top-8 h-1.5 w-4 rounded-full bg-white/90" />
                              <div className="absolute left-4 top-7 h-2 w-4 rounded-full border-t border-white/80" />
                              <div className="absolute right-4 top-7 h-2 w-4 rounded-full border-t border-white/80" />
                            </div>
                            <div className="mt-4 h-24 w-28 rounded-[1.25rem] bg-white/15" />
                          </div>
                        )}

                        {currentPreview.type === "Brows" && (
                          <div className="flex flex-col items-center">
                            <div className="relative h-20 w-20 rounded-full bg-white/20">
                              <div className="absolute left-3 top-6 h-1.5 w-5 rotate-[-8deg] rounded-full bg-white/90" />
                              <div className="absolute right-3 top-6 h-1.5 w-5 rotate-[8deg] rounded-full bg-white/90" />
                            </div>
                            <div className="mt-4 h-24 w-28 rounded-[1.25rem] bg-white/15" />
                          </div>
                        )}

                        {currentPreview.type === "Nails" && (
                          <div className="flex items-center gap-2">
                            <div className="h-20 w-5 rounded-full bg-white/80" />
                            <div className="h-24 w-5 rounded-full bg-white/70" />
                            <div className="h-28 w-5 rounded-full bg-white" />
                            <div className="h-24 w-5 rounded-full bg-white/70" />
                            <div className="h-20 w-5 rounded-full bg-white/80" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1.25rem] bg-neutral-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-neutral-500">Recommendation</p>
                        <p className="font-semibold text-neutral-900">
                          Best matched professionals for this look
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700 shadow-sm">
                        3 nearby
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <div>
                          <p className="font-medium text-neutral-900">Jay Cuts</p>
                          <p className="text-sm text-neutral-500">4.9 rating · At home</p>
                        </div>
                        <p className="font-semibold text-neutral-900">$42</p>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <div>
                          <p className="font-medium text-neutral-900">Studio Gloss</p>
                          <p className="text-sm text-neutral-500">Portfolio match · In shop</p>
                        </div>
                        <p className="font-semibold text-neutral-900">$48</p>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <div>
                          <p className="font-medium text-neutral-900">Kiana Brows</p>
                          <p className="text-sm text-neutral-500">Top reviews · Home studio</p>
                        </div>
                        <p className="font-semibold text-neutral-900">$50</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                  Preview before booking
                </span>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                  Better booking confidence
                </span>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                  Match to the right pro
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="join-lineup" className="mx-auto max-w-5xl px-6 pb-24 pt-20">
        <div className="rounded-[2rem] bg-neutral-900 px-6 py-12 text-white md:px-10 md:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-300">
              Prelaunch Access
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
              Join the LineUp before launch.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-neutral-300 md:text-lg">
              Early interest is growing. Join {countLabel}+ people already in LineUp.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-8 grid max-w-2xl gap-3"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="min-w-0 rounded-2xl border border-white/15 bg-white px-5 py-3 text-neutral-900 outline-none placeholder:text-neutral-500"
              />

              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-neutral-900 outline-none"
              >
                <option value="">Select who you are</option>
                {joinRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Your location (city, province/state, or neighborhood)"
                className="min-w-0 rounded-2xl border border-white/15 bg-white px-5 py-3 text-neutral-900 outline-none placeholder:text-neutral-500"
              />

              <button
                type="submit"
                className="rounded-2xl bg-white px-6 py-3 font-medium text-neutral-900 transition hover:opacity-90"
              >
                Join the LineUp
              </button>
            </form>

            <p className="mt-4 text-sm text-neutral-400">
              Prototype mode for now. The live count is visual until the backend is connected.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-neutral-500 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} LineUp</p>
          <p>Beauty marketplace for trusted on-demand services.</p>
        </div>
      </footer>
    </main>
  );
}