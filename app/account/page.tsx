"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";

function normalizeRole(role: string | null | undefined) {
  return role?.toLowerCase().trim() || "";
}

function isProfessionalRole(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);
  return !normalizedRole.includes("customer") && !!normalizedRole;
}

type Profile = {
  id: string;
  email: string | null;
  email_request_notifications?: boolean | null;
  email_offer_notifications?: boolean | null;
  full_name: string | null;
  role: string | null;
  professional_type: string | null;
  professional_types?: string[] | null;
  location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  business_name?: string | null;
  specialties: string[] | null;
  stripe_account_id?: string | null;
  stripe_onboarding_complete?: boolean | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
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

const suggestedSpecialtiesByType: Record<string, string[]> = {
  barber: ["Fades", "Beard work", "Line ups", "Scissor cuts", "Mobile cuts"],
  hairstylist: ["Blonding", "Color", "Curly cuts", "Extensions", "Blowouts"],
  nail_tech: ["Gel sets", "Acrylics", "Nail art", "Russian manicures", "Pedicures"],
  lash_artist: ["Classic lashes", "Hybrid lashes", "Volume lashes", "Lash lifts"],
  brow_artist: ["Brow shaping", "Brow tint", "Lamination", "Ombre brows"],
  esthetician: ["Facials", "Sugaring", "Waxing", "Skin treatments", "Teeth whitening"],
  makeup_artist: ["Soft glam", "Bridal", "Event glam", "Editorial makeup"],
};
const professionalTypeOptions = [
  { value: "barber", label: "Barber" },
  { value: "hairstylist", label: "Hairstylist" },
  { value: "nail_artist", label: "Nail Artist" },
  { value: "lash_artist", label: "Lash Artist" },
  { value: "brow_artist", label: "Brow Artist" },
  { value: "makeup_artist", label: "Makeup Artist" },
  { value: "wax_technician", label: "Wax Technician" },
  { value: "body_sugaring", label: "Body Sugaring" },
];

const professionalTypeLabelMap = new Map(
  professionalTypeOptions.map((option) => [option.value, option.label])
);


function normalizeProfessionalType(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(" ", "_");
}

type AccountCache = {
  profile: Profile;
  portfolioItems: PortfolioItem[];
  reviews: EnrichedReview[];
};

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<AccountCache>("account-page"));
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeRequirementsDue, setStripeRequirementsDue] = useState<string[]>([]);
  const [stripeStatusError, setStripeStatusError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showBannerPreview, setShowBannerPreview] = useState(false);

  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(() => getCached<AccountCache>("account-page")?.profile ?? null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(() => getCached<AccountCache>("account-page")?.portfolioItems ?? []);
  const [reviews, setReviews] = useState<EnrichedReview[]>(() => getCached<AccountCache>("account-page")?.reviews ?? []);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");

  const [fullName, setFullName] = useState(() => getCached<AccountCache>("account-page")?.profile?.full_name ?? "");
  const [location, setLocation] = useState(() => getCached<AccountCache>("account-page")?.profile?.location ?? "");
  const [bio, setBio] = useState(() => getCached<AccountCache>("account-page")?.profile?.bio ?? "");
  const [instagramHandle, setInstagramHandle] = useState(() => getCached<AccountCache>("account-page")?.profile?.instagram_handle ?? "");
  const [businessName, setBusinessName] = useState(() => getCached<AccountCache>("account-page")?.profile?.business_name ?? "");
  const [specialties, setSpecialties] = useState<string[]>(() => getCached<AccountCache>("account-page")?.profile?.specialties ?? []);
  const [professionalTypes, setProfessionalTypes] = useState<string[]>(() => {
    const cached = getCached<AccountCache>("account-page")?.profile;
    if (!cached) return [];
    return Array.isArray(cached.professional_types) && cached.professional_types.length > 0
      ? cached.professional_types
      : cached.professional_type ? [cached.professional_type] : [];
  });
  const [newSpecialty, setNewSpecialty] = useState("");
  const [emailRequestNotifications, setEmailRequestNotifications] = useState(() => getCached<AccountCache>("account-page")?.profile?.email_request_notifications ?? true);
  const [emailOfferNotifications, setEmailOfferNotifications] = useState(() => getCached<AccountCache>("account-page")?.profile?.email_offer_notifications ?? true);

  const isProfessional = isProfessionalRole(profile?.role);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && profile) {
      setCached<AccountCache>("account-page", { profile, portfolioItems, reviews });
    }
  }, [loading, profile, portfolioItems, reviews]);

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
        .select("id, email, full_name, role, professional_type, professional_types, location, avatar_url, banner_url, bio, instagram_handle, business_name, specialties, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, subscription_status, subscription_plan, email_request_notifications, email_offer_notifications")
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
      setBusinessName(data.business_name || "");
      setSpecialties(data.specialties || []);
      setProfessionalTypes(
        Array.isArray(data.professional_types) && data.professional_types.length > 0
          ? data.professional_types
          : data.professional_type
          ? [data.professional_type]
          : []
      );
      setEmailRequestNotifications(data.email_request_notifications ?? true);
      setEmailOfferNotifications(data.email_offer_notifications ?? true);

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

  useEffect(() => {
    if (!profile || profile.role !== "professional") return;
    refreshStripeAccountStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const suggestedSpecialties = useMemo(() => {
    const keys = professionalTypes.length
      ? professionalTypes.map((type) => normalizeProfessionalType(type))
      : [normalizeProfessionalType(profile?.professional_type)];

    return Array.from(
      new Set(keys.flatMap((key) => suggestedSpecialtiesByType[key] || []))
    );
  }, [professionalTypes, profile?.professional_type]);

  const visibleReviews = useMemo(() => {
    return showAllReviews ? reviews : reviews.slice(0, 3);
  }, [reviews, showAllReviews]);

  function addSpecialty(value: string) {
    const cleanValue = value.trim();
    if (!cleanValue) return;

    setSpecialties((prev) => {
      const exists = prev.some(
        (specialty) => specialty.toLowerCase() === cleanValue.toLowerCase()
      );
      if (exists) return prev;
      return [...prev, cleanValue];
    });

    setNewSpecialty("");
  }

  function removeSpecialty(value: string) {
    setSpecialties((prev) => prev.filter((specialty) => specialty !== value));
  }

  function toggleProfessionalType(value: string) {
    setProfessionalTypes((prev) =>
      prev.includes(value)
        ? prev.filter((type) => type !== value)
        : [...prev, value]
    );
  }

  function getProfessionalTypes(profileValue?: Profile | null) {
    if (!profileValue) return [];

    if (
      Array.isArray(profileValue.professional_types) &&
      profileValue.professional_types.length > 0
    ) {
      return profileValue.professional_types;
    }

    return profileValue.professional_type ? [profileValue.professional_type] : [];
  }

  function formatProfessionalTypes(values: string[]) {
    if (!values.length) return "Professional";
    return values
      .map((value) => professionalTypeLabelMap.get(value) || formatProfessionalType(value))
      .join(" • ");
  }

  function formatProfessionalType(value: string | null) {
    if (!value) return "Customer";
    return value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setAvatarFile(file);
    handleAvatarUpload(file);
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setBannerFile(file);
    handleBannerUpload(file);
  }

  async function handleAvatarUpload(fileOverride?: File) {
    const file = fileOverride ?? avatarFile;

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

      if (!file) {
        setMessage("Please choose an image first.");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        setMessage(updateError.message);
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setAvatarFile(null);
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong uploading your photo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleBannerUpload(fileOverride?: File) {
    const file = fileOverride ?? bannerFile;

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

      if (!file) {
        setMessage("Please choose an image first.");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/banner-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-banners")
        .upload(filePath, file, {
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

      setProfile((prev) => (prev ? { ...prev, banner_url: publicUrl } : prev));
      setBannerFile(null);
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

  async function refreshStripeAccountStatus() {
    if (!profile || profile.role !== "professional") return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch("/api/stripe/connect/account-status", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Stripe status check failed:", data?.error);
        setStripeStatusError(
          data?.error || "Could not check your Stripe status. Try refreshing this page."
        );
        return;
      }

      setStripeStatusError("");
      setStripeRequirementsDue(Array.isArray(data.requirementsDue) ? data.requirementsDue : []);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              stripe_account_id: data.stripeAccountId ?? prev.stripe_account_id ?? null,
              stripe_onboarding_complete: data.onboardingComplete ?? false,
              stripe_charges_enabled: data.chargesEnabled ?? false,
              stripe_payouts_enabled: data.payoutsEnabled ?? false,
            }
          : prev
      );
    } catch (error) {
      console.error("Stripe status check failed:", error);
      setStripeStatusError("Could not check your Stripe status. Try refreshing this page.");
    }
  }

  function formatStripeRequirement(requirement: string) {
    return requirement
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function handleConnectStripePayouts() {
    if (!profile || profile.role !== "professional") return;

    try {
      setStripeLoading(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please log out and log back in before connecting payouts.");
        return;
      }

      // Already fully onboarded — send them to Stripe's real account
      // management dashboard instead of back through first-time onboarding.
      if (profile.stripe_payouts_enabled) {
        const dashboardResponse = await fetch("/api/stripe/connect/dashboard-link", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const dashboardData = await dashboardResponse.json();

        if (!dashboardResponse.ok) {
          throw new Error(dashboardData?.error || "Could not open Stripe dashboard.");
        }

        if (!dashboardData?.url) {
          throw new Error("Stripe did not return a dashboard link.");
        }

        window.location.href = dashboardData.url;
        return;
      }

      const createAccountResponse = await fetch("/api/stripe/connect/create-account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const createAccountData = await createAccountResponse.json();

      if (!createAccountResponse.ok) {
        throw new Error(createAccountData?.error || "Could not create Stripe account.");
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              stripe_account_id: createAccountData.stripeAccountId ?? prev.stripe_account_id,
            }
          : prev
      );

      const onboardingResponse = await fetch("/api/stripe/connect/onboarding-link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const onboardingData = await onboardingResponse.json();

      if (!onboardingResponse.ok) {
        throw new Error(onboardingData?.error || "Could not start Stripe onboarding.");
      }

      if (!onboardingData?.url) {
        throw new Error("Stripe did not return an onboarding link.");
      }

      window.location.href = onboardingData.url;
    } catch (error: any) {
      setMessage(error?.message || "Something went wrong connecting Stripe payouts.");
    } finally {
      setStripeLoading(false);
    }
  }

  function handleCancelEdit() {
    if (!profile) return;

    setFullName(profile.full_name || "");
    setLocation(profile.location || "");
    setBio(profile.bio || "");
    setInstagramHandle(profile.instagram_handle || "");
    setBusinessName(profile.business_name || "");
    setSpecialties(profile.specialties || []);
    setProfessionalTypes(getProfessionalTypes(profile));
    setEmailRequestNotifications(profile.email_request_notifications ?? true);
    setEmailOfferNotifications(profile.email_offer_notifications ?? true);
    setAvatarFile(null);
    setBannerFile(null);
    setNewSpecialty("");
    setMessage("");
    setIsEditing(false);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!profile) return;

    setSaving(true);
    setMessage("");

    const cleanProfessionalTypes = Array.from(new Set(professionalTypes));

    const updates = {
      full_name: fullName,
      location,
      bio,
      instagram_handle: instagramHandle,
      business_name: profile.role === "professional" ? (businessName.trim() || null) : null,
      specialties: profile.role === "professional" ? specialties : [],
      professional_types:
        profile.role === "professional" ? cleanProfessionalTypes : [],
      professional_type:
        profile.role === "professional"
          ? cleanProfessionalTypes[0] || profile.professional_type || null
          : null,
      email_request_notifications:
        profile.role === "professional" ? emailRequestNotifications : false,
      email_offer_notifications:
        profile.role === "professional" ? false : emailOfferNotifications,
    };

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", profile.id);

    if (error) {
      setSaving(false);
      setMessage(error.message);
      return;
    }

    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    setSaving(false);
    setMessage("Profile updated.");
    setIsEditing(false);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/delete-account", {
        method: "DELETE",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || "Something went wrong. Please try again.");
        setDeleting(false);
        return;
      }

      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setMessage("Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


        <div className="mx-auto max-w-6xl py-8">
          <div className="max-w-3xl">
            <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-neutral-200 md:h-16" />
            <div className="mt-5 h-5 w-full max-w-2xl animate-pulse rounded-full bg-neutral-100" />
            <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          </div>

          <div className="mt-8 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="h-56 w-full animate-pulse bg-neutral-100 md:h-72" />

            <div className="relative px-6 pb-6 pt-20 md:px-8 md:pt-24">
              <div className="absolute -top-16 left-6 h-32 w-32 animate-pulse rounded-full border-4 border-white bg-neutral-100 shadow md:left-8 md:h-40 md:w-40" />

              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="h-12 w-72 animate-pulse rounded-2xl bg-neutral-200" />
                  <div className="mt-4 h-5 w-52 animate-pulse rounded-full bg-neutral-100" />

                  <div className="mt-5 flex flex-wrap gap-3">
                    <div className="h-9 w-28 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-9 w-36 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-9 w-24 animate-pulse rounded-full bg-neutral-100" />
                  </div>
                </div>

                <div className="h-11 w-28 animate-pulse rounded-full bg-neutral-100" />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
                    <div className="min-w-0 flex-1">
                      <div className="flex gap-2">
                        <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-100" />
                        <div className="h-6 w-28 animate-pulse rounded-full bg-neutral-100" />
                      </div>
                      <div className="mt-4 h-7 w-2/3 animate-pulse rounded-xl bg-neutral-200" />
                      <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-neutral-100" />
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 md:w-52">
                    <div className="h-10 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-10 animate-pulse rounded-full bg-neutral-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
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

  return (
    <>
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">


        <div className="mx-auto max-w-6xl py-10">
          <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="relative">
              {/* Banner — click to change */}
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="group relative block w-full"
                aria-label="Change cover photo"
              >
                <div className="h-56 w-full overflow-hidden rounded-t-[2rem] bg-neutral-100 md:h-72">
                  {profile.banner_url ? (
                    <img
                      src={profile.banner_url}
                      alt="Cover photo"
                      className="h-full w-full object-cover transition group-hover:brightness-90"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                      No cover photo
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-t-[2rem] opacity-0 transition group-hover:opacity-100 group-active:opacity-100">
                  <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                    {bannerUploading ? "Uploading..." : "Change cover photo"}
                  </span>
                </div>
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerChange}
              />

              {/* Avatar — click to change */}
              <div className="absolute -bottom-16 left-6 md:left-8">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change profile photo"
                  className="group relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow md:h-40 md:w-40"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || "Profile"}
                      className="h-full w-full object-cover transition group-hover:brightness-75"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-neutral-500">
                      {profile.full_name?.charAt(0).toUpperCase() || "P"}
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100 group-active:opacity-100">
                    {avatarUploading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.8"/>
                      </svg>
                    )}
                  </div>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
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
                      ? formatProfessionalTypes(getProfessionalTypes(profile))
                      : "Customer"}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {profile.location ? (
                      <span className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700">
                        {profile.location}
                      </span>
                    ) : null}

                    {isProfessional && specialties.length > 0
                      ? specialties.map((specialty) => (
                          <span
                            key={specialty}
                            className="rounded-full bg-neutral-100 px-4 py-2 text-sm text-neutral-700"
                          >
                            {specialty}
                          </span>
                        ))
                      : null}

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

{isProfessional ? (
              <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Stripe payouts
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                      Get paid through LineUp
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">
                      Connect Stripe so customer payments can be paid out to your bank account after bookings.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Account status
                      </p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">
                        {profile.stripe_payouts_enabled
                          ? "Payouts enabled"
                          : profile.stripe_account_id
                          ? "Onboarding incomplete"
                          : "Not connected"}
                      </p>
                      {!profile.stripe_payouts_enabled && stripeRequirementsDue.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-neutral-500">
                          Stripe is still waiting on: {stripeRequirementsDue.map(formatStripeRequirement).join(", ")}.
                        </p>
                      ) : null}
                      {!profile.stripe_payouts_enabled && stripeStatusError ? (
                        <p className="mt-2 text-xs leading-5 text-red-600">
                          Couldn&apos;t confirm your Stripe status: {stripeStatusError}
                        </p>
                      ) : null}
                    </div>

                    {profile.stripe_account_id ? (
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Stripe account
                        </p>
                        <p className="mt-2 break-all text-sm font-medium text-neutral-700">
                          {profile.stripe_account_id}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectStripePayouts}
                    disabled={stripeLoading}
                    className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {stripeLoading
                      ? "Opening Stripe..."
                      : profile.stripe_payouts_enabled
                      ? "Manage Stripe payouts"
                      : profile.stripe_account_id
                      ? "Finish Stripe onboarding"
                      : "Connect Stripe payouts"}
                  </button>

                  <p className="text-xs leading-5 text-neutral-500">
                    Stripe handles bank details, identity verification, and payout setup securely.
                  </p>
                </div>
              </div>
            ) : null}

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

                  {isProfessional && profile.business_name?.trim() ? (
                    <div className="mt-8">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Shop / studio
                      </p>
                      <p className="mt-3 text-base font-semibold text-neutral-900">
                        {profile.business_name}
                      </p>
                    </div>
                  ) : null}

                  {isProfessional ? (
                    <div className="mt-8">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Specialties
                      </p>

                      {specialties.length === 0 ? (
                        <p className="mt-3 text-neutral-400">No specialties added yet.</p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {specialties.map((specialty) => (
                            <span
                              key={specialty}
                              className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
                            >
                              {specialty}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {profile.instagram_handle ? (
                    <div className="mt-8">
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Instagram
                      </p>
                      <a
                        href={`https://instagram.com/${String(profile.instagram_handle).replace(
                          "@",
                          ""
                        )}`}
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

                  <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Email notifications
                    </p>
                    <p className="mt-3 text-neutral-700">
                      {isProfessional
                        ? profile.email_request_notifications === false
                          ? "New matching request emails are off."
                          : "New matching request emails are on."
                        : profile.email_offer_notifications === false
                        ? "New offer emails are off."
                        : "New offer emails are on."}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500">
                      Booking confirmations and appointment reminders are always sent.
                    </p>
                  </div>

                  {message ? (
                    <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                      {message}
                    </div>
                  ) : null}
                </>
              ) : (
                <form id="account-edit-form" onSubmit={handleSave} className="space-y-6">
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

                  {isProfessional ? (
                    <>
                      <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
                        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                          Professional categories
                        </p>
                        <p className="mt-2 text-sm text-neutral-500">
                          Select every service category you offer. These help clients find you.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {professionalTypeOptions.map((option) => {
                            const selected = professionalTypes.includes(option.value);

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleProfessionalType(option.value)}
                                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                                  selected
                                    ? "border-neutral-900 bg-neutral-900 text-white"
                                    : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-700">
                          Shop or studio name <span className="text-neutral-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="e.g. Fade District Barbershop"
                          className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                        />
                        <p className="mt-2 text-xs text-neutral-500">
                          If you work out of a shop or studio, this shows alongside your location on your public profile.
                        </p>
                      </div>

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

                      <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
                        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                          Specialties
                        </p>

                        <div className="mt-4 flex flex-wrap gap-3">
                          {specialties.map((specialty) => (
                            <div
                              key={specialty}
                              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700"
                            >
                              <span>{specialty}</span>
                              <button
                                type="button"
                                onClick={() => removeSpecialty(specialty)}
                                className="text-neutral-400 transition hover:text-neutral-800"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <input
                            type="text"
                            value={newSpecialty}
                            onChange={(e) => setNewSpecialty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addSpecialty(newSpecialty);
                              }
                            }}
                            placeholder="Add a specialty"
                            className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                          />
                          <button
                            type="button"
                            onClick={() => addSpecialty(newSpecialty)}
                            className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                          >
                            Add
                          </button>
                        </div>

                        {suggestedSpecialties.length > 0 ? (
                          <div className="mt-5">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                              Suggested
                            </p>
                            <div className="mt-3 flex flex-wrap gap-3">
                              {suggestedSpecialties.map((specialty) => {
                                const selected = specialties.includes(specialty);

                                return (
                                  <button
                                    key={specialty}
                                    type="button"
                                    onClick={() =>
                                      selected
                                        ? removeSpecialty(specialty)
                                        : addSpecialty(specialty)
                                    }
                                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                      selected
                                        ? "border-neutral-900 bg-neutral-900 text-white"
                                        : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                                    }`}
                                  >
                                    {specialty}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Email notifications
                    </p>

                    {isProfessional ? (
                      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                        <input
                          type="checkbox"
                          checked={emailRequestNotifications}
                          onChange={(e) => setEmailRequestNotifications(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-black"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-neutral-900">
                            Email me when new matching requests are posted
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-neutral-500">
                            You can turn this off if request emails get too frequent. Booking confirmations and appointment reminders are always sent.
                          </span>
                        </span>
                      </label>
                    ) : (
                      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                        <input
                          type="checkbox"
                          checked={emailOfferNotifications}
                          onChange={(e) => setEmailOfferNotifications(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-black"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-neutral-900">
                            Email me when professionals send offers
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-neutral-500">
                            You can turn this off if offer emails get too frequent. Booking confirmations and appointment reminders are always sent.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>

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
                        ? formatProfessionalTypes(getProfessionalTypes(profile))
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

                      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Services page
                        </p>
                        <p className="mt-2 text-base font-semibold text-neutral-900">
                          Managed separately
                        </p>
                      </div>

                      <Link
                        href="/analytics"
                        className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Analytics
                        </p>
                        <p className="mt-2 text-base font-semibold text-neutral-900">
                          View history →
                        </p>
                      </Link>
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
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">Past work</h2>
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
                    className="group relative overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-neutral-100"
                  >
                    <img
                      src={item.image_url}
                      alt={item.caption || "Portfolio item"}
                      className="aspect-square h-full w-full object-cover"
                    />

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-4 text-white">
                      <p className="text-sm font-medium">
                        {item.caption?.trim() || "Untitled work"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeletePortfolioItem(item.id)}
                      className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-red-600 opacity-0 shadow transition group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {portfolioItems.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No portfolio work uploaded yet.
                </div>
              ) : null}
            </div>
          ) : null}

          {isProfessional ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Reviews
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    Client feedback
                  </h2>
                </div>

                {reviews.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllReviews((prev) => !prev)}
                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                  >
                    {showAllReviews ? "Show less" : "Show all reviews"}
                  </button>
                ) : null}
              </div>

              {reviews.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No reviews yet.
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {visibleReviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                          {review.reviewer_avatar_url ? (
                            <img
                              src={review.reviewer_avatar_url}
                              alt={review.reviewer_name || "Reviewer"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                              {review.reviewer_name?.charAt(0).toUpperCase() || "C"}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-4">
                            <p className="font-medium text-neutral-900">
                              {review.reviewer_name || "Client"}
                            </p>
                            <p className="text-sm text-neutral-500">
                              {new Date(review.created_at).toLocaleDateString("en-CA", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>

                          <p className="mt-2 text-sm text-neutral-600">
                            {"★".repeat(Number(review.rating || 0))}
                            {"☆".repeat(Math.max(0, 5 - Number(review.rating || 0)))}
                          </p>

                          <p className="mt-3 text-neutral-700">
                            {review.comment?.trim() || "No written comment."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

        </div>
      </main>

      {showUpload ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-6">
          <div className="w-full max-w-lg rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Portfolio
            </p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">
              Add work
            </h3>

            <div className="mt-6 space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-600 file:mr-4 file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
              />

              <textarea
                rows={4}
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="w-full resize-none rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePortfolioUpload}
                disabled={portfolioUploading}
                className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
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
                className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isProfessional ? (
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Pro feature
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">
                  Your shareable profile link
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Share your link with clients so they can view your services, portfolio, and book directly.
                </p>
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
            </div>

            {profile.subscription_status === "active" || profile.subscription_status === "trialing" ? (
              <div className="mt-5">
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <span className="flex-1 truncate text-sm text-neutral-700">
                    {typeof window !== "undefined" ? `${window.location.origin}/profile/${profile.id}` : `/profile/${profile.id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/profile/${profile.id}`;
                      navigator.clipboard.writeText(url).then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      });
                    }}
                    className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                  >
                    {linkCopied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7a4.5 4.5 0 00-9 0v3.5M5.25 10.5h13.5A1.5 1.5 0 0120.25 12v7.5A1.5 1.5 0 0118.75 21H5.25A1.5 1.5 0 013.75 19.5V12a1.5 1.5 0 011.5-1.5z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-neutral-700">Requires an active subscription</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-500">
                  Subscribe to LineUp to unlock your public profile and get discovered by new clients.
                </p>
                <a
                  href="/subscription"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  View plans
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-10 max-w-3xl">
        <div className="rounded-[2rem] border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-red-600">Danger zone</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Permanently deletes your account, profile, bookings, and all uploaded content. This cannot be undone.
          </p>

          {deleteConfirmOpen ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm font-medium text-neutral-900">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-red-400"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                  className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
                >
                  {deleting ? "Deleting..." : "Delete my account"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmOpen(false); setDeleteConfirmText(""); }}
                  disabled={deleting}
                  className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="mt-5 rounded-full border border-red-300 px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete account
            </button>
          )}
        </div>
      </div>

      {showBannerPreview && profile.banner_url ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-6"
          onClick={() => setShowBannerPreview(false)}
        >
          <div className="relative max-h-[90vh] max-w-6xl">
            <img
              src={profile.banner_url}
              alt="Banner preview"
              className="max-h-[90vh] w-auto rounded-3xl object-contain"
            />

            <button
              type="button"
              onClick={() => setShowBannerPreview(false)}
              className="absolute right-4 top-4 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-neutral-900 shadow"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}