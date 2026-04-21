"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

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
  const [serviceMode, setServiceMode] = useState("");
  const [budget, setBudget] = useState("");

  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
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

    if (timingFlexibility !== "anytime") {
      if (!preferredDate) {
        setMessage("Please select a preferred date.");
        return;
      }

      if (!preferredStartTime) {
        setMessage("Please select a preferred start time.");
        return;
      }

      if (preferredEndTime && preferredEndTime <= preferredStartTime) {
        setMessage("End time must be later than start time.");
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

      const { data: insertedRequest, error: insertRequestError } = await supabase
        .from("service_requests")
        .insert([
          {
            client_id: userId,
            category,
            service_detail: finalServiceDetail || null,
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
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
            preferred_end_time:
              timingFlexibility === "anytime" ? null : preferredEndTime || null,
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
    return (
      <main className="mx-auto max-w-2xl p-10">
        <p>Loading...</p>
        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
      </main>
    );
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
          <label className="mb-2 block text-sm font-medium">Location</label>
          <input
            type="text"
            placeholder="Winnipeg, MB"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Service mode</label>
          <select
            value={serviceMode}
            onChange={(e) => setServiceMode(e.target.value)}
            className="w-full rounded border p-3"
          >
            <option value="">Select mode</option>
            <option value="in_shop">In shop</option>
            <option value="at_home">At home</option>
            <option value="home_studio">Home studio</option>
          </select>
        </div>

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

          <div className="space-y-3">
            <select
              value={timingFlexibility}
              onChange={(e) => setTimingFlexibility(e.target.value)}
              className="w-full rounded border p-3"
            >
              <option value="exact">Exact time</option>
              <option value="flexible">Flexible around a time</option>
              <option value="anytime">Anytime</option>
            </select>

            {timingFlexibility !== "anytime" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="rounded border p-3"
                />

                <input
                  type="time"
                  value={preferredStartTime}
                  onChange={(e) => setPreferredStartTime(e.target.value)}
                  className="rounded border p-3"
                />

                <input
                  type="time"
                  value={preferredEndTime}
                  onChange={(e) => setPreferredEndTime(e.target.value)}
                  className="rounded border p-3"
                />
              </div>
            ) : null}

            <p className="text-sm text-neutral-500">
              Barbers and other professionals can match this time or send an offer
              with a different time slot.
            </p>
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
      fallback={
        <main className="mx-auto max-w-2xl p-10">
          <p>Loading...</p>
        </main>
      }
    >
      <NewRequestPageContent />
    </Suspense>
  );
}