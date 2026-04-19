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

type AvailabilityRow = {
  id?: string;
  professional_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
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

function getDefaultWeeklyAvailability(): AvailabilityRow[] {
  return dayLabels.map((_, index) => ({
    day_of_week: index,
    start_time: "09:00",
    end_time: "17:00",
    is_active: false,
  }));
}

function normalizeProfessionalType(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(" ", "_");
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
  const [weeklyAvailability, setWeeklyAvailability] = useState<AvailabilityRow[]>(
    getDefaultWeeklyAvailability()
  );

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(45);

  const normalizedType = normalizeProfessionalType(profile?.professional_type);
  const presetServices = suggestedServiceTemplatesByType[normalizedType] || [];

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
        .order("day_of_week", { ascending: true });

      if (!availabilityError && availabilityData) {
        const base = getDefaultWeeklyAvailability();

        availabilityData.forEach((row) => {
          const index = Number(row.day_of_week);
          if (index >= 0 && index <= 6) {
            base[index] = {
              id: row.id,
              professional_id: row.professional_id,
              day_of_week: row.day_of_week,
              start_time: String(row.start_time).slice(0, 5),
              end_time: String(row.end_time).slice(0, 5),
              is_active: row.is_active,
            };
          }
        });

        setWeeklyAvailability(base);
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

      return {
        ...template,
        exists,
      };
    });
  }, [presetServices, services]);

  function toggleServiceMode(mode: string) {
    setServiceModes((prev) =>
      prev.includes(mode) ? prev.filter((item) => item !== mode) : [...prev, mode]
    );
  }

  function updateAvailabilityDay(
    dayIndex: number,
    field: "is_active" | "start_time" | "end_time",
    value: boolean | string
  ) {
    setWeeklyAvailability((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              [field]: value,
            }
          : day
      )
    );
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

      if (data) {
        setServices((prev) => [...prev, data as ProfessionalService]);
      }

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

      if (data) {
        setServices((prev) => [...prev, data as ProfessionalService]);
      }

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

    for (const day of weeklyAvailability) {
      if (day.is_active && day.start_time >= day.end_time) {
        setSaving(false);
        setMessage("Each active availability day must have an end time later than the start time.");
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

    const activeAvailabilityRows = weeklyAvailability
      .filter((day) => day.is_active)
      .map((day) => ({
        professional_id: profile.id,
        day_of_week: day.day_of_week,
        start_time: day.start_time,
        end_time: day.end_time,
        is_active: true,
      }));

    if (activeAvailabilityRows.length > 0) {
      const { error: insertAvailabilityError } = await supabase
        .from("professional_availability")
        .insert(activeAvailabilityRows);

      if (insertAvailabilityError) {
        setSaving(false);
        setMessage(insertAvailabilityError.message);
        return;
      }
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
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={75}>75 min</option>
                <option value={90}>90 min</option>
                <option value={105}>105 min</option>
                <option value={120}>120 min</option>
                <option value={135}>135 min</option>
                <option value={150}>150 min</option>
                <option value={180}>180 min</option>
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
                <div
                  key={service.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-neutral-900">
                        {service.service_name}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {service.duration_minutes} minutes
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteService(service.id)}
                      className="text-sm font-medium text-red-600 transition hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        Bookable on profile
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Controls whether customers can select this service after clicking an
                        open time.
                      </p>
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
                <p className="text-sm font-medium text-neutral-900">
                  Allow instant booking
                </p>
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
                <p className="text-sm font-medium text-neutral-900">
                  Show availability publicly
                </p>
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
                onChange={(e) =>
                  setDefaultAppointmentDuration(Number(e.target.value))
                }
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={75}>75 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>120 minutes</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Weekly availability
          </p>

          <div className="mt-6 space-y-4">
            {weeklyAvailability.map((day, index) => (
              <div
                key={day.day_of_week}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={day.is_active}
                      onChange={(e) =>
                        updateAvailabilityDay(index, "is_active", e.target.checked)
                      }
                      className="h-5 w-5 accent-black"
                    />
                    <span className="text-sm font-medium text-neutral-900">
                      {dayLabels[index]}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Start
                      </label>
                      <input
                        type="time"
                        value={day.start_time}
                        disabled={!day.is_active}
                        onChange={(e) =>
                          updateAvailabilityDay(index, "start_time", e.target.value)
                        }
                        className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                        End
                      </label>
                      <input
                        type="time"
                        value={day.end_time}
                        disabled={!day.is_active}
                        onChange={(e) =>
                          updateAvailabilityDay(index, "end_time", e.target.value)
                        }
                        className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      />
                    </div>
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