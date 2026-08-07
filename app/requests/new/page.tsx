"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors, Hand, Eye, Pencil, Palette, Leaf, Droplet } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import TimeSelect from "../../components/TimeSelect";
const MAX_REFERENCE_PHOTOS = 5;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

const serviceDetailOptions: Record<string, string[]> = {
  haircut: [
    "Haircut",
    "Skin fade",
    "Taper / taper fade",
    "Buzz cut",
    "Beard trim",
    "Line up / shape up",
    "Kids cut",
    "Hot towel shave",
    "Blowout",
    "Color / highlights",
    "Balayage",
    "Updo / styling",
    "Hair extensions",
    "Deep conditioning treatment",
    "Other",
  ],
  nails: [
    "Manicure",
    "Pedicure",
    "Acrylic full set",
    "Acrylic fill",
    "Gel manicure",
    "Gel X / extensions",
    "Dip powder",
    "Nail art",
    "Nail repair",
    "Other",
  ],
  lashes: [
    "Classic set",
    "Hybrid set",
    "Volume set",
    "Mega volume set",
    "Fill",
    "Lash lift",
    "Lash tint",
    "Lash removal",
    "Other",
  ],
  brows: [
    "Brow shaping",
    "Brow wax",
    "Brow tint",
    "Brow lamination",
    "Threading",
    "Microblading",
    "Brow henna",
    "Other",
  ],
  makeup: [
    "Full face",
    "Soft glam",
    "Full glam",
    "Bridal makeup",
    "Event makeup",
    "Photoshoot makeup",
    "Makeup lesson",
    "Other",
  ],
  waxing: [
    "Brazilian wax",
    "Bikini wax",
    "Underarm wax",
    "Full leg wax",
    "Half leg wax",
    "Arm wax",
    "Full face wax",
    "Full body wax",
    "Other",
  ],
  body_sugaring: [
    "Brazilian sugaring",
    "Bikini sugaring",
    "Underarm sugaring",
    "Full leg sugaring",
    "Half leg sugaring",
    "Arm sugaring",
    "Full body sugaring",
    "Other",
  ],
};


function NewRequestLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


      <div className="mx-auto max-w-2xl py-8">
        <div className="max-w-xl">
          <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-5 h-12 w-full max-w-md animate-pulse rounded-2xl bg-neutral-200 md:h-14" />
          <div className="mt-5 h-5 w-full max-w-lg animate-pulse rounded-full bg-neutral-100" />
          <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="space-y-5">
            {[1, 2, 3, 4].map((item) => (
              <div key={item}>
                <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
                <div className="mt-2 h-12 w-full animate-pulse rounded-xl bg-neutral-100" />
              </div>
            ))}

            <div>
              <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-2 h-32 w-full animate-pulse rounded-xl bg-neutral-100" />
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="h-4 w-36 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
              </div>
              <div className="mt-4 h-4 w-4/5 animate-pulse rounded-full bg-neutral-100" />
            </div>

            <div>
              <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-2 h-32 w-full animate-pulse rounded-xl bg-neutral-100" />
            </div>

            <div className="h-12 w-full animate-pulse rounded bg-neutral-200" />
          </div>
        </div>
      </div>
    </main>
  );
}


type Suggestion = {
  placeId: string;
  text: string;
};

type SelectedLocation = {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  name?: string | null;
};

