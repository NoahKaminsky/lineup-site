"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  professional_type: string | null;
  location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  service_modes: string[] | null;
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

const modeOptions = ["at_home", "in_shop", "home_studio"];

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showBannerPreview, setShowBannerPreview] = useState(false);

  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [reviews, setReviews] = useState<EnrichedReview[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");

  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [serviceModes, setServiceModes] = useState<string[]>([]);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setProfile(data);
      setFullName(data.full_name || "");
      setLocation(data.location || "");
      setBio(data.bio || "");
      setInstagramHandle(data.instagram_handle || "");
      setServiceModes(data.service_modes || []);

      const { data: portfolioData, error: portfolioError } = await supabase
        .from("professional_portfolio")
        .select("id, user_id, image_url, caption, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!portfolioError && portfolioData) {
        setPortfolioItems(portfolioData as PortfolioItem[]);
      } else {
        setPortfolioItems([]);
      }

      const { data: reviewData, error: reviewError } = await supabase
        .from("professional_reviews")
        .select("id, professional_id, reviewer_id, rating, comment, created_at")
        .eq("professional_id", user.id)
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
    }

    loadProfile();
  }, [router]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  function toggleServiceMode(mode: string) {
    setServiceModes((prev) =>
      prev.includes(mode)
        ? prev.filter((item) => item !== mode)
        : [...prev, mode]
    );
  }

  function formatProfessionalType(value: string | null) {
    if (!value) return "Customer";
    return value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatServiceModes(value: string[] | null) {
    if (!value || value.length === 0) return null;
    return value
      .map((mode) =>
        mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
      )
      .join(" • ");
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setAvatarFile(file);
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setBannerFile(file);
  }

  async function handleAvatarUpload() {
    try {
      setAvatarUploading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("You must be signed in to upload a photo.");
        return;
      }

      if (!avatarFile) {
        setMessage("Please choose an image first.");
        return;
      }

      const fileExt = avatarFile.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, avatarFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        setMessage(updateError.message);
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              avatar_url: publicUrl,
            }
          : prev
      );

      setAvatarFile(null);
      setMessage("Profile photo updated.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong uploading your photo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleBannerUpload() {
    try {
      setBannerUploading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("You must be signed in to upload a banner.");
        return;
      }

      if (!bannerFile) {
        setMessage("Please choose an image first.");
        return;
      }

      const fileExt = bannerFile.name.split(".").pop();
      const filePath = `${user.id}/banner-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-banners")
        .upload(filePath, bannerFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("profile-banners")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ banner_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        setMessage(updateError.message);
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              banner_url: publicUrl,
            }
          : prev
      );

      setBannerFile(null);
      setMessage("Banner updated.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong uploading your banner.");
    } finally {
      setBannerUploading(false);
    }
  }

  async function handlePortfolioUpload() {
    try {
      setPortfolioUploading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("You must be signed in to upload portfolio work.");
        return;
      }

      if (!uploadFile) {
        setMessage("Please choose an image first.");
        return;
      }

      const filePath = `${user.id}/${crypto.randomUUID()}-${uploadFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("portfolio-images")
        .upload(filePath, uploadFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("portfolio-images")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { data: insertedItem, error: insertError } = await supabase
        .from("professional_portfolio")
        .insert({
          user_id: user.id,
          image_url: publicUrl,
          caption: uploadCaption.trim() || null,
        })
        .select("id, user_id, image_url, caption, created_at")
        .single();

      if (insertError) {
        setMessage(insertError.message);
        return;
      }

      if (insertedItem) {
        setPortfolioItems((prev) => [insertedItem as PortfolioItem, ...prev]);
      }

      setUploadFile(null);
      setUploadCaption("");
      setShowUpload(false);
      setMessage("Portfolio item added.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong uploading your portfolio item.");
    } finally {
      setPortfolioUploading(false);
    }
  }

  async function handleDeletePortfolioItem(itemId: string) {
    if (!confirm("Delete this portfolio item?")) return;

    try {
      setMessage("");

      const { error } = await supabase
        .from("professional_portfolio")
        .delete()
        .eq("id", itemId);

      if (error) {
        setMessage(error.message);
        return;
      }

      setPortfolioItems((prev) => prev.filter((item) => item.id !== itemId));
      setMessage("Portfolio item deleted.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong deleting this portfolio item.");
    }
  }

  function handleCancelEdit() {
    if (!profile) return;

    setFullName(profile.full_name || "");
    setLocation(profile.location || "");
    setBio(profile.bio || "");
    setInstagramHandle(profile.instagram_handle || "");
    setServiceModes(profile.service_modes || []);
    setAvatarFile(null);
    setBannerFile(null);
    setMessage("");
    setIsEditing(false);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!profile) return;

    setSaving(true);
    setMessage("");

    const updates = {
      full_name: fullName,
      location,
      bio,
      instagram_handle: instagramHandle,
      service_modes: profile.role === "professional" ? serviceModes : null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            ...updates,
          }
        : prev
    );

    setMessage("Profile updated.");
    setIsEditing(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <div className="mx-auto max-w-5xl py-16">
          <p className="text-neutral-500">Loading account...</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <div className="mx-auto max-w-5xl py-16">
          <p className="text-red-600">Could not load profile.</p>
        </div>
      </main>
    );
  }

  const isProfessional = profile.role === "professional";

  return (
    <>
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            LineUp
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
            >
              Back to site
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl py-10">
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
                      alt={profile.full_name || "Profile"}
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
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                    {profile.full_name || "No name yet"}
                  </h1>

                  <p className="mt-3 text-lg text-neutral-600">
                    {isProfessional
                      ? formatProfessionalType(profile.professional_type)
                      : "Customer"}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {profile.location ? (
                      <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                        {profile.location}
                      </span>
                    ) : null}

                    {isProfessional && formatServiceModes(profile.service_modes) ? (
                      <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                        {formatServiceModes(profile.service_modes)}
                      </span>
                    ) : null}

                    {isProfessional ? (
                      <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                        {averageRating
                          ? `${averageRating} / 5 · ${reviews.length} review${
                              reviews.length === 1 ? "" : "s"
                            }`
                          : "No reviews yet"}
                      </span>
                    ) : null}
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMessage("");
                      setIsEditing(true);
                    }}
                    className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Edit profile
                  </button>
                ) : (
                  <span className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-500">
                    Editing profile
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              {!isEditing ? (
                <>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      About
                    </p>
                    <p className="mt-4 max-w-3xl text-lg leading-8 text-neutral-600">
                      {profile.bio?.trim() || "No bio added yet."}
                    </p>
                  </div>

                  {profile.instagram_handle ? (
                    <div className="mt-8">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Instagram
                      </p>
                      <a
                        href={`https://instagram.com/${String(
                          profile.instagram_handle
                        ).replace("@", "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                      >
                        @{String(profile.instagram_handle).replace("@", "")}
                      </a>
                    </div>
                  ) : null}

                  <div className="mt-8">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Email
                    </p>
                    <p className="mt-3 text-neutral-700">{profile.email}</p>
                  </div>

                  {message ? (
                    <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                      {message}
                    </div>
                  ) : null}
                </>
              ) : (
                <form id="account-edit-form" onSubmit={handleSave} className="space-y-6">
                  <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Cover photo
                    </p>

                    <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-neutral-100">
                      <div className="h-40 w-full">
                        {profile.banner_url ? (
                          <img
                            src={profile.banner_url}
                            alt="Banner"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                            No banner
                          </div>
                        )}
                      </div>
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                      className="mt-4 block w-full text-sm text-neutral-600 file:mr-4 file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                    />

                    <button
                      type="button"
                      onClick={handleBannerUpload}
                      disabled={!bannerFile || bannerUploading}
                      className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bannerUploading ? "Uploading..." : "Upload cover photo"}
                    </button>
                  </div>

                  <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Profile photo
                    </p>

                    <div className="mt-4 flex items-center gap-4">
                      <div className="h-24 w-24 overflow-hidden rounded-full border border-neutral-200 bg-white">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt="Profile"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                            No photo
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="block w-full text-sm text-neutral-600 file:mr-4 file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                        />
                        <button
                          type="button"
                          onClick={handleAvatarUpload}
                          disabled={!avatarFile || avatarUploading}
                          className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {avatarUploading ? "Uploading..." : "Upload profile photo"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-700">
                      Full name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-700">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Winnipeg, MB"
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                    />
                  </div>

                  {isProfessional ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-700">
                          Bio
                        </label>
                        <textarea
                          rows={5}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell clients a bit about your work..."
                          className="w-full resize-none rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-700">
                          Instagram handle
                        </label>
                        <input
                          type="text"
                          value={instagramHandle}
                          onChange={(e) => setInstagramHandle(e.target.value)}
                          placeholder="@yourhandle"
                          className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-700">
                          Service modes
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {modeOptions.map((mode) => {
                            const selected = serviceModes.includes(mode);

                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => toggleServiceMode(mode)}
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
                    </>
                  ) : null}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save changes"}
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>

                  {message ? (
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                      {message}
                    </div>
                  ) : null}
                </form>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Account snapshot
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Account type
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-neutral-900">
                      {isProfessional ? "Professional" : "Customer"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Category
                    </p>
                    <p className="mt-2 text-base font-semibold text-neutral-900">
                      {isProfessional
                        ? formatProfessionalType(profile.professional_type)
                        : "Customer"}
                    </p>
                  </div>

                  {isProfessional ? (
                    <>
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

                      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Portfolio items
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-neutral-900">
                          {portfolioItems.length}
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {isProfessional ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Portfolio
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    Past work
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setShowUpload(true)}
                  className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Add work
                </button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setShowUpload(true)}
                  className="flex aspect-square items-center justify-center rounded-[1.5rem] border-2 border-dashed border-neutral-300 bg-white text-sm font-medium text-neutral-500 transition hover:bg-neutral-50"
                >
                  + Add work
                </button>

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

                    <div className="p-4">
                      {item.caption ? (
                        <p className="text-sm text-neutral-700">{item.caption}</p>
                      ) : (
                        <p className="text-sm text-neutral-400">No caption</p>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeletePortfolioItem(item.id)}
                        className="mt-3 text-sm font-medium text-red-600 transition hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {portfolioItems.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600 sm:col-span-2 lg:col-span-2">
                    No portfolio items yet.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {isProfessional ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Reviews
                  </p>

                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    Client feedback
                  </h2>
                </div>

                {reviews.length > 0 ? (
                  <div className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                    {reviews.length} review{reviews.length === 1 ? "" : "s"}
                  </div>
                ) : null}
              </div>

              {reviews.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No reviews yet.
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-4">
                    {(showAllReviews ? reviews : reviews.slice(0, 2)).map((review) => (
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
                                {new Date(review.created_at).toLocaleDateString("en-CA", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="text-sm font-medium text-neutral-900">
                            {"★".repeat(Math.max(1, Math.min(5, Number(review.rating || 0))))}
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

                  {reviews.length > 2 ? (
                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={() => setShowAllReviews((prev) => !prev)}
                        className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                      >
                        {showAllReviews ? "Show less" : `View all ${reviews.length} reviews`}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-neutral-900">
              Add portfolio work
            </h3>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="mt-4 w-full text-sm text-neutral-700"
            />

            <textarea
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              placeholder="Caption (optional)"
              rows={3}
              className="mt-4 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
            />

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handlePortfolioUpload}
                disabled={portfolioUploading || !uploadFile}
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {portfolioUploading ? "Uploading..." : "Upload"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setUploadFile(null);
                  setUploadCaption("");
                }}
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

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