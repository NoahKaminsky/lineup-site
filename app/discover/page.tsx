"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../components/AppNavbar";

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  role: string | null;
  professional_type: string | null;
  professional_types?: string[] | null;
  location: string | null;
  bio: string | null;
  instagram_handle: string | null;
  service_modes: string[] | string | null;
  specialties: string[] | null;
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  default_appointment_duration: number | null;
};

type ProfessionalService = {
  id: string;
  professional_id: string;
  service_name: string;
  duration_minutes: number;
  is_active: boolean;
  is_bookable: boolean;
  created_at: string;
};

type ReviewRow = {
  id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type PortfolioItem = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};

type AvailabilityRow = {
  id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
};

type DiscoverCard = {
  profile: ProfileRow;
  services: ProfessionalService[];
  portfolioPreview: PortfolioItem | null;
  availability: AvailabilityRow[];
  bookings: BookingRow[];
  averageRating: string | null;
  averageRatingNumber: number | null;
  reviewCount: number;
  tagBadges: string[];
};

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Barber", value: "barber" },
  { label: "Hair", value: "hairstylist" },
  { label: "Nails", value: "nail_artist" },
  { label: "Lashes", value: "lash_artist" },
  { label: "Brows", value: "brow_artist" },
  { label: "Makeup", value: "makeup_artist" },
  { label: "Waxing", value: "wax_technician" },
] as const;

const serviceModeOptions = [
  { label: "At home", value: "at_home" },
  { label: "In shop", value: "in_shop" },
  { label: "Studio", value: "home_studio" },
] as const;

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim();
}

function isProfessionalRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return !!normalized && !normalized.includes("customer");
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Professional";
  if (value === "nail_tech") return "Nail Artist";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getProfessionalTypes(profile: ProfileRow) {
  const multi = Array.isArray(profile.professional_types)
    ? profile.professional_types.filter(Boolean)
    : [];

  if (multi.length > 0) return multi;

  return profile.professional_type ? [profile.professional_type] : [];
}

function getPlainServiceModes(value: string[] | string | null) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function hasOpenThisWeek(profile: ProfileRow, availability: AvailabilityRow[], bookings: BookingRow[]) {
  if (!profile.direct_booking_enabled || !profile.public_availability_enabled) return false;

  const activeAvailability = availability.filter((row) => row.is_active);
  if (activeAvailability.length === 0) return false;

  for (let offset = 0; offset < 7; offset += 1) {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    currentDate.setDate(currentDate.getDate() + offset);

    const dateKey = formatDateKey(currentDate);
    const dayOfWeek = currentDate.getDay();

    const matchingWindows = activeAvailability.filter(
      (row) => Number(row.day_of_week) === dayOfWeek
    );

    for (const window of matchingWindows) {
      const startMinutes = timeToMinutes(window.start_time);
      const endMinutes = timeToMinutes(window.end_time);

      if (endMinutes <= startMinutes || endMinutes - startMinutes < 30) continue;

      const overlappingBookings = bookings.filter(
        (booking) => booking.booking_date === dateKey && booking.status !== "cancelled"
      );

      if (overlappingBookings.length === 0) return true;

      let cursor = startMinutes;

      const sortedBookings = overlappingBookings
        .map((booking) => ({
          start: timeToMinutes(booking.start_time),
          end: timeToMinutes(booking.end_time),
        }))
        .sort((a, b) => a.start - b.start);

      for (const booking of sortedBookings) {
        if (booking.start - cursor >= 30) return true;
        cursor = Math.max(cursor, booking.end);
      }

      if (endMinutes - cursor >= 30) return true;
    }
  }

  return false;
}

function buildTags(params: {
  profile: ProfileRow;
  services: ProfessionalService[];
  reviewCount: number;
  averageRatingNumber: number | null;
  availability: AvailabilityRow[];
  bookings: BookingRow[];
}) {
  const { profile, services, reviewCount, averageRatingNumber, availability, bookings } = params;
  const tags: string[] = [];

  const modes = getPlainServiceModes(profile.service_modes);
  const isOpenThisWeek = hasOpenThisWeek(profile, availability, bookings);

  if (profile.direct_booking_enabled) tags.push("Direct");
  if (isOpenThisWeek) tags.push("Open this week");
  if (averageRatingNumber !== null && averageRatingNumber >= 4.7 && reviewCount >= 3) {
    tags.push("Highly rated");
  }
  if (modes.includes("at_home")) tags.push("At-home");
  if (services.length > 0) tags.push(`${services.length} services`);

  return tags.slice(0, 3);
}