function LocationAutocomplete({
  label = "Location",
  placeholder = "Start typing an address...",
  value = "",
  onSelect,
  onInputChange,
}: {
  label?: string;
  placeholder?: string;
  value?: string;
  onSelect: (location: SelectedLocation) => void;
  onInputChange?: (value: string) => void;
}) {
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!input || input.length < 2) {
        setSuggestions([]);
        setLookupError("");
        return;
      }

      setLoading(true);

      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });

        const data = await res.json();

        if (!res.ok) {
          setSuggestions([]);
          setLookupError(data?.error || "Address lookup is temporarily unavailable.");
          return;
        }

        setLookupError("");
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
        setLookupError("Address lookup is temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [input]);

  async function handleSelect(suggestion: Suggestion) {
    setInput(suggestion.text);
    setSuggestions([]);

    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Place details route error:", data);
      }

      const rawLat =
        data.lat ??
        data.latitude ??
        data.location?.latitude ??
        data.location?.lat ??
        data.geometry?.location?.lat;

      const rawLng =
        data.lng ??
        data.longitude ??
        data.location?.longitude ??
        data.location?.lng ??
        data.geometry?.location?.lng;

      const lat = Number(rawLat);
      const lng = Number(rawLng);

      const formattedAddress =
        data.formattedAddress ??
        data.formatted_address ??
        data.address ??
        data.displayName?.text ??
        suggestion.text;

      const placeId = data.placeId ?? data.place_id ?? suggestion.placeId;

      if (!placeId) {
        onSelect({
          placeId: suggestion.placeId,
          formattedAddress: suggestion.text,
          lat: Number.NaN,
          lng: Number.NaN,
          name: data.name ?? null,
        });
        return;
      }

      setInput(formattedAddress);

      onSelect({
        placeId,
        formattedAddress,
        lat,
        lng,
        name: data.name ?? data.displayName?.text ?? null,
      });
    } catch {
      onSelect({
        placeId: suggestion.placeId,
        formattedAddress: suggestion.text,
        lat: Number.NaN,
        lng: Number.NaN,
        name: null,
      });
    }
  }

  return (
    <div className="relative w-full">
      <label className="mb-2 block text-sm font-semibold text-neutral-900">
        {label}
      </label>

      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white"
      />

      {loading ? (
        <p className="mt-2 text-xs text-neutral-500">Searching...</p>
      ) : lookupError ? (
        <p className="mt-2 text-xs text-red-600">{lookupError}</p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(suggestion)}
              className="block w-full px-4 py-3 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              {suggestion.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ReferencePhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
};

function NewRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferredProfessionalId = searchParams.get("pro");
  const originalRequestId = searchParams.get("request");
  const isRebook =
    searchParams.get("rebook") === "1" && !!preferredProfessionalId;

  const [rebookProName, setRebookProName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [category, setCategory] = useState("");
  const [serviceDetail, setServiceDetail] = useState("");
  const [otherServiceDetail, setOtherServiceDetail] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState("");
  const [locationSelectedFromGoogle, setLocationSelectedFromGoogle] = useState(false);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [serviceModes, setServiceModes] = useState<string[]>([]);
  const [budget, setBudget] = useState("");

  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [timingFlexibility, setTimingFlexibility] = useState("exact");

  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [referencePhotos, setReferencePhotos] = useState<ReferencePhotoItem[]>(
    []
  );
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    async function loadUser() {
      setMessage("Loading user...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const normalizedRole = profile?.role?.toLowerCase().trim() || "";
      const isCustomer = normalizedRole.includes("customer");

      if (!isCustomer) {
        setMessage("Only customers can post requests.");
        setLoading(false);
        return;
      }

      if (preferredProfessionalId) {
        const { data: proProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", preferredProfessionalId)
          .single();

        if (proProfile?.full_name) {
          setRebookProName(proProfile.full_name);
        }
      }

      setUserId(user.id);
      setMessage("");
      setLoading(false);
    }

    loadUser();
  }, [router, preferredProfessionalId]);

  useEffect(() => {
    return () => {
      referencePhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, [referencePhotos]);

  const remainingPhotoSlots = useMemo(
    () => MAX_REFERENCE_PHOTOS - referencePhotos.length,
    [referencePhotos.length]
  );

  function getTargetProfessions(selectedCategory: string) {
    switch (selectedCategory) {
      case "haircut":
        return ["barber", "hairstylist"];
      case "nails":
        return ["nail_artist"];
      case "lashes":
        return ["lash_artist"];
      case "brow_artist":
      case "brows":
        return ["brow_artist"];
      case "makeup":
        return ["makeup_artist"];
      case "waxing":
        return ["wax_technician"];
      case "body_sugaring":
        return ["body_sugaring"];
      default:
        return [];
    }
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setServiceDetail("");
    setOtherServiceDetail("");
  }

  function generatePhotoId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function compressImage(file: File): Promise<File> {
    const imageBitmap = await createImageBitmap(file);

    let width = imageBitmap.width;
    let height = imageBitmap.height;

    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      const scale = Math.min(
        MAX_IMAGE_DIMENSION / width,
        MAX_IMAGE_DIMENSION / height
      );
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      imageBitmap.close();
      throw new Error("Could not process image.");
    }

    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Could not compress image."));
            return;
          }
          resolve(result);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    const originalBaseName =
      file.name.replace(/\.[^/.]+$/, "") || `reference-${Date.now()}`;

    return new File([blob], `${originalBaseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  async function addFiles(rawFiles: File[]) {
    if (!rawFiles.length) return;

    const imageFiles = rawFiles.filter((file) => file.type.startsWith("image/"));

    if (!imageFiles.length) {
      setMessage("Only image files can be uploaded.");
      return;
    }

    if (referencePhotos.length >= MAX_REFERENCE_PHOTOS) {
      setMessage(`You can upload up to ${MAX_REFERENCE_PHOTOS} reference photos.`);
      return;
    }

    const availableSlots = MAX_REFERENCE_PHOTOS - referencePhotos.length;
    const filesToProcess = imageFiles.slice(0, availableSlots);

    try {
      setMessage("Compressing images...");

      const processedPhotos = await Promise.all(
        filesToProcess.map(async (file) => {
          const compressedFile = await compressImage(file);
          return {
            id: generatePhotoId(),
            file: compressedFile,
            previewUrl: URL.createObjectURL(compressedFile),
            name: compressedFile.name,
          };
        })
      );

      setReferencePhotos((prev) => [...prev, ...processedPhotos]);

      if (imageFiles.length > availableSlots) {
        setMessage(
          `Only the first ${availableSlots} image${
            availableSlots === 1 ? "" : "s"
          } were added. Max is ${MAX_REFERENCE_PHOTOS}.`
        );
      } else {
        setMessage("");
      }
    } catch (error: any) {
      setMessage(error?.message || "Could not process one or more images.");
    }
  }

  function handleReferencePhotoChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(e.target.files || []);
    void addFiles(files);
    e.target.value = "";
  }

  function handleRemovePhoto(photoId: string) {
    setReferencePhotos((prev) => {
      const found = prev.find((photo) => photo.id === photoId);
      if (found) {
        URL.revokeObjectURL(found.previewUrl);
      }
      return prev.filter((photo) => photo.id !== photoId);
    });
    setMessage("");
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    void addFiles(files);
  }

  async function uploadReferencePhotos(currentUserId: string) {
    if (!referencePhotos.length) return [];

    setUploadingPhotos(true);

    try {
      const uploadedUrls: string[] = [];

      for (const photo of referencePhotos) {
        const fileExt = photo.file.name.split(".").pop() || "jpg";
        const filePath = `${currentUserId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("request-reference-photos")
          .upload(filePath, photo.file, {
            upsert: false,
            contentType: photo.file.type,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage
          .from("request-reference-photos")
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          uploadedUrls.push(data.publicUrl);
        }
      }

      return uploadedUrls;
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    if (!userId) {
      setMessage("No user found.");
      return;
    }

    if (!category) {
      setMessage("Please select a service.");
      return;
    }

    if (!serviceDetail) {
      setMessage("Please select a service type.");
      return;
    }

    if (serviceDetail === "Other" && !otherServiceDetail.trim()) {
      setMessage("Please describe the service type.");
      return;
    }

    if (!title.trim()) {
      setMessage("Please enter a title.");
      return;
    }

    if (serviceModes.length === 0) {
      setMessage("Please select where the service will happen.");
      return;
    }

    if (serviceModes.includes("at_home")) {
      if (!location.trim()) {
        setMessage("Please enter the address or area where you need the service.");
        return;
      }
    }

    if (timingFlexibility !== "anytime") {
      if (!preferredDate) {
        setMessage("Please select a preferred date.");
        return;
      }

      if (!preferredStartTime) {
        setMessage("Please select a preferred start time.");
        return;
      }

    }

    setSubmitting(true);
    setMessage("Submitting request...");

    const targetProfessions = getTargetProfessions(category);
    const finalServiceDetail =
      serviceDetail === "Other" ? otherServiceDetail.trim() : serviceDetail;

    try {
      const referencePhotoUrls = await uploadReferencePhotos(userId);

      const directRebook = isRebook && !!preferredProfessionalId;
      const shouldUseCustomerLocation = serviceModes.includes("at_home");

      const { data: insertedRequest, error: insertRequestError } = await supabase
        .from("service_requests")
        .insert([
          {
            client_id: userId,
            category,
            service_detail: finalServiceDetail || null,
            title: title.trim(),
            description: description.trim() || null,
            location: shouldUseCustomerLocation ? location.trim() || null : null,
            formatted_address: shouldUseCustomerLocation ? location.trim() || null : null,
            location_place_id: shouldUseCustomerLocation ? locationPlaceId || null : null,
            location_lat:
              shouldUseCustomerLocation && Number.isFinite(locationLat)
                ? locationLat
                : null,
            location_lng:
              shouldUseCustomerLocation && Number.isFinite(locationLng)
                ? locationLng
                : null,
            service_mode: serviceModes[0] || null,
            service_modes: serviceModes.length > 0 ? serviceModes : null,
            budget: budget.trim() || null,
            status: "open",
            target_professions: directRebook ? null : targetProfessions,
            reference_photos: referencePhotoUrls,
            preferred_professional_id: directRebook ? preferredProfessionalId : null,
            is_direct_rebook: directRebook,
            original_request_id: directRebook ? originalRequestId : null,
            preferred_date: timingFlexibility === "anytime" ? null : preferredDate || null,
            preferred_start_time:
              timingFlexibility === "anytime" ? null : preferredStartTime || null,
            preferred_end_time: null,
            timing_flexibility: timingFlexibility,
          },
        ])
        .select(
          "id, client_id, preferred_professional_id, is_direct_rebook, original_request_id"
        )
        .single();

      if (insertRequestError) {
        throw insertRequestError;
      }

      if (directRebook && insertedRequest?.preferred_professional_id) {
        // Best-effort — a notification side-effect must never block the request
        // that was already successfully created above.
        const { error: notificationError } = await supabase.from("notifications").insert([
          {
            user_id: insertedRequest.preferred_professional_id,
            request_id: insertedRequest.id,
            is_read: false,
            type: "request",
            title: "New booking request",
          },
        ]);

        if (notificationError) {
          console.error("Rebook notification insert failed:", notificationError);
        }
      }

      await fetch("/api/notifications/request-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: insertedRequest.id }),
      }).catch((notificationError) => {
        console.error("Request match email failed:", notificationError);
      });

      setShowSuccess(true);
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        router.push(`/requests/${insertedRequest.id}`);
      }, 1500);
    } catch (error: any) {
      console.error("INSERT ERROR:", error);
      setMessage(error.message || "Could not post request.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  if (loading) {
    return <NewRequestLoadingSkeleton />;
  }

  const inputClass = "w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white";
  const labelClass = "mb-2 block text-sm font-semibold text-neutral-700";

  const categoryOptions = [
    { value: "haircut", label: "Hair", Icon: Scissors },
    { value: "nails", label: "Nails", Icon: Hand },
    { value: "lashes", label: "Lashes", Icon: Eye },
    { value: "brows", label: "Brows", Icon: Pencil },
    { value: "makeup", label: "Makeup", Icon: Palette },
    { value: "waxing", label: "Waxing", Icon: Droplet },
    { value: "body_sugaring", label: "Sugaring", Icon: Leaf },
  ];

  const serviceModeOptions = [
    { value: "at_home", label: "At my place", sub: "Pro comes to you" },
    { value: "in_shop", label: "Their shop", sub: "You go to them" },
    { value: "home_studio", label: "Home studio", sub: "At their home" },
  ];

  return (
    <>

      <main className="min-h-screen bg-white pb-20">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

          {/* Page header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              {isRebook ? "Rebook" : "New Request"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
              {isRebook ? "Book again" : "Post a request"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-neutral-500">
              {isRebook
                ? `Send a new request directly to ${rebookProName || "this professional"}.`
                : "Describe what you need and professionals will send you offers."}
            </p>
          </div>

          {/* Rebook banner */}
          {isRebook && preferredProfessionalId ? (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">
                Rebooking with {rebookProName || "this professional"}
              </p>
              <p className="mt-0.5 text-sm text-emerald-700">
                This request will be sent directly to them first.
              </p>
            </div>
          ) : null}

          {/* Form card */}
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Service category */}
              <div>
                <label className={labelClass}>Service</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {categoryOptions.map((opt) => {
                    const isSelected = category === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleCategoryChange(opt.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center transition active:scale-[0.97] ${
                          isSelected
                            ? "border-black bg-black text-white"
                            : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                        }`}
                      >
                        <opt.Icon className="h-5 w-5" />
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Service type */}
              {category ? (
                <div>
                  <label className={labelClass}>Service type</label>
                  <select
                    value={serviceDetail}
                    onChange={(e) => {
                      setServiceDetail(e.target.value);
                      if (e.target.value !== "Other") setOtherServiceDetail("");
                    }}
                    className={inputClass}
                  >
                    <option value="">Select service type</option>
                    {serviceDetailOptions[category]?.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Other service detail */}
              {serviceDetail === "Other" ? (
                <div>
                  <label className={labelClass}>Describe the service</label>
                  <input
                    type="text"
                    placeholder="Type the service you want"
                    value={otherServiceDetail}
                    onChange={(e) => setOtherServiceDetail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              ) : null}

              {/* Title */}
              <div>
                <label className={labelClass}>Title</label>
                <input
                  type="text"
                  placeholder="e.g. Need a gel manicure this weekend"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelClass}>Extra details <span className="font-normal text-neutral-400">(optional)</span></label>
                <textarea
                  placeholder="Describe what you want, any reference styles, specific requests..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={4}
                />
              </div>

              {/* Service mode */}
              <div>
                <label className={labelClass}>Where should this happen?</label>
                <p className="mb-2 text-xs text-neutral-400">Select all that work for you — professionals will offer one of them.</p>
                <div className="grid grid-cols-3 gap-2">
                  {serviceModeOptions.map((opt) => {
                    const isSelected = serviceModes.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setServiceModes((prev) =>
                            prev.includes(opt.value)
                              ? prev.filter((mode) => mode !== opt.value)
                              : [...prev, opt.value]
                          );
                          if (opt.value === "at_home" && isSelected) {
                            setLocation("");
                            setLocationPlaceId("");
                            setLocationSelectedFromGoogle(false);
                            setLocationLat(null);
                            setLocationLng(null);
                          }
                        }}
                        className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-[0.97] ${
                          isSelected
                            ? "border-black bg-black text-white"
                            : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                        }`}
                      >
                        <span className="text-sm font-semibold">{opt.label}</span>
                        <span className={`text-xs ${isSelected ? "text-white/70" : "text-neutral-500"}`}>{opt.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location */}
              {serviceModes.includes("at_home") ? (
                <div className="space-y-3">
                  <LocationAutocomplete
                    label="Your address or area"
                    placeholder="Start typing your address..."
                    value={location}
                    onInputChange={(value) => {
                      setLocation(value);
                      if (value !== location) {
                        setLocationPlaceId("");
                        setLocationSelectedFromGoogle(false);
                        setLocationLat(null);
                        setLocationLng(null);
                      }
                    }}
                    onSelect={(selected) => {
                      const safeAddress = selected.formattedAddress || location;
                      const safePlaceId = selected.placeId || "";
                      const safeLat = Number.isFinite(selected.lat) ? selected.lat : null;
                      const safeLng = Number.isFinite(selected.lng) ? selected.lng : null;

                      setLocation(safeAddress);
                      setLocationPlaceId(safePlaceId);
                      setLocationSelectedFromGoogle(!!safePlaceId);
                      setLocationLat(safeLat);
                      setLocationLng(safeLng);

                      if (!safePlaceId) {
                        setMessage("Try selecting a more specific address from the suggestions.");
                        return;
                      }
                      setMessage("");
                    }}
                  />
                  {locationSelectedFromGoogle && locationPlaceId ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <p className="font-semibold">Location confirmed</p>
                      <p className="mt-0.5 text-emerald-700">{location}</p>
                    </div>
                  ) : location ? (
                    <p className="text-xs text-neutral-500">
                      Select a suggestion from the dropdown for the best accuracy.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {serviceModes.includes("in_shop") || serviceModes.includes("home_studio") ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
                  For {[
                    serviceModes.includes("in_shop") ? "their shop" : null,
                    serviceModes.includes("home_studio") ? "home studio" : null,
                  ].filter(Boolean).join(" or ")}, the professional’s location will be used — you don’t need to enter an address.
                </div>
              ) : null}

              {/* Budget */}
              <div>
                <label className={labelClass}>Budget <span className="font-normal text-neutral-400">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. $40–$60"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Timing */}
              <div>
                <label className={labelClass}>When do you want this?</label>
                <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <select
                    value={timingFlexibility}
                    onChange={(e) => {
                      setTimingFlexibility(e.target.value);
                      if (e.target.value === "anytime") {
                        setPreferredDate("");
                        setPreferredStartTime("");
                      }
                    }}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
                  >
                    <option value="exact">Exact date and time</option>
                    <option value="flexible">Flexible around this time</option>
                    <option value="anytime">Anytime — let pros suggest</option>
                  </select>

                  {timingFlexibility !== "anytime" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Date</label>
                        <input
                          type="date"
                          value={preferredDate}
                          onChange={(e) => setPreferredDate(e.target.value)}
                          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Start time</label>
                        <TimeSelect
                          value={preferredStartTime}
                          onChange={setPreferredStartTime}
                          selectClassName="w-full rounded-xl border border-neutral-200 bg-white px-2 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">Professionals will include their available times in their offers.</p>
                  )}
                </div>
              </div>

              {/* Reference photos */}
              <div>
                <label className={labelClass}>Reference photos <span className="font-normal text-neutral-400">(optional)</span></label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-2xl border border-dashed p-6 text-center transition ${
                    isDragging
                      ? "border-black bg-neutral-100"
                      : "border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-white"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6 text-neutral-400" fill="none">
                    <path d="M12 16V8M12 8L9 11M12 8L15 11M5 17.5V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    Drop photos here or click to upload
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Up to {MAX_REFERENCE_PHOTOS} images · {remainingPhotoSlots} slot{remainingPhotoSlots === 1 ? "" : "s"} remaining
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleReferencePhotoChange}
                  className="hidden"
                />

                {referencePhotos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {referencePhotos.map((photo) => (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                        <img src={photo.previewUrl} alt={photo.name} className="h-32 w-full object-cover" />
                        <div className="flex items-center justify-between gap-2 p-2">
                          <p className="truncate text-xs text-neutral-500">{photo.name}</p>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(photo.id); }}
                            className="shrink-0 rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Error message */}
              {message && !message.startsWith("Submitting") && !message.startsWith("Compressing") ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {message}
                </div>
              ) : null}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || uploadingPhotos}
                className="w-full rounded-full bg-black py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {uploadingPhotos
                  ? "Uploading photos..."
                  : submitting
                  ? "Posting your request..."
                  : isRebook
                  ? "Send rebook request"
                  : "Post request"}
              </button>

            </form>
          </div>
        </div>
      </main>

      {(submitting || showSuccess) ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            style={{ animation: "lu-overlay-in 0.2s ease forwards" }}
          />

          {/* Floating card */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ animation: "lu-overlay-in 0.25s ease forwards" }}
          >
            <div className="flex w-full max-w-xs flex-col items-center rounded-[2rem] bg-white px-10 py-12 shadow-2xl">

              {/* Logo with left-to-right mask reveal */}
              <div
                className="h-28 w-28"
                style={{
                  animation: showSuccess
                    ? "lu-logo-reveal 0.85s cubic-bezier(0.4,0,0.2,1) forwards"
                    : "lu-logo-reveal 0.85s cubic-bezier(0.4,0,0.2,1) forwards, lu-pulse-opacity 1.8s ease-in-out 1.4s infinite",
                }}
              >
                <svg
                  viewBox="0 0 1024 1024"
                  width="100%"
                  height="100%"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <clipPath id="lu-sweep">
                      <rect x="0" y="0" height="1024" width="0">
                        <animate
                          attributeName="width"
                          from="0"
                          to="1024"
                          dur="0.85s"
                          calcMode="spline"
                          keySplines="0.4 0 0.2 1"
                          keyTimes="0;1"
                          fill="freeze"
                        />
                      </rect>
                    </clipPath>
                  </defs>
                  <g clipPath="url(#lu-sweep)">
                    <path fill="#000000" opacity="1.000000" stroke="none" d="M231.891357,594.951538 C243.838623,581.145813 259.268250,573.366394 275.563538,567.129700 C294.680511,559.813110 314.612976,556.109192 335.011475,554.839294 C337.069885,554.711182 338.924805,554.511841 340.165588,552.489563 C353.526306,530.713684 366.503021,508.585907 372.048126,483.409393 C377.086090,460.535553 362.846130,426.852509 336.078979,419.947144 C328.509277,417.994293 320.897766,418.246216 313.250702,418.259247 C303.283203,418.276245 293.730927,416.321625 284.595093,412.349487 C263.686279,403.258545 250.835648,380.991943 251.343979,358.189056 C252.246216,317.717163 294.504028,294.843079 329.164398,306.761017 C336.299896,309.214569 342.883209,312.783325 349.604828,316.079163 C355.302917,318.873169 360.962952,319.664520 366.904236,316.943207 C368.253052,316.325348 369.745728,315.982056 371.203339,315.648071 C377.976501,314.095825 384.397095,316.320923 387.087799,321.101593 C389.938934,326.167419 389.216675,334.755249 384.031219,338.539093 C370.500244,348.412750 370.889618,362.629181 370.832916,376.826050 C370.799377,385.220032 372.591156,393.347717 375.342010,401.271698 C377.554749,407.645691 380.554779,413.649872 385.312561,418.420959 C389.160858,422.280090 393.795624,425.390747 393.899384,432.344299 C396.862915,430.269257 397.452515,427.824799 398.307587,425.657776 C406.936798,403.788940 416.273560,382.254517 428.336151,362.010864 C445.013885,334.021973 464.138977,308.123352 491.690277,289.701111 C512.066711,276.076385 534.217590,269.787933 558.554688,276.079254 C567.135254,278.297363 574.316589,276.499603 581.195312,271.925110 C590.572327,265.689301 600.348816,260.411591 611.540283,258.354462 C617.635437,257.234131 623.783569,257.205414 629.892395,258.566040 C633.665955,259.406555 637.439209,260.610260 637.084900,265.314453 C636.734558,269.964722 632.725403,270.062622 629.163330,270.329742 C608.751892,271.860138 590.215515,286.678711 586.820557,304.918274 C585.397339,312.564636 585.817871,320.537964 584.680847,328.256683 C580.098206,359.367065 562.906372,383.243927 540.379822,403.856598 C522.160278,420.528168 500.960999,432.775482 479.370087,444.447113 C464.856293,452.293030 450.730591,460.743835 438.074005,471.521729 C425.828735,481.949371 416.699829,494.780060 408.366852,508.281647 C399.353882,522.884949 390.251221,537.426880 380.667358,551.664551 C380.047333,552.585571 379.068268,553.416626 379.364532,555.286560 C385.874512,556.265625 392.576874,557.115112 399.219482,558.299744 C430.379700,563.857056 460.045349,574.169312 489.122772,586.447632 C520.284790,599.605957 551.694153,612.079956 584.661804,620.199036 C610.857422,626.650452 637.096130,629.229980 663.698425,622.871033 C676.606628,619.785461 688.710815,614.808289 700.045593,607.927124 C701.739136,606.898987 703.621338,605.280762 705.299988,607.506775 C706.829407,609.534973 704.673706,610.822876 703.544983,612.108093 C686.417358,631.610535 663.981567,640.969360 639.094604,645.267639 C595.194946,652.849670 552.869568,645.213013 511.395264,631.058716 C487.114441,622.772217 463.733124,612.111450 439.787506,602.934387 C414.882874,593.389771 389.679871,584.817139 362.913971,581.890442 C359.405579,581.506897 357.386230,582.315918 355.261444,584.903076 C340.665466,602.675598 323.941406,618.139404 304.096161,629.875000 C287.823486,639.497864 270.425903,645.872375 251.099457,645.281677 C237.144150,644.855225 224.850388,635.832275 222.998199,624.093079 C221.283310,613.224060 225.256317,603.798279 231.891357,594.951538 M558.396057,331.822083 C558.943176,327.199158 559.920166,322.631775 559.694214,317.918976 C558.732666,297.863220 543.549072,288.096069 524.989075,295.655487 C517.784424,298.589874 511.703094,303.110016 506.069946,308.447662 C495.033661,318.904999 486.864685,331.447052 479.557800,344.569244 C470.368835,361.071320 462.776031,378.224182 459.772980,397.107025 C458.007507,408.207916 464.766571,415.462372 475.769043,414.082520 C479.098267,413.664978 482.308624,412.887268 485.490479,411.867249 C499.478363,407.383179 510.900269,398.691376 521.651733,389.177399 C539.045837,373.785522 552.944031,355.966339 558.396057,331.822083 M340.882202,334.613953 C330.625732,324.702972 318.063324,321.573517 304.464569,323.682648 C289.108643,326.064331 277.895233,334.638824 273.631683,349.966217 C269.306305,365.515961 273.468872,379.472748 285.177429,390.545013 C296.634552,401.379456 310.642242,404.181305 325.539062,399.801636 C353.343597,391.627136 361.689972,356.874664 340.882202,334.613953 M280.764313,619.279236 C296.198303,608.901245 309.324371,596.220825 320.085815,580.808533 C317.771820,579.613953 315.958252,579.370789 314.127289,579.470459 C294.124573,580.559204 274.759186,584.181213 257.266296,594.589355 C251.252518,598.167480 245.442795,602.195923 241.869751,608.514526 C235.971008,618.945801 240.944321,627.657471 252.873413,628.113464 C262.986481,628.500061 271.727386,624.656921 280.764313,619.279236 z"/>
                    <path fill="#000000" opacity="1.000000" stroke="none" d="M599.525269,457.440125 C587.392273,482.317719 574.437805,506.396179 564.300659,531.799744 C561.271301,539.391418 558.731506,547.152344 559.077148,555.530457 C559.406372,563.510803 562.952881,566.579590 570.948181,565.796692 C574.359192,565.462708 577.362976,564.127441 580.257141,562.420837 C600.257202,550.627319 614.782410,533.342285 627.916260,514.711975 C641.679443,495.188873 653.111328,474.294342 663.415100,452.792511 C665.532166,448.374603 668.183960,446.740234 673.002625,446.780548 C682.655029,446.861298 692.310974,446.235840 701.968262,446.095642 C709.170776,445.991058 710.462646,448.099060 707.261963,454.497009 C695.192749,478.622223 682.762451,502.577332 672.476990,527.547302 C668.798828,536.476746 665.472168,545.528320 663.781067,555.119690 C661.460205,568.282837 668.295898,574.737915 681.288330,571.227539 C688.276978,569.339355 694.462830,565.722168 700.357544,561.557434 C714.995789,551.215271 727.662537,538.696960 740.097229,525.901489 C742.757751,523.163757 745.689880,520.678772 748.609558,518.210571 C749.603516,517.370239 750.954651,516.769226 752.287048,517.739746 C753.681519,518.755432 754.037048,520.247864 753.429626,521.745300 C752.368286,524.362000 751.400879,527.097656 749.853638,529.424072 C731.650146,556.794495 708.080566,577.715332 676.685242,588.687683 C665.727112,592.517456 654.302246,594.088257 642.912354,589.742493 C631.615906,585.432373 625.226318,576.230591 624.665710,564.133911 C624.379822,557.965393 625.489990,551.906311 625.884888,545.431458 C623.252014,545.729614 622.449097,547.706604 621.185547,549.027710 C607.404358,563.436584 592.760376,576.745911 574.012329,584.484131 C563.533203,588.809387 552.637878,590.974854 541.319824,588.255005 C526.801453,584.766174 517.805603,573.129089 517.600220,558.177063 C517.437500,546.329712 520.094604,535.037903 524.085876,524.027466 C534.385925,495.613495 548.600769,468.974792 561.600708,441.786072 C562.865234,439.141205 564.733459,437.713440 567.840698,437.729767 C579.503906,437.790894 591.168091,437.656189 602.831421,437.708618 C607.582581,437.729980 608.358582,439.153229 606.248169,443.624969 C604.115662,448.143402 601.882751,452.614410 599.525269,457.440125 z"/>
                  </g>
                </svg>
              </div>

              {showSuccess ? (
                <div
                  className="mt-6 flex flex-col items-center gap-2"
                  style={{ animation: "lu-success-rise 0.35s ease forwards" }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-black"
                    style={{ animation: "lu-check-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 text-white" fill="none">
                      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-neutral-500">
                    Request sent
                  </p>
                </div>
              ) : (
                <p
                  className="mt-6 text-sm text-neutral-400"
                  style={{ animation: "lu-success-rise 0.3s ease 0.5s both" }}
                >
                  Posting your request…
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function NewRequestPage() {
  return (
    <Suspense
      fallback={<NewRequestLoadingSkeleton />}
    >
      <NewRequestPageContent />
    </Suspense>
  );
}