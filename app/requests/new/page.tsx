"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors, Hand, Eye, Pencil, Palette, Leaf, Droplet } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import TimeSelect from "../../components/TimeSelect";
import { containsProfanity } from "../../lib/profanityFilter";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { MomentCard, MomentOverlay, formatMomentDate, formatMomentPrice } from "@/app/components/moments/Moments";
import { normalizeImageFile } from "@/app/lib/normalizeImageFile";
const MAX_REFERENCE_PHOTOS = 5;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

type ServiceDetailGroup = {
  label: string;
  options: string[];
};

// Grouped (rather than one flat list) so a category with a lot of options
// still reads as organized chip clusters instead of a wall of pills.
const serviceDetailGroups: Record<string, ServiceDetailGroup[]> = {
  haircut: [
    {
      label: "Cuts",
      options: ["Haircut", "Skin fade", "Taper / taper fade", "Buzz cut", "Kids cut", "Curly hair cut / style"],
    },
    {
      label: "Color & treatment",
      options: ["Color / highlights", "Balayage", "Deep conditioning treatment", "Hair relaxer / texturizer", "Perm"],
    },
    {
      label: "Styling",
      options: ["Blowout", "Updo / styling", "Hot towel shave", "Beard trim", "Line up / shape up"],
    },
    {
      label: "Extensions & protective styles",
      options: ["Hair extensions", "Braids / twists", "Silk press", "Wig install / styling"],
    },
  ],
  nails: [
    {
      label: "Manicure & pedicure",
      options: ["Manicure", "Pedicure", "Nail polish change"],
    },
    {
      label: "Enhancements",
      options: ["Acrylic full set", "Acrylic fill", "Gel manicure", "Gel X / extensions", "Dip powder"],
    },
    {
      label: "Art & repair",
      options: ["Nail art", "French tips", "Ombre / gradient nails", "Nail repair"],
    },
  ],
  lashes: [
    {
      label: "Extensions",
      options: ["Classic set", "Hybrid set", "Volume set", "Mega volume set", "Fill"],
    },
    {
      label: "Lifts & other",
      options: ["Lash lift", "Lash tint", "Lash removal", "Strip lash application", "Bottom lash set"],
    },
  ],
  brows: [
    {
      label: "Shaping",
      options: ["Brow shaping", "Brow wax", "Threading", "Brow tweezing"],
    },
    {
      label: "Color & style",
      options: ["Brow tint", "Brow henna", "Brow lamination", "Ombre brows"],
    },
    {
      label: "Semi-permanent",
      options: ["Microblading", "Nano brows"],
    },
  ],
  makeup: [
    {
      label: "Everyday & glam",
      options: ["Full face", "Soft glam", "Full glam", "Natural / no-makeup look", "Makeup lesson"],
    },
    {
      label: "Special occasion",
      options: ["Bridal makeup", "Event makeup", "Photoshoot makeup", "Airbrush makeup", "Special effects makeup"],
    },
  ],
  waxing: [
    {
      label: "Face & brows",
      options: ["Full face wax", "Eyebrow wax"],
    },
    {
      label: "Bikini & legs",
      options: ["Brazilian wax", "Bikini wax", "Full leg wax", "Half leg wax"],
    },
    {
      label: "Body",
      options: ["Underarm wax", "Arm wax", "Chest wax", "Back wax", "Full body wax"],
    },
  ],
  body_sugaring: [
    {
      label: "Face & brows",
      options: ["Eyebrow sugaring"],
    },
    {
      label: "Bikini & legs",
      options: ["Brazilian sugaring", "Bikini sugaring", "Full leg sugaring", "Half leg sugaring"],
    },
    {
      label: "Body",
      options: ["Underarm sugaring", "Arm sugaring", "Chest sugaring", "Back sugaring", "Full body sugaring"],
    },
  ],
};


function NewRequestLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">


      <div className="mx-auto max-w-2xl py-8">
        <div className="max-w-xl">
          <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-5 h-12 w-full max-w-md animate-pulse rounded-2xl bg-neutral-200 md:h-14" />
          <div className="mt-5 h-5 w-full max-w-lg animate-pulse rounded-full bg-neutral-100" />
          <div className="mt-3 h-5 w-2/3 animate-pulse rounded-full bg-neutral-100" />
        </div>

        <div className="mt-8 rounded-panel border border-neutral-200 bg-white p-5 shadow-sm">
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
  const [confirming, setConfirming] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const sessionTokenRef = useRef<string | null>(null);

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
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = crypto.randomUUID();
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ input, sessionToken: sessionTokenRef.current }),
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
    setSuggestions([]);
    setConfirming(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken: sessionTokenRef.current }),
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
        setInput(suggestion.text);
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
      setInput(suggestion.text);
      onSelect({
        placeId: suggestion.placeId,
        formattedAddress: suggestion.text,
        lat: Number.NaN,
        lng: Number.NaN,
        name: null,
      });
    } finally {
      setConfirming(false);
      sessionTokenRef.current = null;
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
        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-ink focus:bg-white"
      />

      {confirming ? (
        <p className="mt-2 text-xs text-neutral-500">Confirming address...</p>
      ) : loading ? (
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
  // Set only when the customer clicked a specific priced service on a
  // professional's profile (rather than the generic "Request service" CTA) —
  // used to pre-fill the title/budget below instead of leaving them blank.
  const clickedServiceName = searchParams.get("service");
  const clickedServicePrice = searchParams.get("price");
  // A specific service picked on a pro's profile: the service is already
  // decided, so the category/type pickers are replaced by a summary of it.
  const requestingSpecificService = isRebook && !!clickedServiceName;

  const [rebookProName, setRebookProName] = useState<string | null>(null);
  const [rebookProTypes, setRebookProTypes] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [categories, setCategories] = useState<string[]>([]);
  const [serviceDetailsByCategory, setServiceDetailsByCategory] = useState<Record<string, string[]>>({});
  const [otherServiceDetail, setOtherServiceDetail] = useState(() =>
    requestingSpecificService ? clickedServiceName || "" : ""
  );

  function toggleServiceDetail(categoryValue: string, option: string) {
    setServiceDetailsByCategory((prev) => {
      const current = prev[categoryValue] || [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [categoryValue]: next };
    });
  }

  const [title, setTitle] = useState(() => clickedServiceName || "");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState("");
  const [locationSelectedFromGoogle, setLocationSelectedFromGoogle] = useState(false);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [serviceModes, setServiceModes] = useState<string[]>([]);
  const [budget, setBudget] = useState(() => {
    const numeric = Number(clickedServicePrice);
    return clickedServicePrice && !Number.isNaN(numeric)
      ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(numeric)
      : "";
  });

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

      const user = await getSignedInUser();

      if (!user) {
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
          .select("full_name, professional_type, professional_types")
          .eq("id", preferredProfessionalId)
          .single();

        if (proProfile?.full_name) {
          setRebookProName(proProfile.full_name);
        }

        const savedTypes = Array.isArray(proProfile?.professional_types)
          ? proProfile.professional_types.filter(Boolean)
          : [];
        const fallbackType = proProfile?.professional_type ? [proProfile.professional_type] : [];
        setRebookProTypes(savedTypes.length > 0 ? savedTypes : fallbackType);
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

  const categoryOptions = [
    { value: "haircut", label: "Hair", Icon: Scissors },
    { value: "nails", label: "Nails", Icon: Hand },
    { value: "lashes", label: "Lashes", Icon: Eye },
    { value: "brows", label: "Brows", Icon: Pencil },
    { value: "makeup", label: "Makeup", Icon: Palette },
    { value: "waxing", label: "Waxing", Icon: Droplet },
    { value: "body_sugaring", label: "Sugaring", Icon: Leaf },
  ];

  // When requesting a specific professional directly, only offer the services they
  // actually do — e.g. a brow + lash artist shouldn't be requestable for a haircut.
  const availableCategoryOptions =
    isRebook && rebookProTypes && rebookProTypes.length > 0
      ? categoryOptions.filter((opt) =>
          getTargetProfessions(opt.value).some((profession) => rebookProTypes.includes(profession))
        )
      : categoryOptions;

  useEffect(() => {
    if (categories.length === 0) return;
    const availableValues = new Set(availableCategoryOptions.map((opt) => opt.value));
    if (categories.every((c) => availableValues.has(c))) return;
    setCategories((prev) => prev.filter((c) => availableValues.has(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCategoryOptions.map((opt) => opt.value).join(",")]);

  // Clicked a specific service on a single-category professional's profile —
  // the category isn't ambiguous, so pick it instead of making them reselect it.
  useEffect(() => {
    if (!clickedServiceName || categories.length > 0) return;
    // With the pickers hidden for a specific service, fall back to the pro's
    // first category so the request still has one to file under.
    if (availableCategoryOptions.length !== 1 && !(requestingSpecificService && availableCategoryOptions.length > 0)) return;
    setCategories([availableCategoryOptions[0].value]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedServiceName, availableCategoryOptions.map((opt) => opt.value).join(",")]);

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

  function toggleCategory(value: string) {
    setCategories((prev) => {
      if (prev.includes(value)) {
        setServiceDetailsByCategory((current) => {
          const next = { ...current };
          delete next[value];
          return next;
        });
        return prev.filter((c) => c !== value);
      }
      return [...prev, value];
    });
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
        const upload = await normalizeImageFile(photo.file);
        const fileExt = upload.name.split(".").pop() || "jpg";
        const filePath = `${currentUserId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("request-reference-photos")
          .upload(filePath, upload, {
            upsert: false,
            contentType: upload.type,
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

    if (categories.length === 0) {
      setMessage("Please select at least one service.");
      return;
    }

    const hasAnyServiceDetail = categories.some(
      (c) => (serviceDetailsByCategory[c] || []).length > 0
    );

    if (!hasAnyServiceDetail && !otherServiceDetail.trim()) {
      setMessage("Please select at least one service type, or describe what you need.");
      return;
    }

    if (!title.trim()) {
      setMessage("Please enter a title.");
      return;
    }

    if (containsProfanity(title) || containsProfanity(description) || containsProfanity(otherServiceDetail)) {
      setMessage("Please remove inappropriate language from your request before posting.");
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

    const targetProfessions = Array.from(
      new Set(categories.flatMap((c) => getTargetProfessions(c)))
    );

    const detailByCategoryText = categories
      .map((c) => {
        const details = serviceDetailsByCategory[c] || [];
        if (details.length === 0) return null;
        const label = categoryOptions.find((opt) => opt.value === c)?.label || c;
        return `${label}: ${details.join(", ")}`;
      })
      .filter(Boolean);

    const finalServiceDetail = [...detailByCategoryText, otherServiceDetail.trim()]
      .filter(Boolean)
      .join(" • ");

    try {
      const referencePhotoUrls = await uploadReferencePhotos(userId);

      const directRebook = isRebook && !!preferredProfessionalId;
      const shouldUseCustomerLocation = serviceModes.includes("at_home");

      const { data: insertedRequest, error: insertRequestError } = await supabase
        .from("service_requests")
        .insert([
          {
            client_id: userId,
            category: categories[0],
            categories,
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

      // The pro's notification (in-app, push, email) comes from this route
      // alone — inserting one here as well showed up as a duplicate.
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

  const serviceModeOptions = [
    { value: "at_home", label: "At my place", sub: "Pro comes to you" },
    { value: "in_shop", label: "Their shop", sub: "You go to them" },
    { value: "home_studio", label: "Home studio", sub: "At their home" },
  ];

  return (
    <>

      <main className="min-h-screen bg-paper pb-20">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

          {/* Page header. "Rebook" only for a repeat client (started from a
              past job); any other request aimed at one pro is a direct request. */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              {isRebook ? (originalRequestId ? "Rebook" : "Direct request") : "New Request"}
            </p>
            <h1 className="mt-2 text-neutral-900 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              {isRebook ? (originalRequestId ? "Book again" : `Request ${rebookProName || "this professional"}`) : "Post a request"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-neutral-500">
              {isRebook
                ? `Send a new request directly to ${rebookProName || "this professional"}.`
                : "Describe what you need and professionals will send you offers."}
            </p>
          </div>

          {/* Direct request / rebook banner */}
          {isRebook && preferredProfessionalId ? (
            <div className="mb-6 rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
              <p className="text-sm font-semibold text-ink">
                {originalRequestId ? "Rebooking" : "Direct request to"} {rebookProName || "this professional"}
              </p>
              <p className="mt-0.5 text-sm text-ink">
                This request will be sent directly to them first.
              </p>
            </div>
          ) : null}

          {/* Form card */}
          <div className="rounded-panel border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

              {requestingSpecificService ? (
                <div>
                  <label className={labelClass}>Service</label>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-neutral-900">{clickedServiceName}</p>
                      <p className="mt-0.5 text-sm text-neutral-500">
                        {[
                          clickedServicePrice ? `$${String(clickedServicePrice).replace(/^\$/, "")}` : null,
                          rebookProName ? `with ${rebookProName}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <a
                      href={`/requests/new?rebook=1&pro=${preferredProfessionalId}`}
                      className="shrink-0 text-sm font-medium text-neutral-500 underline-offset-2 hover:text-ink hover:underline"
                    >
                      Change
                    </a>
                  </div>
                </div>
              ) : (
                <>
              {/* Service category */}
              <div>
                <label className={labelClass}>Service</label>
                {isRebook && rebookProTypes && rebookProTypes.length > 0 ? (
                  <p className="mb-2 -mt-1 text-xs text-neutral-500">
                    Only showing services {rebookProName || "this professional"} offers.
                  </p>
                ) : (
                  <p className="mb-2 -mt-1 text-xs text-neutral-500">
                    Select more than one if you want a few things done — like lashes and brows together.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {availableCategoryOptions.map((opt) => {
                    const isSelected = categories.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleCategory(opt.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center transition active:scale-[0.97] ${
                          isSelected
                            ? "border-ink bg-ink text-white"
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

              {/* Service type — one column per selected category */}
              {categories.length > 0 ? (
                <div>
                  <label className={labelClass}>Service type</label>
                  <p className="mb-2 -mt-1 text-xs text-neutral-500">
                    Select as many as you like within each service.
                  </p>
                  <div className={`grid gap-5 ${categories.length > 1 ? "sm:grid-cols-2" : ""}`}>
                    {categories.map((c) => {
                      const categoryLabel = categoryOptions.find((opt) => opt.value === c)?.label || c;
                      const selectedForCategory = serviceDetailsByCategory[c] || [];
                      return (
                        <div key={c} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="mb-3 text-sm font-semibold text-neutral-900">{categoryLabel}</p>
                          <div className="space-y-3.5">
                            {serviceDetailGroups[c]?.map((group) => (
                              <div key={group.label}>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                  {group.label}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {group.options.map((option) => {
                                    const isSelected = selectedForCategory.includes(option);
                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => toggleServiceDetail(c, option)}
                                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-[0.97] ${
                                          isSelected
                                            ? "border-ink bg-ink text-white"
                                            : "border-neutral-200 bg-white text-neutral-900 hover:border-neutral-400"
                                        }`}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Don't see it? Type what you need"
                      value={otherServiceDetail}
                      onChange={(e) => setOtherServiceDetail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              ) : null}
                </>
              )}

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
                            ? "border-ink bg-ink text-white"
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
                    <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900">
                        <svg viewBox="0 0 20 20" className="h-3 w-3 text-white" fill="none">
                          <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div className="text-sm">
                        <p className="font-semibold text-neutral-900">Location confirmed</p>
                        <p className="mt-0.5 text-neutral-600">{location}</p>
                      </div>
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
                  role="button"
                  tabIndex={0}
                  aria-label="Add reference photos"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`cursor-pointer rounded-2xl border border-dashed p-6 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    isDragging
                      ? "border-ink bg-neutral-100"
                      : "border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-white"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6 text-neutral-400" fill="none">
                    <path d="M12 16V8M12 8L9 11M12 8L15 11M5 17.5V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    Drop photos here or choose files
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
                        <img loading="lazy" src={photo.previewUrl} alt={photo.name} className="h-32 w-full object-cover" />
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
                className="w-full rounded-full bg-ink py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {uploadingPhotos
                  ? "Uploading photos..."
                  : submitting
                  ? "Posting your request..."
                  : isRebook && originalRequestId
                  ? "Send rebook request"
                  : isRebook
                  ? "Send direct request"
                  : "Post request"}
              </button>

            </form>
          </div>
        </div>
      </main>

      {(submitting || showSuccess) ? (
        <MomentOverlay
          status={showSuccess ? "done" : "working"}
          workingTitle="Posting your request"
          title="Request sent."
          subtitle="Pros nearby are being notified."
          card={
            <MomentCard
              eyebrow="Your request"
              title={title.trim() || "New request"}
              meta={[
                budget.trim() ? `Budget ${formatMomentPrice(budget)}` : null,
                formatMomentDate(preferredDate),
              ]}
            />
          }
        />
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