export default function DiscoverPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<(typeof categoryOptions)[number]["value"]>("all");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);

  useEffect(() => {
    async function loadDiscoverPage() {
      try {
        setLoading(true);
        setMessage("");

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, avatar_url, banner_url, role, professional_type, professional_types, location, bio, instagram_handle, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration"
          );

        if (profilesError) {
          setMessage(profilesError.message);
          setLoading(false);
          return;
        }

        const professionals = ((profilesData || []) as ProfileRow[]).filter((profile) =>
          isProfessionalRole(profile.role)
        );

        const professionalIds = professionals.map((profile) => profile.id);

        if (professionalIds.length === 0) {
          setCards([]);
          setLoading(false);
          return;
        }

        const [servicesResult, reviewsResult, portfolioResult, availabilityResult, bookingsResult] =
          await Promise.all([
            supabase
              .from("professional_services")
              .select("id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at")
              .in("professional_id", professionalIds)
              .eq("is_active", true)
              .order("created_at", { ascending: true }),

            supabase
              .from("professional_reviews")
              .select("id, professional_id, reviewer_id, rating, comment, created_at")
              .in("professional_id", professionalIds),

            supabase
              .from("professional_portfolio")
              .select("id, user_id, image_url, caption, created_at")
              .in("user_id", professionalIds)
              .order("created_at", { ascending: false }),

            supabase
              .from("professional_availability")
              .select("id, professional_id, day_of_week, start_time, end_time, is_active")
              .in("professional_id", professionalIds),

            supabase
              .from("bookings")
              .select("id, professional_id, customer_id, booking_date, start_time, end_time, status")
              .in("professional_id", professionalIds)
              .in("status", ["confirmed", "completion_requested", "completed"]),
          ]);

        const servicesData = (servicesResult.data || []) as ProfessionalService[];
        const reviewsData = (reviewsResult.data || []) as ReviewRow[];
        const portfolioData = (portfolioResult.data || []) as PortfolioItem[];
        const availabilityData = (availabilityResult.data || []) as AvailabilityRow[];
        const bookingsData = (bookingsResult.data || []) as BookingRow[];

        const servicesByProfessional = new Map<string, ProfessionalService[]>();
        const reviewsByProfessional = new Map<string, ReviewRow[]>();
        const portfolioByProfessional = new Map<string, PortfolioItem[]>();
        const availabilityByProfessional = new Map<string, AvailabilityRow[]>();
        const bookingsByProfessional = new Map<string, BookingRow[]>();

        servicesData.forEach((service) => {
          if (!servicesByProfessional.has(service.professional_id)) {
            servicesByProfessional.set(service.professional_id, []);
          }
          servicesByProfessional.get(service.professional_id)!.push(service);
        });

        reviewsData.forEach((review) => {
          if (!reviewsByProfessional.has(review.professional_id)) {
            reviewsByProfessional.set(review.professional_id, []);
          }
          reviewsByProfessional.get(review.professional_id)!.push(review);
        });

        portfolioData.forEach((item) => {
          if (!portfolioByProfessional.has(item.user_id)) {
            portfolioByProfessional.set(item.user_id, []);
          }
          portfolioByProfessional.get(item.user_id)!.push(item);
        });

        availabilityData.forEach((row) => {
          if (!availabilityByProfessional.has(row.professional_id)) {
            availabilityByProfessional.set(row.professional_id, []);
          }
          availabilityByProfessional.get(row.professional_id)!.push({
            ...row,
            start_time: String(row.start_time).slice(0, 5),
            end_time: String(row.end_time).slice(0, 5),
          });
        });

        bookingsData.forEach((booking) => {
          if (!bookingsByProfessional.has(booking.professional_id)) {
            bookingsByProfessional.set(booking.professional_id, []);
          }
          bookingsByProfessional.get(booking.professional_id)!.push({
            ...booking,
            start_time: String(booking.start_time).slice(0, 5),
            end_time: String(booking.end_time).slice(0, 5),
          });
        });

        const builtCards: DiscoverCard[] = professionals.map((profile) => {
          const proServices = servicesByProfessional.get(profile.id) || [];
          const proReviews = reviewsByProfessional.get(profile.id) || [];
          const proPortfolio = portfolioByProfessional.get(profile.id) || [];
          const proAvailability = availabilityByProfessional.get(profile.id) || [];
          const proBookings = bookingsByProfessional.get(profile.id) || [];

          const averageRatingNumber =
            proReviews.length > 0
              ? proReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
                proReviews.length
              : null;

          const averageRating =
            averageRatingNumber !== null ? averageRatingNumber.toFixed(1) : null;

          const tagBadges = buildTags({
            profile,
            services: proServices,
            reviewCount: proReviews.length,
            averageRatingNumber,
            availability: proAvailability,
            bookings: proBookings,
          });

          return {
            profile,
            services: proServices,
            portfolioPreview: proPortfolio[0] || null,
            availability: proAvailability,
            bookings: proBookings,
            averageRating,
            averageRatingNumber,
            reviewCount: proReviews.length,
            tagBadges,
          };
        });

        setCards(builtCards);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setMessage("Something went wrong loading professionals.");
        setLoading(false);
      }
    }

    loadDiscoverPage();
  }, []);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cards.filter((card) => {
      const { profile, services, tagBadges } = card;
      const roles = getProfessionalTypes(profile);

      const matchesCategory = selectedCategory === "all" || roles.includes(selectedCategory);

      const plainModes = getPlainServiceModes(profile.service_modes);
      const matchesModes =
        selectedModes.length === 0 || selectedModes.every((mode) => plainModes.includes(mode));

      const searchableText = [
        profile.full_name || "",
        ...roles,
        profile.location || "",
        profile.bio || "",
        ...(profile.specialties || []),
        ...plainModes,
        ...services.map((service) => service.service_name),
        ...tagBadges,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);

      return matchesCategory && matchesModes && matchesSearch;
    });
  }, [cards, search, selectedCategory, selectedModes]);

  const featuredCards = useMemo(() => {
    return filteredCards
      .filter((card) => card.portfolioPreview?.image_url || card.profile.banner_url)
      .slice(0, 6);
  }, [filteredCards]);

  function toggleMode(mode: string) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  function getCardImage(card: DiscoverCard) {
    return card.portfolioPreview?.image_url || card.profile.banner_url || null;
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
              Browse
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
              Discover pros
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
              Scroll, search, and tap into profiles when someone catches your eye.
            </p>
          </div>

          <Link
            href="/requests/new"
            className="inline-flex w-fit rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Post a request
          </Link>
        </div>

        <div className="sticky top-0 z-20 -mx-4 mt-5 border-y border-neutral-100 bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pros, lashes, brows, nails..."
              className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
            />

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categoryOptions.map((category) => {
                const selected = selectedCategory === category.value;

                return (
                  <button
                    key={category.value}
                    type="button"
                    onClick={() => setSelectedCategory(category.value)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {serviceModeOptions.map((mode) => {
                const selected = selectedModes.includes(mode.value);

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => toggleMode(mode.value)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
            Loading professionals...
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
            No professionals matched those filters.
          </div>
        ) : (
          <>
            {featuredCards.length > 0 ? (
              <section className="mt-8">
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
                      Featured
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">
                      Active this week
                    </h2>
                  </div>
                  <span className="text-xs text-neutral-400">Swipe</span>
                </div>

                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {featuredCards.map((card) => {
                    const image = getCardImage(card);
                    const roles = getProfessionalTypes(card.profile);

                    return (
                      <Link
                        key={`featured-${card.profile.id}`}
                        href={`/profile/${card.profile.id}`}
                        className="group relative h-56 w-40 shrink-0 overflow-hidden rounded-[1.75rem] bg-neutral-100 sm:h-72 sm:w-52"
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={card.profile.full_name || "Professional"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                            No preview
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                          <p className="truncate text-sm font-semibold">
                            {card.profile.full_name || "Professional"}
                          </p>
                          <p className="mt-1 truncate text-xs text-white/75">
                            {roles.map(formatLabel).join(" • ")}
                          </p>
                          <p className="mt-2 text-xs text-white/85">
                            {card.averageRating ? `${card.averageRating}★` : "New"}{" "}
                            {card.reviewCount > 0 ? `· ${card.reviewCount} reviews` : ""}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
                    Explore
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {filteredCards.length} professional{filteredCards.length === 1 ? "" : "s"}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredCards.map((card) => {
                  const image = getCardImage(card);
                  const roles = getProfessionalTypes(card.profile);
                  const primaryRole = roles[0] ? formatLabel(roles[0]) : "Professional";
                  const secondaryText =
                    roles.length > 1
                      ? `${roles.length} services`
                      : card.profile.location || primaryRole;

                  return (
                    <Link
                      key={card.profile.id}
                      href={`/profile/${card.profile.id}`}
                      className="group overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                        {image ? (
                          <img
                            src={image}
                            alt={card.profile.full_name || "Professional"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                            No preview
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-90" />

                        {card.tagBadges[0] ? (
                          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-neutral-900 shadow-sm">
                            {card.tagBadges[0]}
                          </span>
                        ) : null}

                        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-sm">
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                            {card.profile.avatar_url ? (
                              <img
                                src={card.profile.avatar_url}
                                alt={card.profile.full_name || "Professional"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-neutral-500">
                                {card.profile.full_name?.charAt(0).toUpperCase() || "P"}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-neutral-900">
                              {card.profile.full_name || "Professional"}
                            </p>
                            <p className="truncate text-[11px] text-neutral-500">
                              {primaryRole}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-neutral-900">
                            {primaryRole}
                          </p>
                          <p className="shrink-0 text-xs text-neutral-500">
                            {card.averageRating ? `${card.averageRating}★` : "New"}
                          </p>
                        </div>

                        <p className="mt-1 truncate text-xs text-neutral-500">
                          {secondaryText}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
