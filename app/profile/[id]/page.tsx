"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  role: string | null;
  professional_type: string | null;
  location: string | null;
  bio: string | null;
  instagram_handle: string | null;
  service_modes: string | string[] | null;
};

type PortfolioItem = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
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

type EnrichedReview = ReviewRow & {
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
};

export default function ProfessionalProfilePage() {
  const params = useParams();
  const profileId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [reviews, setReviews] = useState<EnrichedReview[]>([]);
  const [showBannerPreview, setShowBannerPreview] = useState(false);

  useEffect(() => {
    async function loadProfilePage() {
      try {
        setLoading(true);
        setMessage("");

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, full_name, avatar_url, banner_url, role, professional_type, location, bio, instagram_handle, service_modes"
          )
          .eq("id", profileId)
          .single();

        if (profileError || !profileData) {
          setMessage(profileError?.message || "Profile not found.");
          setLoading(false);
          return;
        }

        setProfile(profileData as Profile);

        const { data: portfolioData, error: portfolioError } = await supabase
          .from("professional_portfolio")
          .select("id, user_id, image_url, caption, created_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false });

        if (!portfolioError && portfolioData) {
          setPortfolioItems(portfolioData as PortfolioItem[]);
        } else {
          setPortfolioItems([]);
        }

        const { data: reviewData, error: reviewError } = await supabase
          .from("professional_reviews")
          .select("id, professional_id, reviewer_id, rating, comment, created_at")
          .eq("professional_id", profileId)
          .order("created_at", { ascending: false });

        if (!reviewError && reviewData) {
          const reviewerIds = [...new Set(reviewData.map((review) => review.reviewer_id))];

          let reviewerMap = new Map<
            string,
            { full_name: string | null; avatar_url: string | null }
          >();

          if (reviewerIds.length > 0) {
            const { data: reviewerProfiles } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", reviewerIds);

            if (reviewerProfiles) {
              reviewerMap = new Map(
                reviewerProfiles.map((reviewer) => [
                  reviewer.id,
                  {
                    full_name: reviewer.full_name ?? null,
                    avatar_url: reviewer.avatar_url ?? null,
                  },
                ])
              );
            }
          }

          const enrichedReviews: EnrichedReview[] = reviewData.map((review) => {
            const reviewer = reviewerMap.get(review.reviewer_id);

            return {
              ...review,
              reviewer_name: reviewer?.full_name ?? null,
              reviewer_avatar_url: reviewer?.avatar_url ?? null,
            };
          });

          setReviews(enrichedReviews);
        } else {
          setReviews([]);
        }

        setLoading(false);
      } catch (error) {
        console.error("PROFILE PAGE CRASH:", error);
        setMessage("Something went wrong loading this profile.");
        setLoading(false);
      }
    }

    if (profileId) {
      loadProfilePage();
    }
  }, [profileId]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  function formatProfessionalType(value: string | null) {
    if (!value) return "Beauty professional";

    return value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatServiceModes(value: string | string[] | null) {
    if (!value) return null;

    if (Array.isArray(value)) {
      return value
        .map((mode) =>
          mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
        )
        .join(" • ");
    }

    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function renderStars(rating: number) {
    const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
    return "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl py-16">
          <p className="text-neutral-500">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl py-16">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            ← Back
          </Link>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Profile not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            LineUp
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/requests"
              className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
            >
              Back to requests
            </Link>

            <Link
              href="/account"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              My account
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-6xl py-12">
          <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="relative">
              <button
                type="button"
                onClick={() => profile.banner_url && setShowBannerPreview(true)}
                className={`block w-full ${
                  profile.banner_url ? "cursor-zoom-in" : "cursor-default"
                }`}
              >
                <div className="h-56 w-full overflow-hidden rounded-t-[2rem] bg-neutral-100 md:h-72">
                  {profile.banner_url ? (
                    <img
                      src={profile.banner_url}
                      alt="Cover photo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                      No cover photo
                    </div>
                  )}
                </div>
              </button>

              <div className="absolute -bottom-16 left-6 md:left-8">
                <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow md:h-40 md:w-40">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || "Professional"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-neutral-500">
                      {profile.full_name?.charAt(0).toUpperCase() || "P"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-20 md:px-8 md:pt-24">
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                {profile.full_name || "Professional"}
              </h1>

              <p className="mt-3 text-lg text-neutral-600">
                {formatProfessionalType(profile.professional_type)}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {profile.location ? (
                  <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                    {profile.location}
                  </span>
                ) : null}

                {formatServiceModes(profile.service_modes) ? (
                  <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                    {formatServiceModes(profile.service_modes)}
                  </span>
                ) : null}

                {averageRating ? (
                  <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                    {averageRating} / 5 · {reviews.length} review{reviews.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                    No reviews yet
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              {profile.bio ? (
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    About
                  </p>
                  <p className="mt-4 max-w-3xl text-lg leading-8 text-neutral-600">
                    {profile.bio}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    About
                  </p>
                  <p className="mt-4 text-neutral-400">No bio added yet.</p>
                </div>
              )}

              {profile.instagram_handle ? (
                <div className="mt-8">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Instagram
                  </p>
                  <a
                    href={`https://instagram.com/${String(profile.instagram_handle).replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    @{String(profile.instagram_handle).replace("@", "")}
                  </a>
                </div>
              ) : null}
            </div>

            <div className="space-y-6">
              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Trust snapshot
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Average rating
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {averageRating || "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Total reviews
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {reviews.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Portfolio items
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {portfolioItems.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Specialty
                    </p>
                    <p className="mt-2 text-base font-semibold text-neutral-900">
                      {formatProfessionalType(profile.professional_type)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Portfolio
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Past work
              </h2>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {portfolioItems.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white"
                >
                  <div className="aspect-square bg-neutral-100">
                    <img
                      src={item.image_url}
                      alt={item.caption || "Portfolio image"}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {item.caption ? (
                    <div className="p-4">
                      <p className="text-sm text-neutral-700">{item.caption}</p>
                    </div>
                  ) : null}
                </div>
              ))}

              {portfolioItems.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600 sm:col-span-2 lg:col-span-3">
                  No portfolio uploaded yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Reviews
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Client feedback
            </h2>

            {reviews.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                No reviews yet.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                          {review.reviewer_avatar_url ? (
                            <img
                              src={review.reviewer_avatar_url}
                              alt={review.reviewer_name || "Reviewer"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                              {review.reviewer_name?.charAt(0).toUpperCase() || "C"}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="font-semibold text-neutral-900">
                            {review.reviewer_name || "Verified client"}
                          </p>
                          <p className="text-xs text-neutral-400">Verified client</p>
                          <p className="text-sm text-neutral-500">
                            {formatDate(review.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="text-sm font-medium text-neutral-900">
                        {renderStars(review.rating)}{" "}
                        <span className="ml-2">{review.rating}/5</span>
                      </div>
                    </div>

                    {review.comment ? (
                      <p className="mt-4 leading-7 text-neutral-600">
                        {review.comment}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {message ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          ) : null}
        </div>
      </main>

      {showBannerPreview && profile.banner_url ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setShowBannerPreview(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            Close
          </button>

          <div className="flex h-full w-full max-w-6xl items-center justify-center">
            <img
              src={profile.banner_url}
              alt="Full cover photo"
              className="max-h-full max-w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}