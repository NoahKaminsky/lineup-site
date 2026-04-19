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
  "all",
  "barber",
  "hairstylist",
  "nail_tech",
  "lash_artist",
  "brow_artist",
  "esthetician",
  "makeup_artist",
] as const;

const serviceModeOptions = ["at_home", "in_shop", "home_studio"] as const;

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim();
}

function isProfessionalRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return !!normalized && !normalized.includes("customer");
}

function formatProfessionalType(value: string | null) {
  if (!value) return "Professional";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatServiceModes(value: string[] | string | null) {
  if (!value) return [];

  const modes = Array.isArray(value) ? value : [value];

  return modes.map((mode) =>
    String(mode)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
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
  const [hours, minutes] = String(time)
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function hasOpenThisWeek(
  profile: ProfileRow,
  availability: AvailabilityRow[],
  bookings: BookingRow[]
) {
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

      if (endMinutes <= startMinutes) continue;

      const hasAnyWindowSpace = endMinutes - startMinutes >= 30;
      if (!hasAnyWindowSpace) continue;

      const overlappingBookings = bookings.filter(
        (booking) =>
          booking.booking_date === dateKey &&
          booking.status !== "cancelled"
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
        if (booking.start - cursor >= 30) {
          return true;
        }
        cursor = Math.max(cursor, booking.end);
      }

      if (endMinutes - cursor >= 30) {
        return true;
      }
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
  portfolioPreview: PortfolioItem | null;
}) {
  const { profile, services, reviewCount, averageRatingNumber, availability, bookings, portfolioPreview } =
    params;

  const tags: string[] = [];
  const modes = getPlainServiceModes(profile.service_modes);

  const hasBookableServices = services.length > 0;
  const hasPortfolio = !!portfolioPreview;
  const hasReviews = reviewCount > 0;
  const isOpenThisWeek = hasOpenThisWeek(profile, availability, bookings);

  if (profile.direct_booking_enabled) tags.push("Direct booking");
  if (isOpenThisWeek) tags.push("Open this week");
  if (averageRatingNumber !== null && averageRatingNumber >= 4.7 && reviewCount >= 3) {
    tags.push("Highly rated");
  }
  if (hasReviews) tags.push("Verified reviews");
  if (modes.includes("at_home")) tags.push("At-home available");
  if (modes.includes("in_shop")) tags.push("In-shop available");
  if (modes.includes("home_studio")) tags.push("Home studio");
  if (hasBookableServices && hasPortfolio && (hasReviews || isOpenThisWeek)) {
    tags.push("Active on LineUp");
  }
  if (reviewCount > 0 && reviewCount <= 2 && hasBookableServices) {
    tags.push("New to LineUp");
  }

  const uniqueCustomers = new Set(
    bookings
      .filter((booking) => booking.customer_id)
      .map((booking) => booking.customer_id)
  );
  if (uniqueCustomers.size >= 2 && bookings.length >= 3) {
    tags.push("Returning clients");
  }

  return tags.slice(0, 5);
}

export default function DiscoverPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof categoryOptions)[number]>("all");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);

  useEffect(() => {
    async function loadDiscoverPage() {
      try {
        setLoading(true);
        setMessage("");

        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, avatar_url, banner_url, role, professional_type, location, bio, instagram_handle, service_modes, specialties, direct_booking_enabled, public_availability_enabled, default_appointment_duration"
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
              .select(
                "id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at"
              )
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
              .in("status", ["confirmed", "completion_requested", "completed"])
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
            portfolioPreview: proPortfolio[0] || null,
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

      const matchesCategory =
        selectedCategory === "all" || profile.professional_type === selectedCategory;

      const plainModes = getPlainServiceModes(profile.service_modes);
      const matchesModes =
        selectedModes.length === 0 ||
        selectedModes.every((mode) => plainModes.includes(mode));

      const searchableText = [
        profile.full_name || "",
        profile.professional_type || "",
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

  function toggleMode(mode: string) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <Navbar />

      <div className="mx-auto max-w-6xl py-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Browse professionals
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Find someone you’d book again.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-neutral-600">
              Browse professionals on LineUp, or post a request and let the right one come to you.
            </p>
          </div>

          <Link
            href="/requests/new"
            className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Post a request
          </Link>
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Search
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, specialty, service, location, or tag..."
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) =>
                  setSelectedCategory(e.target.value as (typeof categoryOptions)[number])
                }
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                <option value="all">All categories</option>
                <option value="barber">Barber</option>
                <option value="hairstylist">Hairstylist</option>
                <option value="nail_tech">Nail Tech</option>
                <option value="lash_artist">Lash Artist</option>
                <option value="brow_artist">Brow Artist</option>
                <option value="esthetician">Esthetician</option>
                <option value="makeup_artist">Makeup Artist</option>
              </select>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-neutral-700">Service mode</p>
            <div className="flex flex-wrap gap-3">
              {serviceModeOptions.map((mode) => {
                const selected = selectedModes.includes(mode);

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleMode(mode)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                    }`}
                  >
                    {mode.replaceAll("_", " ")}
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
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-neutral-600">
            Loading professionals...
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-neutral-600">
            No professionals matched those filters.
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {filteredCards.map((card) => {
              const { profile, services, averageRating, reviewCount, portfolioPreview, tagBadges } =
                card;
              const formattedModes = formatServiceModes(profile.service_modes);
              const previewServices = services.slice(0, 4);

              return (
                <Link
                  key={profile.id}
                  href={`/profile/${profile.id}`}
                  className="group overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative h-52 w-full overflow-hidden bg-neutral-100">
                    {portfolioPreview?.image_url ? (
                      <img
                        src={portfolioPreview.image_url}
                        alt={portfolioPreview.caption || profile.full_name || "Professional"}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : profile.banner_url ? (
                      <img
                        src={profile.banner_url}
                        alt={profile.full_name || "Professional"}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                        No preview
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full bg-white/95 px-3 py-2 shadow-sm">
                      <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.full_name || "Professional"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
                            {profile.full_name?.charAt(0).toUpperCase() || "P"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {profile.full_name || "Professional"}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {formatProfessionalType(profile.professional_type)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                        {formatProfessionalType(profile.professional_type)}
                      </span>

                      {averageRating ? (
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                          {averageRating} / 5 · {reviewCount} review{reviewCount === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                          No reviews yet
                        </span>
                      )}
                    </div>

                    {tagBadges.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tagBadges.map((tag) => {
                          const emphasized =
                            tag === "Direct booking" ||
                            tag === "Open this week" ||
                            tag === "Highly rated";

                          return (
                            <span
                              key={tag}
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                emphasized
                                  ? "bg-black text-white"
                                  : "border border-neutral-200 bg-neutral-50 text-neutral-700"
                              }`}
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}

                    {profile.location ? (
                      <p className="mt-4 text-sm text-neutral-600">{profile.location}</p>
                    ) : null}

                    {profile.bio ? (
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-neutral-600">
                        {profile.bio}
                      </p>
                    ) : null}

                    {profile.specialties && profile.specialties.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {profile.specialties.slice(0, 4).map((specialty) => (
                          <span
                            key={specialty}
                            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {formattedModes.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {formattedModes.map((mode) => (
                          <span
                            key={mode}
                            className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
                          >
                            {mode}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-[1.25rem] border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Services preview
                      </p>

                      {previewServices.length === 0 ? (
                        <p className="mt-3 text-sm text-neutral-500">
                          No bookable services listed yet.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {previewServices.map((service) => (
                            <span
                              key={service.id}
                              className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700"
                            >
                              {service.service_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-900">
                        View profile
                      </span>
                      <span className="text-sm text-neutral-500 transition group-hover:text-neutral-900">
                        →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}