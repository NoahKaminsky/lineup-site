"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../components/AppNavbar";

type Profile = {
  id: string;
  role: string | null;
  professional_type: string | null;
  service_modes: string[] | null;
  direct_booking_enabled: boolean | null;
  public_availability_enabled: boolean | null;
  default_appointment_duration: number | null;
};

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
  is_active: boolean;
  is_bookable: boolean;
  created_at: string;
};

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

function getGroupedAvailability(windows: AvailabilityWindow[]) {
  return dayLabels.map((day, dayIndex) => ({
    day,
    dayIndex,
    windows: windows
      .filter((window) => window.day_of_week === dayIndex)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
}

export default function ServicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
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

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(45);

  const normalizedType = normalizeProfessionalType(profile?.professional_type);
  const presetServices = suggestedServiceTemplatesByType[normalizedType] || [];
  const groupedAvailability = useMemo(
    () => getGroupedAvailability(availabilityWindows),
    [availabilityWindows]
  );

  useEffect(() => {
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
          "id, role, professional_type, service_modes, direct_booking_enabled, public_availability_enabled, default_appointment_duration"
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      if (profileData.role !== "professional") {
        router.push("/account");
        return;
      }

      setProfile(profileData as Profile);
      setServiceModes(profileData.service_modes || []);
      setDirectBookingEnabled(Boolean(profileData.direct_booking_enabled));
      setPublicAvailabilityEnabled(Boolean(profileData.public_availability_enabled));
      setDefaultAppointmentDuration(Number(profileData.default_appointment_duration || 60));

      const { data: availabilityData, error: availabilityError } = await supabase
        .from("professional_availability")
        .select("id, professional_id, day_of_week, start_time, end_time, is_active")
        .eq("professional_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (!availabilityError && availabilityData) {
        setAvailabilityWindows(
          availabilityData.map((row) => ({
            id: row.id,
            professional_id: row.professional_id,
            day_of_week: Number(row.day_of_week),
            start_time: normalizeTime(row.start_time),
            end_time: normalizeTime(row.end_time),
            is_active: Boolean(row.is_active),
            local_id: row.id || makeLocalId(),
          }))
        );
      }

      const { data: servicesData, error: servicesError } = await supabase
        .from("professional_services")
        .select(
          "id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at"
        )
        .eq("professional_id", user.id)
        .order("created_at", { ascending: true });

      if (!servicesError && servicesData) {
        setServices(servicesData as ProfessionalService[]);
      }

      setLoading(false);
    }

    loadPage();
  }, [router]);

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
          is_active: true,
          is_bookable: true,
        })
        .select(
          "id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at"
        )
        .single();

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data) setServices((prev) => [...prev, data as ProfessionalService]);
      setNewServiceName("");
      setNewServiceDuration(45);
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
          is_active: true,
          is_bookable: true,
        })
        .select(
          "id, professional_id, service_name, duration_minutes, is_active, is_bookable, created_at"
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

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        service_modes: serviceModes,
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
            direct_booking_enabled: directBookingEnabled,
            public_availability_enabled: publicAvailabilityEnabled,
            default_appointment_duration: defaultAppointmentDuration,
          }
        : prev
    );

    setSaving(false);
    setMessage("Services and availability updated.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <Navbar />
        <div className="mx-auto max-w-6xl py-16">
          <p className="text-neutral-500">Loading services...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <Navbar />

      <div className="mx-auto max-w-6xl py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Services & Availability
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Manage your bookable setup
            </h1>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            {message}
          </div>
        ) : null}

        {presetServices.length > 0 ? (
          <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Quick add
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Common services
            </h2>

            <div className="mt-6 flex flex-wrap gap-3">
              {presetServicesWithExistingState.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  disabled={serviceSaving || template.exists}
                  onClick={() => handleAddPresetService(template)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    template.exists
                      ? "cursor-not-allowed border border-neutral-200 bg-white text-neutral-400"
                      : "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  {template.exists
                    ? `${template.name} added`
                    : `${template.name} • ${template.duration} min`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Add service
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_0.8fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Service name
              </label>
              <input
                type="text"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Haircut, Beard Trim, Gel Set, Brow Wax..."
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Duration
              </label>
              <select
                value={newServiceDuration}
                onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                {[15, 20, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} min</option>
                ))}
              </select>
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
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Services
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Services offered
          </h2>

          {services.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
              No services added yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {services.map((service) => (
                <div key={service.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-neutral-900">{service.service_name}</p>
                      <p className="mt-1 text-sm text-neutral-500">{service.duration_minutes} minutes</p>
                    </div>
                    <button type="button" onClick={() => handleDeleteService(service.id)} className="text-sm font-medium text-red-600 transition hover:text-red-700">
                      Delete
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">Bookable on profile</p>
                      <p className="mt-1 text-xs text-neutral-500">Controls whether customers can select this service after clicking an open time.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBookable(service.id, !service.is_bookable)}
                      className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                        service.is_bookable
                          ? "bg-black text-white hover:opacity-90"
                          : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                      }`}
                    >
                      {service.is_bookable ? "Bookable" : "Hidden"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Service modes
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
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

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Booking settings
          </p>

          <div className="mt-6 space-y-4">
            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-neutral-900">Allow instant booking</p>
                <p className="mt-1 text-sm text-neutral-500">Customers can book from open times on your profile.</p>
              </div>
              <input type="checkbox" checked={directBookingEnabled} onChange={(e) => setDirectBookingEnabled(e.target.checked)} className="h-5 w-5 accent-black" />
            </label>

            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="pr-4">
                <p className="text-sm font-medium text-neutral-900">Show availability publicly</p>
                <p className="mt-1 text-sm text-neutral-500">Display your open times on your public profile.</p>
              </div>
              <input type="checkbox" checked={publicAvailabilityEnabled} onChange={(e) => setPublicAvailabilityEnabled(e.target.checked)} className="h-5 w-5 accent-black" />
            </label>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <label className="mb-2 block text-sm font-medium text-neutral-900">Default slot length shown on profile</label>
              <select
                value={defaultAppointmentDuration}
                onChange={(e) => setDefaultAppointmentDuration(Number(e.target.value))}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                {[30, 45, 60, 75, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} minutes</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Weekly availability</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Set your open windows</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
                Add multiple windows per day if your schedule is split up. For example, Monday 9–12 and Monday 3–6.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {groupedAvailability.map((group) => (
              <div key={group.dayIndex} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-[140px]">
                    <p className="text-base font-semibold text-neutral-900">{group.day}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {group.windows.length === 0
                        ? "Closed"
                        : `${group.windows.length} open ${group.windows.length === 1 ? "window" : "windows"}`}
                    </p>
                  </div>

                  <div className="flex-1 space-y-3">
                    {group.windows.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                        No windows yet.
                      </div>
                    ) : (
                      group.windows.map((window) => (
                        <div key={window.local_id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Start</label>
                              <input
                                type="time"
                                value={window.start_time}
                                onChange={(e) => updateAvailabilityWindow(window.local_id, "start_time", e.target.value)}
                                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">End</label>
                              <input
                                type="time"
                                value={window.end_time}
                                onChange={(e) => updateAvailabilityWindow(window.local_id, "end_time", e.target.value)}
                                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAvailabilityWindow(window.local_id)}
                              className="rounded-full border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                          <p className="mt-3 text-xs text-neutral-500">
                            {formatTime(window.start_time)} - {formatTime(window.end_time)}
                          </p>
                        </div>
                      ))
                    )}

                    <button
                      type="button"
                      onClick={() => addAvailabilityWindow(group.dayIndex)}
                      className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                    >
                      + Add window
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
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
      </div>
    </main>
  );
}
