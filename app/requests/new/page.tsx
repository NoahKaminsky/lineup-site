"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import Navbar from "@/app/components/AppNavbar";
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
    "Other",
  ],
  nails: [
    "Manicure",
    "Pedicure",
    "Acrylic full set",
    "Acrylic fill",
    "Gel manicure",
    "Gel X / extensions",
    "Nail art",
    "Other",
  ],
  lashes: [
    "Classic set",
    "Hybrid set",
    "Volume set",
    "Fill",
    "Lash lift",
    "Lash tint",
    "Other",
  ],
  brows: [
    "Brow shaping",
    "Brow wax",
    "Brow tint",
    "Brow lamination",
    "Threading",
    "Other",
  ],
  makeup: [
    "Full face",
    "Soft glam",
    "Full glam",
    "Bridal makeup",
    "Event makeup",
    "Makeup lesson",
    "Other",
  ],
};


function NewRequestLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <Navbar />

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

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!input || input.length < 2) {
        setSuggestions([]);
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
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
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

      console.log("PLACE DETAILS RESPONSE:", data);

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
        className="w-full rounded border p-3 text-neutral-900 outline-none transition focus:border-black"
      />

      {loading ? (
        <p className="mt-2 text-xs text-neutral-500">Searching...</p>
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
  const [serviceMode, setServiceMode] = useState("");
  const [budget, setBudget] = useState("");

  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [timingFlexibility, setTimingFlexibility] = useState("exact");

  const [submitting, setSubmitting] = useState(false);

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

    if (!serviceMode) {
      setMessage("Please select where the service will happen.");
      return;
    }

    if (serviceMode === "at_home") {
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
      const shouldUseCustomerLocation = serviceMode === "at_home";

      console.log("REQUEST LOCATION BEFORE INSERT:", {
        location,
        locationPlaceId,
        locationSelectedFromGoogle,
        locationLat,
        locationLng,
      });

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
            service_mode: serviceMode || null,
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

      console.log("insertedRequest:", insertedRequest);
      console.log("insertRequestError:", insertRequestError);

      if (insertRequestError) {
        throw insertRequestError;
      }

      if (directRebook) {
        console.log("REBOOK DEBUG preferredProfessionalId:", preferredProfessionalId);
        console.log("REBOOK DEBUG insertedRequest:", insertedRequest);

        if (!insertedRequest?.preferred_professional_id) {
          throw new Error("Rebook request was created without preferred_professional_id.");
        }

        const { data: insertedNotification, error: notificationError } =
          await supabase
            .from("notifications")
            .insert([
              {
                user_id: insertedRequest.preferred_professional_id,
                request_id: insertedRequest.id,
                is_read: false,
                type: "request",
                title: "New booking request",
              },
            ])
            .select("*")
            .single();

        console.log("REBOOK DEBUG insertedNotification:", insertedNotification);
        console.log("REBOOK DEBUG notificationError:", notificationError);

        if (notificationError) {
          throw notificationError;
        }
      }

      await fetch("/api/notifications/request-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: insertedRequest.id }),
      }).catch((notificationError) => {
        console.error("Request match email failed:", notificationError);
      });

      setMessage("Request posted successfully.");
      router.push("/requests");
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

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="mb-6 text-3xl font-semibold">
        {isRebook ? "Book again" : "Create a request"}
      </h1>

      {isRebook && preferredProfessionalId ? (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            Rebooking with {rebookProName || "this professional"}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            This request will be sent directly to them first.
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium">Service</label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full rounded border p-3"
          >
            <option value="">Select service</option>
            <option value="haircut">Haircut</option>
            <option value="nails">Nails</option>
            <option value="lashes">Lashes</option>
            <option value="brows">Brows</option>
            <option value="makeup">Makeup</option>
          </select>
        </div>

        {category && (
          <div>
            <label className="mb-2 block text-sm font-medium">Service type</label>
            <select
              value={serviceDetail}
              onChange={(e) => {
                setServiceDetail(e.target.value);
                if (e.target.value !== "Other") {
                  setOtherServiceDetail("");
                }
              }}
              className="w-full rounded border p-3"
            >
              <option value="">Select service type</option>
              {serviceDetailOptions[category]?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {serviceDetail === "Other" && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              Describe the service type
            </label>
            <input
              type="text"
              placeholder="Type the service you want"
              value={otherServiceDetail}
              onChange={(e) => setOtherServiceDetail(e.target.value)}
              className="w-full rounded border p-3"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Title</label>
          <input
            type="text"
            placeholder="Need a gel manicure this weekend"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Extra details
          </label>
          <textarea
            placeholder="Describe what you want..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border p-3"
            rows={5}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Service mode</label>
          <select
            value={serviceMode}
            onChange={(e) => {
              const nextMode = e.target.value;
              setServiceMode(nextMode);

              if (nextMode !== "at_home") {
                setLocation("");
                setLocationPlaceId("");
                setLocationSelectedFromGoogle(false);
                setLocationLat(null);
                setLocationLng(null);
              }
            }}
            className="w-full rounded border p-3"
          >
            <option value="">Select mode</option>
            <option value="at_home">At my location</option>
            <option value="in_shop">At the professional’s shop</option>
            <option value="home_studio">At the professional’s home studio</option>
          </select>
        </div>

        {serviceMode === "at_home" ? (
          <div className="space-y-3">
            <LocationAutocomplete
              label="Where do you need the service?"
              placeholder="Enter your address or area"
              value={location}
              onInputChange={(value) => {
                setLocation(value);

                // Only clear Google data when the user manually changes the typed value.
                // Selecting a dropdown suggestion runs onSelect below and should stay locked.
                if (value !== location) {
                  setLocationPlaceId("");
                  setLocationSelectedFromGoogle(false);
                  setLocationLat(null);
                  setLocationLng(null);
                }
              }}
              onSelect={(selected) => {
                console.log("GOOGLE SELECTED LOCATION:", selected);

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
                  setMessage("Google returned an address but no place ID. Try selecting a more specific suggestion.");
                  return;
                }

                if (safeLat === null || safeLng === null) {
                  setMessage("Google selected the address, but coordinates did not come back. The request will still save, but map preview may not show.");
                  return;
                }

                setMessage("");
              }}
            />

            {locationSelectedFromGoogle && locationPlaceId ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-medium">Location selected from Google:</p>
                <p className="mt-1">{location}</p>
                {locationLat !== null && locationLng !== null ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    Coordinates saved for map preview.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">
                    Address saved, but coordinates are missing — map preview may not show.
                  </p>
                )}
              </div>
            ) : location ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                Address entered. Selecting a Google suggestion gives the best map/distance accuracy.
              </div>
            ) : null}
          </div>
        ) : serviceMode === "in_shop" || serviceMode === "home_studio" ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
            The professional’s saved business location will be used for this request if they accept or send an offer.
            You do not need to enter your address for this service mode.
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium">Budget</label>
          <input
            type="text"
            placeholder="$40-60"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            When do you want this done?
          </label>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Timing preference
                </label>
                <select
                  value={timingFlexibility}
                  onChange={(e) => {
                    setTimingFlexibility(e.target.value);
                    if (e.target.value === "anytime") {
                      setPreferredDate("");
                      setPreferredStartTime("");
                    }
                  }}
                  className="w-full rounded-xl border border-neutral-300 bg-white p-3"
                >
                  <option value="exact">Exact date and start time</option>
                  <option value="flexible">Flexible around this time</option>
                  <option value="anytime">Anytime / let pros suggest times</option>
                </select>
              </div>

              {timingFlexibility !== "anytime" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Preferred date
                    </label>
                    <input
                      type="date"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Preferred start time
                    </label>
                    <input
                      type="time"
                      value={preferredStartTime}
                      onChange={(e) => setPreferredStartTime(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white p-3"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
                  Pros will suggest available times in their offers.
                </div>
              )}

              <p className="text-sm leading-6 text-neutral-500">
                This is your preferred start time. The professional will include the end time in their offer, and once you accept it, it becomes a confirmed calendar booking.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Reference photos
          </label>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border border-dashed p-6 text-center transition ${
              isDragging
                ? "border-black bg-neutral-100"
                : "border-neutral-300 bg-neutral-50 hover:bg-neutral-100"
            }`}
          >
            <p className="text-sm font-medium text-neutral-900">
              Drag and drop photos here, or click to upload
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              Up to {MAX_REFERENCE_PHOTOS} images. They’ll be compressed automatically.
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {remainingPhotoSlots} slot{remainingPhotoSlots === 1 ? "" : "s"} remaining
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
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {referencePhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
                >
                  <img
                    src={photo.previewUrl}
                    alt={photo.name}
                    className="h-32 w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <p className="truncate text-xs text-neutral-500">
                      {photo.name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePhoto(photo.id);
                      }}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          className="w-full rounded bg-black py-3 text-white disabled:opacity-60"
          disabled={submitting || uploadingPhotos}
        >
          {uploadingPhotos
            ? "Uploading photos..."
            : submitting
            ? "Posting..."
            : isRebook
            ? "Send rebook request"
            : "Post request"}
        </button>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </form>
    </main>
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