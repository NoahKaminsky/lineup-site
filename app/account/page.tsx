"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../components/AppNavbar";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  professional_type: string | null;
  professional_types?: string[] | null;
  location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  specialties: string[] | null;
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

type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "completion_requested"
  | "completed";

type BookingRow = {
  id: string;
  professional_id: string;
  customer_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  created_at: string;
  service_id: string | null;
  service_name: string | null;
  duration_minutes: number | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  completion_requested_at?: string | null;
  completed_at?: string | null;
};

type EnrichedBooking = BookingRow & {
  customer_name: string | null;
  customer_avatar_url: string | null;
};

type CompletedRequestRow = {
  id: string;
  client_id: string | null;
  accepted_professional_id: string | null;
  title: string | null;
  service_detail: string | null;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
};

type CompletedServiceItem = {
  id: string;
  source: "booking" | "request";
  title: string;
  subtitle: string;
  completed_at: string | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
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
];

const professionalTypeLabelMap = new Map(
  professionalTypeOptions.map((option) => [option.value, option.label])
);


function normalizeProfessionalType(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(" ", "_");
}

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [bookingActionLoadingId, setBookingActionLoadingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showBannerPreview, setShowBannerPreview] = useState(false);

  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [reviews, setReviews] = useState<EnrichedReview[]>([]);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [completedServices, setCompletedServices] = useState<CompletedServiceItem[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");

  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [professionalTypes, setProfessionalTypes] = useState<string[]>([]);
  const [newSpecialty, setNewSpecialty] = useState("");

  const isProfessional = profile?.role === "professional";

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
      setSpecialties(data.specialties || []);
      setProfessionalTypes(
        Array.isArray(data.professional_types) && data.professional_types.length > 0
          ? data.professional_types
          : data.professional_type
          ? [data.professional_type]
          : []
      );

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

      if (data.role === "professional") {
        const today = new Date();
        const year = today.getFullYear();
        const month = `${today.getMonth() + 1}`.padStart(2, "0");
        const day = `${today.getDate()}`.padStart(2, "0");
        const todayString = `${year}-${month}-${day}`;

        const { data: activeBookingsData, error: bookingsError } = await supabase
          .from("bookings")
          .select(
            "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at"
          )
          .eq("professional_id", user.id)
          .in("status", ["confirmed", "completion_requested"])
          .gte("booking_date", todayString)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });

        if (!bookingsError && activeBookingsData) {
          const customerIds = [
            ...new Set(activeBookingsData.map((booking) => booking.customer_id).filter(Boolean)),
          ];

          let customerMap = new Map<
            string,
            { full_name: string | null; avatar_url: string | null }
          >();

          if (customerIds.length > 0) {
            const { data: customerProfiles } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", customerIds);

            if (customerProfiles) {
              customerMap = new Map(
                customerProfiles.map((customer) => [
                  customer.id,
                  {
                    full_name: customer.full_name ?? null,
                    avatar_url: customer.avatar_url ?? null,
                  },
                ])
              );
            }
          }

          const enrichedBookings: EnrichedBooking[] = activeBookingsData.map((booking) => {
            const customer = customerMap.get(booking.customer_id);

            return {
              ...(booking as BookingRow),
              start_time: String(booking.start_time).slice(0, 5),
              end_time: String(booking.end_time).slice(0, 5),
              customer_name: customer?.full_name ?? null,
              customer_avatar_url: customer?.avatar_url ?? null,
            };
          });

          setBookings(enrichedBookings);
        } else {
          setBookings([]);
        }

        const { data: completedBookingsData } = await supabase
          .from("bookings")
          .select(
            "id, professional_id, customer_id, booking_date, start_time, end_time, status, created_at, service_id, service_name, duration_minutes, cancelled_by, cancelled_at, completion_requested_at, completed_at"
          )
          .eq("professional_id", user.id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false });

        const { data: completedRequestsData } = await supabase
          .from("service_requests")
          .select(
            "id, client_id, accepted_professional_id, title, service_detail, status, created_at, completed_at"
          )
          .eq("accepted_professional_id", user.id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false });

        const completedCustomerIds = [
          ...new Set([
            ...(completedBookingsData?.map((item) => item.customer_id).filter(Boolean) || []),
            ...(completedRequestsData?.map((item) => item.client_id).filter(Boolean) || []),
          ]),
        ];

        let completedCustomerMap = new Map<
          string,
          { full_name: string | null; avatar_url: string | null }
        >();

        if (completedCustomerIds.length > 0) {
          const { data: completedCustomerProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", completedCustomerIds);

          if (completedCustomerProfiles) {
            completedCustomerMap = new Map(
              completedCustomerProfiles.map((customer) => [
                customer.id,
                {
                  full_name: customer.full_name ?? null,
                  avatar_url: customer.avatar_url ?? null,
                },
              ])
            );
          }
        }

        const bookingCompletedItems: CompletedServiceItem[] = (completedBookingsData || []).map(
          (booking) => {
            const customer = completedCustomerMap.get(booking.customer_id);

            return {
              id: booking.id,
              source: "booking",
              title: booking.service_name || "Booked service",
              subtitle: `${formatBookingDate(booking.booking_date)} • ${formatTime(
                String(booking.start_time).slice(0, 5)
              )} - ${formatTime(String(booking.end_time).slice(0, 5))}`,
              completed_at: booking.completed_at || booking.created_at || null,
              customer_name: customer?.full_name ?? null,
              customer_avatar_url: customer?.avatar_url ?? null,
            };
          }
        );

        const requestCompletedItems: CompletedServiceItem[] = (
          (completedRequestsData || []) as CompletedRequestRow[]
        ).map((request) => {
          const customer = request.client_id
            ? completedCustomerMap.get(request.client_id)
            : undefined;

          return {
            id: request.id,
            source: "request",
            title: request.title || request.service_detail || "Requested service",
            subtitle: "Completed through request flow",
            completed_at: request.completed_at || request.created_at || null,
            customer_name: customer?.full_name ?? null,
            customer_avatar_url: customer?.avatar_url ?? null,
          };
        });

        const mergedCompleted = [...bookingCompletedItems, ...requestCompletedItems].sort(
          (a, b) =>
            new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
        );

        setCompletedServices(mergedCompleted);
      } else {
        setBookings([]);
        setCompletedServices([]);
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

  function formatTime(time: string) {
    const [hourString, minute] = time.split(":");
    const hour = Number(hourString);
    const suffix = hour >= 12 ? "PM" : "AM";
    const twelveHour = hour % 12 || 12;
    return `${twelveHour}:${minute} ${suffix}`;
  }

  function formatBookingDate(dateString: string) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString("en-CA", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  function formatCompletedDate(dateString: string | null) {
    if (!dateString) return "Completed";
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getBookingStatusLabel(status: BookingStatus) {
    if (status === "completion_requested") return "completion requested";
    return status;
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

      setProfile((prev) => (prev ? { ...prev, banner_url: publicUrl } : prev));
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

  async function handleCancelBooking(bookingId: string) {
    if (!profile) return;
    if (!confirm("Cancel this booking?")) return;

    try {
      setBookingActionLoadingId(bookingId);
      setMessage("");

      const { error } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_by: profile.id,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .eq("professional_id", profile.id)
        .in("status", ["confirmed", "completion_requested"]);

      if (error) {
        setMessage(error.message);
        return;
      }

      setBookings((prev) => prev.filter((booking) => booking.id !== bookingId));
      setMessage("Booking cancelled.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong cancelling this booking.");
    } finally {
      setBookingActionLoadingId(null);
    }
  }

  async function handleRequestCompletion(bookingId: string) {
    if (!profile) return;

    try {
      setBookingActionLoadingId(bookingId);
      setMessage("");

      const { error } = await supabase
        .from("bookings")
        .update({
          status: "completion_requested",
          completion_requested_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .eq("professional_id", profile.id)
        .eq("status", "confirmed");

      if (error) {
        setMessage(error.message);
        return;
      }

      setBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? { ...booking, status: "completion_requested" }
            : booking
        )
      );

      setMessage("Completion requested. Waiting for customer confirmation.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong requesting completion.");
    } finally {
      setBookingActionLoadingId(null);
    }
  }

  function handleCancelEdit() {
    if (!profile) return;

    setFullName(profile.full_name || "");
    setLocation(profile.location || "");
    setBio(profile.bio || "");
    setInstagramHandle(profile.instagram_handle || "");
    setSpecialties(profile.specialties || []);
    setProfessionalTypes(getProfessionalTypes(profile));
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
      specialties: profile.role === "professional" ? specialties : [],
      professional_types:
        profile.role === "professional" ? cleanProfessionalTypes : [],
      professional_type:
        profile.role === "professional"
          ? cleanProfessionalTypes[0] || profile.professional_type || null
          : null,
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

  return (
    <>
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <Navbar />

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
                          Active bookings
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-neutral-900">
                          {bookings.length}
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

                      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Completed services
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-neutral-900">
                          {completedServices.length}
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

          {isProfessional ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Active bookings
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    Current schedule
                  </h2>
                </div>
              </div>

              {bookings.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No active bookings right now.
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {bookings.map((booking) => {
                    const isLoadingAction = bookingActionLoadingId === booking.id;

                    return (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 flex-1 gap-4">
                            <div className="h-14 w-14 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                              {booking.customer_avatar_url ? (
                                <img
                                  src={booking.customer_avatar_url}
                                  alt={booking.customer_name || "Customer"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                                  {booking.customer_name?.charAt(0).toUpperCase() || "C"}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                                  {getBookingStatusLabel(booking.status)}
                                </span>
                              </div>

                              <h3 className="mt-3 text-xl font-semibold text-neutral-900">
                                {booking.service_name || "Booked service"}
                              </h3>

                              <p className="mt-2 text-neutral-600">
                                {formatBookingDate(booking.booking_date)} •{" "}
                                {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                              </p>

                              <p className="mt-2 text-neutral-600">
                                Client: {booking.customer_name || "Unknown client"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          {booking.status === "confirmed" ? (
                            <button
                              type="button"
                              onClick={() => handleRequestCompletion(booking.id)}
                              disabled={isLoadingAction}
                              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                            >
                              {isLoadingAction ? "Working..." : "Request completion"}
                            </button>
                          ) : null}

                          {(booking.status === "confirmed" ||
                            booking.status === "completion_requested") ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(booking.id)}
                              disabled={isLoadingAction}
                              className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                            >
                              {isLoadingAction ? "Working..." : "Cancel booking"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {isProfessional ? (
            <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                    Completed services
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    Recent work
                  </h2>
                </div>
              </div>

              {completedServices.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
                  No completed services yet.
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {completedServices.map((item) => (
                    <div
                      key={`${item.source}-${item.id}`}
                      className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                          {item.customer_avatar_url ? (
                            <img
                              src={item.customer_avatar_url}
                              alt={item.customer_name || "Customer"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                              {item.customer_name?.charAt(0).toUpperCase() || "C"}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                              {item.source}
                            </span>

                            <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                              Completed
                            </span>
                          </div>

                          <h3 className="mt-3 text-lg font-semibold text-neutral-900">
                            {item.title}
                          </h3>

                          <p className="mt-2 text-sm text-neutral-600">
                            {item.subtitle}
                          </p>

                          <p className="mt-2 text-sm text-neutral-600">
                            {item.customer_name || "Unknown client"}
                          </p>

                          <p className="mt-2 text-sm text-neutral-500">
                            {formatCompletedDate(item.completed_at)}
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