"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";
import TimeSelect from "@/app/components/TimeSelect";

type Profile = {
  id: string;
  role: string | null;
  professional_type: string | null;
  service_modes: string[] | string | null;
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  default_appointment_duration: number | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
};

function isSubscribedToSchedule(profile: { subscription_status?: string | null; subscription_plan?: string | null }) {
  const subscribed =
    profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return subscribed && !!profile.subscription_plan && profile.subscription_plan !== "basic";
}

type AvailabilityWindow = {
  id?: string;
  professional_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  local_id: string;
};

type ProfessionalService = {
  id: string;
  professional_id: string;
  service_name: string;
  duration_minutes: number;
  price: number | null;
  description: string | null;
  is_active: boolean;
  is_bookable: boolean;
  created_at: string;
};

type ServiceDraft = {
  service_name: string;
  duration_minutes: string;
  price: string;
  description: string;
};

type ServicesCache = {
  profile: Profile;
  services: ProfessionalService[];
  serviceModes: string[];
  directBookingEnabled: boolean;
  publicAvailabilityEnabled: boolean;
  defaultAppointmentDuration: number;
  availabilityWindows: AvailabilityWindow[];
  location: string;
  locationLat: number | null;
  locationLng: number | null;
  locationPlaceId: string;
};

function makeBlankServiceDraft(): ServiceDraft {
  return {
    service_name: "",
    duration_minutes: "45",
    price: "",
    description: "",
  };
}

function serviceToDraft(service: ProfessionalService): ServiceDraft {
  return {
    service_name: service.service_name || "",
    duration_minutes: String(service.duration_minutes || 45),
    price:
      service.price === null || service.price === undefined
        ? ""
        : String(service.price),
    description: service.description || "",
  };
}

type ServiceTemplate = {
  name: string;
  duration: number;
};

const modeOptions = ["at_home", "in_shop", "home_studio"];

const suggestedServiceTemplatesByType: Record<string, ServiceTemplate[]> = {
  barber: [
    { name: "Haircut", duration: 45 },
    { name: "Fade", duration: 45 },
    { name: "Taper Fade", duration: 45 },
    { name: "Skin Fade", duration: 50 },
    { name: "Beard Trim", duration: 20 },
    { name: "Haircut + Beard Trim", duration: 60 },
    { name: "Line Up", duration: 20 },
    { name: "Kids Haircut", duration: 30 },
  ],
  hairstylist: [
    { name: "Women’s Haircut", duration: 60 },
    { name: "Men’s Haircut", duration: 45 },
    { name: "Blowout", duration: 45 },
    { name: "Wash + Style", duration: 45 },
    { name: "Roots Touch-Up", duration: 90 },
    { name: "Full Color", duration: 120 },
    { name: "Highlights", duration: 150 },
    { name: "Toner", duration: 45 },
  ],
  nail_tech: [
    { name: "Gel Manicure", duration: 45 },
    { name: "Acrylic Full Set", duration: 90 },
    { name: "Acrylic Fill", duration: 60 },
    { name: "BIAB", duration: 60 },
    { name: "Nail Art", duration: 30 },
    { name: "Gel Polish Change", duration: 30 },
    { name: "Pedicure", duration: 60 },
    { name: "French Set", duration: 75 },
  ],
  lash_artist: [
    { name: "Classic Full Set", duration: 90 },
    { name: "Hybrid Full Set", duration: 105 },
    { name: "Volume Full Set", duration: 120 },
    { name: "Mega Volume Full Set", duration: 135 },
    { name: "Classic Fill", duration: 60 },
    { name: "Hybrid Fill", duration: 75 },
    { name: "Volume Fill", duration: 90 },
    { name: "Lash Lift", duration: 60 },
  ],
  brow_artist: [
    { name: "Brow Wax", duration: 20 },
    { name: "Brow Tint", duration: 20 },
    { name: "Brow Wax + Tint", duration: 30 },
    { name: "Brow Lamination", duration: 45 },
    { name: "Lamination + Tint", duration: 60 },
    { name: "Brow Shaping", duration: 20 },
    { name: "Henna Brows", duration: 45 },
    { name: "Ombre Brows", duration: 120 },
  ],
  esthetician: [
    { name: "Facial", duration: 60 },
    { name: "Dermaplaning", duration: 45 },
    { name: "Brazilian Wax", duration: 30 },
    { name: "Bikini Wax", duration: 20 },
    { name: "Underarm Wax", duration: 15 },
    { name: "Full Leg Wax", duration: 60 },
    { name: "Half Leg Wax", duration: 30 },
    { name: "Arm Wax", duration: 30 },
  ],
  makeup_artist: [
    { name: "Soft Glam", duration: 60 },
    { name: "Full Glam", duration: 90 },
    { name: "Bridal Makeup", duration: 90 },
    { name: "Event Makeup", duration: 60 },
    { name: "Photoshoot Makeup", duration: 75 },
    { name: "Trial Makeup", duration: 60 },
  ],
  body_sugaring: [
    { name: "Brazilian Sugaring", duration: 30 },
    { name: "Bikini Sugaring", duration: 20 },
    { name: "Underarm Sugaring", duration: 15 },
    { name: "Full Leg Sugaring", duration: 60 },
    { name: "Half Leg Sugaring", duration: 30 },
    { name: "Arm Sugaring", duration: 30 },
    { name: "Full Body Sugaring", duration: 90 },
  ],
};

const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeProfessionalType(value: string | null | undefined) {
  return String(value || "").toLowerCase().replaceAll(" ", "_");
}

function normalizeTime(time: string) {
  return String(time || "").slice(0, 5);
}

function formatTime(time: string) {
  const [hourString, minute = "00"] = normalizeTime(time).split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
}

function formatPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Price not set";

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return "Price not set";

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatModeLabel(mode: string) {
  if (mode === "at_home") return "At-home services";
  if (mode === "in_shop") return "In-shop services";
  if (mode === "home_studio") return "Home studio";
  return mode.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShortAddress(address: string | null | undefined) {
  if (!address?.trim()) return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      primary: parts[0],
      secondary: parts.slice(1, 3).join(", "),
      full: address,
    };
  }

  return { primary: address, secondary: null, full: address };
}

function getMapsUrl(lat?: number | null, lng?: number | null, address?: string | null) {
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  if (address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return null;
}

function getGroupedAvailability(windows: AvailabilityWindow[]) {
  return dayLabels.map((day, dayIndex) => ({
    day,
    dayIndex,
    windows: windows
      .filter((window) => window.day_of_week === dayIndex)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
}

type LocationSuggestion = {
  placeId: string;
  text: string;
};

type SelectedLocation = {
  placeId: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
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
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    setInput(value || "");
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

  async function handleSelect(suggestion: LocationSuggestion) {
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
        throw new Error(data?.error || "Could not load place details");
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

      const lat = Number.isFinite(Number(rawLat)) ? Number(rawLat) : null;
      const lng = Number.isFinite(Number(rawLng)) ? Number(rawLng) : null;
      const formattedAddress =
        data.formattedAddress ??
        data.formatted_address ??
        data.address ??
        data.displayName?.text ??
        suggestion.text;
      const placeId = data.placeId ?? data.place_id ?? suggestion.placeId;

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
        lat: null,
        lng: null,
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
        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-black"
      />

      {loading ? (
        <p className="mt-2 text-xs text-neutral-500">Searching...</p>
      ) : lookupError ? (
        <p className="mt-2 text-xs text-red-600">{lookupError}</p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
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


function AccordionSection({
  title,
  subtitle,
  summary,
  defaultOpen = false,
  id,
  children,
}: {
  title: string;
  subtitle?: string;
  summary?: string;
  defaultOpen?: boolean;
  id?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="mt-5 scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-neutral-50 sm:px-6"
      >
        <div className="min-w-0">
          {subtitle ? (
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              {subtitle}
            </p>
          ) : null}

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
            {title}
          </h2>

          {summary ? (
            <p className="mt-1 text-sm leading-6 text-neutral-500">{summary}</p>
          ) : null}
        </div>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-2xl font-light transition ${
            open ? "rotate-45 bg-black text-white" : "bg-white text-neutral-900"
          }`}
        >
          +
        </span>
      </button>

      {open ? <div className="border-t border-neutral-100 p-5 sm:p-6">{children}</div> : null}
    </section>
  );
}

export default function ServicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<ServicesCache>("services-page"));
  const [saving, setSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [services, setServices] = useState<ProfessionalService[]>([]);
  const [serviceModes, setServiceModes] = useState<string[]>([]);
  const [directBookingEnabled, setDirectBookingEnabled] = useState(false);
  const [publicAvailabilityEnabled, setPublicAvailabilityEnabled] = useState(false);
  const [defaultAppointmentDuration, setDefaultAppointmentDuration] = useState(60);
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);
  const [location, setLocation] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationPlaceId, setLocationPlaceId] = useState("");

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(45);
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, ServiceDraft>>({});

  const normalizedType = normalizeProfessionalType(profile?.professional_type);
  const presetServices = suggestedServiceTemplatesByType[normalizedType] || [];
  const groupedAvailability = useMemo(
    () => getGroupedAvailability(availabilityWindows),
    [availabilityWindows]
  );

  const isSubscribed = profile ? isSubscribedToSchedule(profile) : false;

  const needsBusinessLocation =
    serviceModes.includes("in_shop") || serviceModes.includes("home_studio");
  const hasGoogleBusinessLocation = !!locationPlaceId;
  const hasBusinessCoordinates = typeof locationLat === "number" && typeof locationLng === "number";
  const displayedBusinessAddress = formatShortAddress(location);
  const businessMapsUrl = getMapsUrl(locationLat, locationLng, location);

  useEffect(() => {
    const cached = getCached<ServicesCache>("services-page");
    if (cached) {
      setProfile(cached.profile);
      setServices(cached.services);
      setServiceModes(cached.serviceModes);
      setDirectBookingEnabled(cached.directBookingEnabled);
      setPublicAvailabilityEnabled(cached.publicAvailabilityEnabled);
      setDefaultAppointmentDuration(cached.defaultAppointmentDuration);
      setAvailabilityWindows(cached.availabilityWindows);
      setLocation(cached.location);
      setLocationLat(cached.locationLat);
      setLocationLng(cached.locationLng);
      setLocationPlaceId(cached.locationPlaceId);
    }

    async function loadPage() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, role, professional_type, service_modes, direct_booking_enabled, public_availability_enabled, default_appointment_duration, formatted_address, location_lat, location_lng, location_place_id, subscription_status, subscription_plan"
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const normalizedRole = String(profileData.role || "").toLowerCase().trim();
      const isProfessional = !!normalizedRole && !normalizedRole.includes("customer");

      if (!isProfessional) {
        router.push("/account");
        return;
      }

      const resolvedServiceModes = Array.isArray(profileData.service_modes)
        ? profileData.service_modes
        : profileData.service_modes
        ? [profileData.service_modes]
        : [];

      setProfile(profileData as Profile);
      setServiceModes(resolvedServiceModes);
      setDirectBookingEnabled(Boolean(profileData.direct_booking_enabled));
      setPublicAvailabilityEnabled(Boolean(profileData.public_availability_enabled));
      setDefaultAppointmentDuration(Number(profileData.default_appointment_duration || 60));
      setLocation(profileData.formatted_address || "");
      setLocationLat(profileData.location_lat ?? null);
      setLocationLng(profileData.location_lng ?? null);
      setLocationPlaceId(profileData.location_place_id || "");

      const { data: availabilityData, error: availabilityError } = await supabase
        .from("professional_availability")
        .select("id, professional_id, day_of_week, start_time, end_time, is_active")
        .eq("professional_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      const resolvedAvailability = !availabilityError && availabilityData
        ? availabilityData.map((row) => ({
            id: row.id,
            professional_id: row.professional_id,
            day_of_week: Number(row.day_of_week),
            start_time: normalizeTime(row.start_time),
            end_time: normalizeTime(row.end_time),
            is_active: Boolean(row.is_active),
            local_id: row.id || makeLocalId(),
          }))
        : [];

      setAvailabilityWindows(resolvedAvailability);

      const { data: servicesData, error: servicesError } = await supabase
        .from("professional_services")
        .select(
          "id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at"
        )
        .eq("professional_id", user.id)
        .order("created_at", { ascending: true });

      const resolvedServices = !servicesError && servicesData
        ? (servicesData as ProfessionalService[])
        : [];

      setServices(resolvedServices);

      setCached<ServicesCache>("services-page", {
        profile: profileData as Profile,
        services: resolvedServices,
        serviceModes: resolvedServiceModes,
        directBookingEnabled: Boolean(profileData.direct_booking_enabled),
        publicAvailabilityEnabled: Boolean(profileData.public_availability_enabled),
        defaultAppointmentDuration: Number(profileData.default_appointment_duration || 60),
        availabilityWindows: resolvedAvailability,
        location: profileData.formatted_address || "",
        locationLat: profileData.location_lat ?? null,
        locationLng: profileData.location_lng ?? null,
        locationPlaceId: profileData.location_place_id || "",
      });

      setLoading(false);
    }

    loadPage();
  }, [router]);

  useEffect(() => {
    setServiceDrafts((prev) => {
      const next: Record<string, ServiceDraft> = {};

      services.forEach((service) => {
        next[service.id] = prev[service.id] || serviceToDraft(service);
      });

      return next;
    });
  }, [services]);

  const presetServicesWithExistingState = useMemo(() => {
    return presetServices.map((template) => {
      const exists = services.some(
        (service) =>
          service.service_name.trim().toLowerCase() === template.name.trim().toLowerCase()
      );
      return { ...template, exists };
    });
  }, [presetServices, services]);

  function toggleServiceMode(mode: string) {
    setServiceModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  function addAvailabilityWindow(dayIndex: number) {
    setAvailabilityWindows((prev) => [
      ...prev,
      {
        day_of_week: dayIndex,
        start_time: "09:00",
        end_time: "12:00",
        is_active: true,
        local_id: makeLocalId(),
      },
    ]);
  }

  function updateAvailabilityWindow(
    localId: string,
    field: "start_time" | "end_time" | "is_active",
    value: string | boolean
  ) {
    setAvailabilityWindows((prev) =>
      prev.map((window) =>
        window.local_id === localId ? { ...window, [field]: value } : window
      )
    );
  }

  function removeAvailabilityWindow(localId: string) {
    setAvailabilityWindows((prev) => prev.filter((window) => window.local_id !== localId));
  }

  async function handleAddService() {
    try {
      if (!profile) return;
      const cleanName = newServiceName.trim();

      if (!cleanName) {
        setMessage("Please enter a service name.");
        return;
      }

      const exists = services.some(
        (service) => service.service_name.trim().toLowerCase() === cleanName.toLowerCase()
      );

      if (exists) {
        setMessage("That service already exists.");
        return;
      }

      setServiceSaving(true);
      setMessage("");

      const { data, error } = await supabase
        .from("professional_services")
        .insert({
          professional_id: profile.id,
          service_name: cleanName,
          duration_minutes: newServiceDuration,
          price: newServicePrice.trim() ? Number(newServicePrice) : null,
          description: newServiceDescription.trim() || null,
          is_active: true,
          is_bookable: true,
        })
        .select(
          "id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at"
        )
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data) setServices((prev) => [...prev, data as ProfessionalService]);
      setNewServiceName("");
      setNewServiceDuration(45);
      setNewServicePrice("");
      setNewServiceDescription("");
      setMessage("Service added.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong adding the service.");
    } finally {
      setServiceSaving(false);
    }
  }

  async function handleAddPresetService(template: ServiceTemplate) {
    try {
      if (!profile) return;
      const exists = services.some(
        (service) =>
          service.service_name.trim().toLowerCase() === template.name.trim().toLowerCase()
      );

      if (exists) {
        setMessage(`${template.name} is already in your services.`);
        return;
      }

      setServiceSaving(true);
      setMessage("");

      const { data, error } = await supabase
        .from("professional_services")
        .insert({
          professional_id: profile.id,
          service_name: template.name,
          duration_minutes: template.duration,
          price: null,
          description: null,
          is_active: true,
          is_bookable: true,
        })
        .select(
          "id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at"
        )
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data) setServices((prev) => [...prev, data as ProfessionalService]);
      setMessage(`${template.name} added.`);
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong adding that preset service.");
    } finally {
      setServiceSaving(false);
    }
  }

  function updateServiceDraft(
    serviceId: string,
    field: keyof ServiceDraft,
    value: string
  ) {
    setServiceDrafts((prev) => ({
      ...prev,
      [serviceId]: {
        ...makeBlankServiceDraft(),
        ...(prev[serviceId] || {}),
        [field]: value,
      },
    }));
  }

  async function handleUpdateService(serviceId: string) {
    const draft = serviceDrafts[serviceId];

    if (!draft) return;

    const cleanName = draft.service_name.trim();
    const duration = Number(draft.duration_minutes);
    const price = draft.price.trim() ? Number(draft.price) : null;

    if (!cleanName) {
      setMessage("Service name cannot be empty.");
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      setMessage("Service duration must be valid.");
      return;
    }

    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setMessage("Service price must be valid.");
      return;
    }

    try {
      setMessage("");

      const { data, error } = await supabase
        .from("professional_services")
        .update({
          service_name: cleanName,
          duration_minutes: duration,
          price,
          description: draft.description.trim() || null,
        })
        .eq("id", serviceId)
        .select(
          "id, professional_id, service_name, duration_minutes, price, description, is_active, is_bookable, created_at"
        )
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data) {
        setServices((prev) =>
          prev.map((service) =>
            service.id === serviceId ? (data as ProfessionalService) : service
          )
        );
      }

      setMessage("Service updated.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong updating this service.");
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm("Delete this service?")) return;

    try {
      setMessage("");
      const { error } = await supabase
        .from("professional_services")
        .delete()
        .eq("id", serviceId);

      if (error) {
        setMessage(error.message);
        return;
      }

      setServices((prev) => prev.filter((service) => service.id !== serviceId));
      setMessage("Service deleted.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong deleting this service.");
    }
  }

  async function handleToggleBookable(serviceId: string, nextValue: boolean) {
    try {
      setMessage("");
      const { error } = await supabase
        .from("professional_services")
        .update({ is_bookable: nextValue })
        .eq("id", serviceId);

      if (error) {
        setMessage(error.message);
        return;
      }

      setServices((prev) =>
        prev.map((service) =>
          service.id === serviceId ? { ...service, is_bookable: nextValue } : service
        )
      );
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong updating this service.");
    }
  }

  async function handleSaveSettings() {
    if (!profile) return;

    setSaving(true);
    setMessage("");

    const activeAvailabilityRows = availabilityWindows
      .filter((window) => window.is_active)
      .map((window) => ({
        professional_id: profile.id,
        day_of_week: window.day_of_week,
        start_time: window.start_time,
        end_time: window.end_time,
        is_active: true,
      }));

    for (const window of activeAvailabilityRows) {
      if (window.start_time >= window.end_time) {
        setSaving(false);
        setMessage("Each availability window must have an end time later than its start time.");
        return;
      }
    }

    if (needsBusinessLocation && !location.trim()) {
      setSaving(false);
      setMessage("Please enter your shop or studio address before saving.");
      return;
    }

    if (needsBusinessLocation && !locationPlaceId) {
      setSaving(false);
      setMessage("Please select your shop or studio from the Google suggestions before saving so maps and distance work correctly.");
      return;
    }

    if (needsBusinessLocation && (!Number.isFinite(locationLat) || !Number.isFinite(locationLng))) {
      setSaving(false);
      setMessage("Google did not return coordinates for that selection. Please choose a more specific Google suggestion so map preview and distance can work.");
      return;
    }

    const savedFormattedAddress = location.trim() || null;
    const savedLocationLat = Number.isFinite(locationLat) ? locationLat : null;
    const savedLocationLng = Number.isFinite(locationLng) ? locationLng : null;
    const savedLocationPlaceId = locationPlaceId || null;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        service_modes: serviceModes,
        formatted_address: savedFormattedAddress,
        location_lat: savedLocationLat,
        location_lng: savedLocationLng,
        location_place_id: savedLocationPlaceId,
        direct_booking_enabled: directBookingEnabled,
        public_availability_enabled: publicAvailabilityEnabled,
        default_appointment_duration: defaultAppointmentDuration,
      })
      .eq("id", profile.id);

    if (profileError) {
      setSaving(false);
      setMessage(profileError.message);
      return;
    }

    const { error: deleteAvailabilityError } = await supabase
      .from("professional_availability")
      .delete()
      .eq("professional_id", profile.id);

    if (deleteAvailabilityError) {
      setSaving(false);
      setMessage(deleteAvailabilityError.message);
      return;
    }

    if (activeAvailabilityRows.length > 0) {
      const { data, error: insertAvailabilityError } = await supabase
        .from("professional_availability")
        .insert(activeAvailabilityRows)
        .select("id, professional_id, day_of_week, start_time, end_time, is_active");

      if (insertAvailabilityError) {
        setSaving(false);
        setMessage(insertAvailabilityError.message);
        return;
      }

      setAvailabilityWindows(
        (data || []).map((row) => ({
          id: row.id,
          professional_id: row.professional_id,
          day_of_week: Number(row.day_of_week),
          start_time: normalizeTime(row.start_time),
          end_time: normalizeTime(row.end_time),
          is_active: Boolean(row.is_active),
          local_id: row.id || makeLocalId(),
        }))
      );
    } else {
      setAvailabilityWindows([]);
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            service_modes: serviceModes,
            formatted_address: savedFormattedAddress,
            location_lat: savedLocationLat,
            location_lng: savedLocationLng,
            location_place_id: savedLocationPlaceId,
            direct_booking_enabled: directBookingEnabled,
            public_availability_enabled: publicAvailabilityEnabled,
            default_appointment_duration: defaultAppointmentDuration,
          }
        : prev
    );

    setSaving(false);
    setMessage(
      savedLocationLat !== null && savedLocationLng !== null
        ? "Services and availability updated. Business location saved with map coordinates."
        : savedLocationPlaceId
        ? "Services and availability updated. Google location saved, but coordinates are missing, so map preview will not show yet."
        : "Services and availability updated. Business address saved; select a Google suggestion later for map previews."
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">

        <div className="mx-auto max-w-6xl py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="h-3 w-36 animate-pulse rounded-full bg-neutral-200" />
              <div className="mt-3 h-10 w-80 animate-pulse rounded-2xl bg-neutral-200 md:h-12" />
              <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded-full bg-neutral-100" />
            </div>
            <div className="h-11 w-32 animate-pulse rounded-full bg-neutral-200" />
          </div>
          <div className="mt-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[1.5rem] bg-neutral-100" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">


      <div className="mx-auto max-w-6xl py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Services & Availability
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Manage your bookable setup
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
              Keep your services, location, booking settings, and weekly availability organized in one place.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            {message}
          </div>
        ) : null}

        <AccordionSection
          title="Services offered"
          subtitle="Services"
          summary={`${services.length} service${services.length === 1 ? "" : "s"} added`}
          defaultOpen
        >
          {services.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
              No services added yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {services.map((service) => {
                const draft = serviceDrafts[service.id] || serviceToDraft(service);

                return (
                  <div
                    key={service.id}
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-neutral-900">
                          {service.service_name}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {service.duration_minutes} minutes · {formatPrice(service.price)}
                        </p>
                        {service.description ? (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">
                            {service.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleBookable(service.id, !service.is_bookable)}
                          className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                            service.is_bookable
                              ? "bg-black text-white hover:opacity-90"
                              : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {service.is_bookable ? "Bookable" : "Hidden"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteService(service.id)}
                          className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Edit details
                      </p>

                      <div className="mt-4 grid gap-4 md:grid-cols-[1.25fr_0.65fr_0.65fr_auto]">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-neutral-700">
                            Service name
                          </label>
                          <input
                            type="text"
                            value={draft.service_name}
                            onChange={(e) =>
                              updateServiceDraft(service.id, "service_name", e.target.value)
                            }
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-neutral-700">
                            Duration
                          </label>
                          <select
                            value={draft.duration_minutes}
                            onChange={(e) =>
                              updateServiceDraft(service.id, "duration_minutes", e.target.value)
                            }
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                          >
                            {[15, 20, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180].map(
                              (minutes) => (
                                <option key={minutes} value={minutes}>
                                  {minutes} min
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-neutral-700">
                            Price
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.price}
                            onChange={(e) =>
                              updateServiceDraft(service.id, "price", e.target.value)
                            }
                            placeholder="50"
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => handleUpdateService(service.id)}
                            className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-neutral-700">
                          Description
                        </label>
                        <textarea
                          value={draft.description}
                          onChange={(e) =>
                            updateServiceDraft(service.id, "description", e.target.value)
                          }
                          placeholder="Optional short description shown on your public profile."
                          rows={3}
                          className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionSection>

        <AccordionSection
          title="Add a custom service"
          subtitle="Add service"
          summary="Create a new bookable service with duration and price"
        >
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.55fr_0.55fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Service name
              </label>
              <input
                type="text"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Haircut, Beard Trim, Gel Set, Brow Wax..."
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Duration
              </label>
              <select
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                {[15, 20, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Price
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={newServicePrice}
                onChange={(e) => setNewServicePrice(e.target.value)}
                placeholder="50"
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddService}
                disabled={serviceSaving}
                className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {serviceSaving ? "Adding..." : "Add service"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-neutral-700">
              Description
            </label>
            <textarea
              value={newServiceDescription}
              onChange={(e) => setNewServiceDescription(e.target.value)}
              placeholder="Optional short description shown on your public profile."
              rows={3}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
            />
          </div>
        </AccordionSection>

        {presetServices.length > 0 ? (
          <AccordionSection
            title="Common services"
            subtitle="Quick add"
            summary="Add popular services for your category"
          >
            <div className="flex flex-wrap gap-3">
              {presetServicesWithExistingState.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  disabled={serviceSaving || template.exists}
                  onClick={() => handleAddPresetService(template)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    template.exists
                      ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-400"
                      : "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  {template.exists
                    ? `${template.name} added`
                    : `${template.name} • ${template.duration} min`}
                </button>
              ))}
            </div>
          </AccordionSection>
        ) : null}

        <AccordionSection
          title="Shop or studio address"
          subtitle="Business location"
          summary={
            displayedBusinessAddress
              ? displayedBusinessAddress.primary
              : needsBusinessLocation
              ? "Required for in-shop or home studio bookings"
              : "Optional unless you offer location-based bookings"
          }
        >
          <p className="max-w-2xl text-sm leading-6 text-neutral-500">
            This is used for in-shop and home studio bookings. Customers should only see the exact address after a booking is confirmed.
          </p>

          <div className="mt-6">
            <LocationAutocomplete
              label="Where do you operate from?"
              placeholder="Enter your shop, studio, or business address"
              value={location}
              onInputChange={(value) => {
                setLocation(value);

                if (value !== location) {
                  setLocationLat(null);
                  setLocationLng(null);
                  setLocationPlaceId("");
                }

                if (value.trim()) {
                  setMessage(
                    "Address updated. Select a Google suggestion for map previews and distance accuracy, or save as typed."
                  );
                }
              }}
              onSelect={(selected) => {
                const safeAddress = selected.formattedAddress || location;
                const safePlaceId = selected.placeId || locationPlaceId;
                const safeLat = Number.isFinite(selected.lat) ? selected.lat : null;
                const safeLng = Number.isFinite(selected.lng) ? selected.lng : null;

                setLocation(safeAddress);
                setLocationPlaceId(safePlaceId);
                setLocationLat(safeLat);
                setLocationLng(safeLng);
                setMessage(
                  safeLat !== null && safeLng !== null
                    ? "Google location selected with map coordinates. Save services & availability to keep it."
                    : "Google location selected, but coordinates were not returned. Save still works, but map preview needs coordinates."
                );
              }}
            />
          </div>

          {hasGoogleBusinessLocation && displayedBusinessAddress ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                {hasBusinessCoordinates ? "Google location selected with coordinates" : "Google location selected"}
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                📍 {displayedBusinessAddress.primary}
              </p>
              {displayedBusinessAddress.secondary ? (
                <p className="mt-0.5 text-xs text-emerald-700">
                  {displayedBusinessAddress.secondary}
                </p>
              ) : null}
              {hasBusinessCoordinates ? (
                <p className="mt-2 text-xs text-emerald-700">
                  Map coordinates saved: {locationLat?.toFixed(5)}, {locationLng?.toFixed(5)}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">
                  Coordinates are missing, so map previews cannot show yet.
                </p>
              )}
              {businessMapsUrl ? (
                <a
                  href={businessMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  Open in Maps
                </a>
              ) : null}
            </div>
          ) : needsBusinessLocation ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Enter a business address. Selecting a Google suggestion gives the best maps and distance accuracy.
            </p>
          ) : location.trim() ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This address can be saved. Select a Google suggestion if you want map previews and distance accuracy.
            </p>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              Optional unless you offer in-shop or home studio services.
            </p>
          )}
        </AccordionSection>

        <AccordionSection
          title="Service modes"
          subtitle="Where you work"
          summary={
            serviceModes.length > 0
              ? serviceModes.map(formatModeLabel).join(" • ")
              : "Choose how customers can book you"
          }
        >
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
                      : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
                  }`}
                >
                  {formatModeLabel(mode)}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        <AccordionSection
          title="Booking settings"
          subtitle="Direct booking"
          summary={
            directBookingEnabled && publicAvailabilityEnabled
              ? "Instant booking is enabled"
              : "Control direct booking and public availability"
          }
        >
          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-neutral-900">Allow instant booking</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Customers can book from open times on your profile.
                </p>
              </div>
              <input
                type="checkbox"
                checked={directBookingEnabled}
                onChange={(e) => setDirectBookingEnabled(e.target.checked)}
                className="h-5 w-5 accent-black"
              />
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-neutral-900">Show availability publicly</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Display your open times on your public profile.
                </p>
              </div>
              <input
                type="checkbox"
                checked={publicAvailabilityEnabled}
                onChange={(e) => setPublicAvailabilityEnabled(e.target.checked)}
                className="h-5 w-5 accent-black"
              />
            </label>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <label className="mb-2 block text-sm font-medium text-neutral-900">
                Default slot length shown on profile
              </label>
              <select
                value={defaultAppointmentDuration}
                onChange={(e) => setDefaultAppointmentDuration(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                {[30, 45, 60, 75, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="availability"
          title="Set your open windows"
          subtitle="Weekly availability"
          summary={
            isSubscribed
              ? `${availabilityWindows.length} saved availability window${
                  availabilityWindows.length === 1 ? "" : "s"
                }`
              : "Upgrade to set your schedule"
          }
        >
          {!isSubscribed ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
              <p className="text-sm font-semibold text-neutral-900">
                The weekly availability schedule is a paid feature
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Upgrade from Basic to Apprentice, Pro, or Master to set your open hours and let customers book directly from your profile.
              </p>
              <Link
                href="/subscription"
                className="mt-4 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                View plans
              </Link>
            </div>
          ) : (
            <>
          <p className="max-w-2xl text-sm leading-6 text-neutral-500">
            Add multiple windows per day if your schedule is split up. For example, Monday 9–12 and Monday 3–6.
          </p>

          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {groupedAvailability.map((group, i) => (
              <div key={group.dayIndex} className={i > 0 ? "border-t border-neutral-100" : ""}>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <p className="w-24 shrink-0 text-sm font-semibold text-neutral-900">{group.day}</p>
                    <span className={`truncate text-xs font-medium ${group.windows.length > 0 ? "text-emerald-700" : "text-neutral-400"}`}>
                      {group.windows.length === 0
                        ? "Closed"
                        : group.windows.map((w) => `${formatTime(w.start_time)}–${formatTime(w.end_time)}`).join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => addAvailabilityWindow(group.dayIndex)}
                    className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    + Add
                  </button>
                </div>

                {group.windows.length > 0 ? (
                  <div className="space-y-2 px-4 pb-3">
                    {group.windows.map((window) => (
                      <div
                        key={window.local_id}
                        className="grid gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                      >
                        <div className="flex items-center gap-2">
                          <label className="w-8 shrink-0 text-xs font-medium text-neutral-500">From</label>
                          <TimeSelect
                            value={window.start_time}
                            onChange={(value) =>
                              updateAvailabilityWindow(window.local_id, "start_time", value)
                            }
                            selectClassName="w-full rounded-xl border border-neutral-200 bg-white px-1.5 py-2 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="w-8 shrink-0 text-xs font-medium text-neutral-500">To</label>
                          <TimeSelect
                            value={window.end_time}
                            onChange={(value) =>
                              updateAvailabilityWindow(window.local_id, "end_time", value)
                            }
                            selectClassName="w-full rounded-xl border border-neutral-200 bg-white px-1.5 py-2 text-sm outline-none transition focus:border-neutral-900"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAvailabilityWindow(window.local_id)}
                          className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
            </>
          )}
        </AccordionSection>

        <div className="mt-8 flex flex-col gap-3 rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Ready to save?</p>
            <p className="mt-1 text-sm text-neutral-500">
              Save after changing services, location, booking settings, or weekly availability.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save services & availability"}
          </button>
        </div>
      </div>
    </main>
  );
}
