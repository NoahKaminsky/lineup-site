"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import TimeSelect from "@/app/components/TimeSelect";
import MarkRequestNotificationRead from "@/app/components/MarkRequestNotificationRead";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  service_detail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  formatted_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_place_id?: string | null;
  service_mode: string | null;
  service_modes: string[] | null;
  budget: string | null;
  status: string;
  target_professions: string[] | null;
  created_at: string;
  preferred_date?: string | null;
  preferred_start_time?: string | null;
  preferred_end_time?: string | null;
  timing_flexibility?: string | null;
};

export default function RespondToRequestPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [proposedPrice, setProposedPrice] = useState("");
  const [existingOffer, setExistingOffer] = useState(false);
  const [proProposableModes, setProProposableModes] = useState<string[]>([]);
  const [proposedServiceMode, setProposedServiceMode] = useState("");

  const [timingMode, setTimingMode] = useState<"match" | "different">("match");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedStartTime, setProposedStartTime] = useState("");
  const [proposedEndTime, setProposedEndTime] = useState("");

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setMessage("");

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
        .select("role, service_modes")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const normalizedRole = profile.role?.toLowerCase().trim() || "";
      const isProfessional =
        !!normalizedRole && !normalizedRole.includes("customer");

      if (!isProfessional) {
        router.push(`/requests/${requestId}`);
        return;
      }

      const { data: requestData, error: requestError } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (requestError || !requestData) {
        setMessage("Request not found or you do not have access.");
        setLoading(false);
        return;
      }

      const requestModes =
        requestData.service_modes?.length > 0
          ? requestData.service_modes
          : requestData.service_mode
          ? [requestData.service_mode]
          : [];
      const proModes = Array.isArray(profile.service_modes) ? profile.service_modes : [];
      const overlappingModes = requestModes.filter((mode: string) => proModes.includes(mode));
      const proposableModes = overlappingModes.length > 0 ? overlappingModes : requestModes;

      setProProposableModes(proposableModes);
      if (proposableModes.length === 1) {
        setProposedServiceMode(proposableModes[0]);
      }

      if (requestData.status !== "open") {
        setMessage("This request is no longer accepting new offers.");
        setRequest(requestData);
        setUserId(user.id);
        setLoading(false);
        return;
      }

      const { data: existingOfferData } = await supabase
        .from("request_offers")
        .select("id")
        .eq("request_id", requestId)
        .eq("professional_id", user.id)
        .neq("status", "withdrawn")
        .maybeSingle();

      setExistingOffer(!!existingOfferData);
      setUserId(user.id);
      setRequest(requestData);

      const canUseCustomerTime =
        requestData.timing_flexibility !== "anytime" &&
        !!requestData.preferred_date &&
        !!requestData.preferred_start_time;

      setTimingMode(canUseCustomerTime ? "match" : "different");

      if (requestData.preferred_date) {
        setProposedDate(requestData.preferred_date);
      }
      if (requestData.preferred_start_time) {
        setProposedStartTime(String(requestData.preferred_start_time).slice(0, 5));
      }
      if (requestData.preferred_end_time) {
        setProposedEndTime(String(requestData.preferred_end_time).slice(0, 5));
      }

      setLoading(false);
    }

    if (requestId) {
      loadPage();
    }
  }, [requestId, router]);

  function formatCategory(category: string) {
    return category
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatMode(mode: string | null) {
    if (!mode) return "Not provided";
    if (mode === "in_shop") return "In shop";
    if (mode === "at_home") return "At home";
    if (mode === "home_studio") return "Home studio";
    return mode.replaceAll("_", " ");
  }

  function formatDateOnly(dateString: string) {
    return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-CA", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(timeString: string) {
    const [hourString, minute] = timeString.split(":");
    const hour = Number(hourString);
    const suffix = hour >= 12 ? "PM" : "AM";
    const twelveHour = hour % 12 || 12;
    return `${twelveHour}:${minute} ${suffix}`;
  }

  function formatDisplayAddress(currentRequest: ServiceRequest | null) {
    const rawAddress =
      currentRequest?.formatted_address || currentRequest?.location || "";

    if (!rawAddress.trim()) return "Not provided";

    return rawAddress;
  }

  const customerTimingLabel = useMemo(() => {
    if (!request) return "Not provided";

    if (request.timing_flexibility === "anytime") {
      return "Anytime";
    }

    if (
      request.preferred_date &&
      request.preferred_start_time &&
      request.preferred_end_time
    ) {
      return `${formatDateOnly(request.preferred_date)} • ${formatTime(
        String(request.preferred_start_time).slice(0, 5)
      )} - ${formatTime(String(request.preferred_end_time).slice(0, 5))}`;
    }

    if (request.preferred_date && request.preferred_start_time) {
      return `${formatDateOnly(request.preferred_date)} • ${formatTime(
        String(request.preferred_start_time).slice(0, 5)
      )}`;
    }

    if (request.preferred_date) {
      return formatDateOnly(request.preferred_date);
    }

    return "Not provided";
  }, [request]);

  const timingMetaLabel = useMemo(() => {
    if (!request?.timing_flexibility) return null;
    if (request.timing_flexibility === "exact") return "Exact time requested";
    if (request.timing_flexibility === "flexible") {
      return "Flexible around requested time";
    }
    if (request.timing_flexibility === "anytime") return "Anytime works";
    return request.timing_flexibility;
  }, [request]);

  const canConfirmCustomerTime = useMemo(() => {
    return (
      request?.timing_flexibility !== "anytime" &&
      !!request?.preferred_date &&
      !!request?.preferred_start_time
    );
  }, [request]);

  async function sendOfferCreatedEmail(offerId: string) {
    try {
      const response = await fetch("/api/notifications/offer-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        console.error("Offer email route failed:", data || response.statusText);
      }
    } catch (notificationError) {
      console.error("Offer email failed:", notificationError);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (existingOffer) {
      setMessage("You already submitted an offer for this request.");
      return;
    }

    if (!proposedPrice.trim()) {
      setMessage("Please enter your proposed price.");
      return;
    }

    if (!offerMessage.trim()) {
      setMessage("Please enter a message.");
      return;
    }

    if (proProposableModes.length > 1 && !proposedServiceMode) {
      setMessage("Please choose where you'll do this service.");
      return;
    }

    if (!userId) {
      setMessage("User not found.");
      return;
    }

    if (!request) {
      setMessage("Request not found.");
      return;
    }

    const isMatchingTime = timingMode === "match" && canConfirmCustomerTime;

    const finalProposedDate = isMatchingTime
      ? request.preferred_date || null
      : proposedDate || null;

    const finalProposedStartTime = isMatchingTime
      ? request.preferred_start_time || null
      : proposedStartTime || null;

    const finalProposedEndTime = proposedEndTime || null;

    if (isMatchingTime) {
      if (!finalProposedDate || !finalProposedStartTime) {
        setMessage("This request does not include a customer date and start time. Suggest a different time instead.");
        return;
      }

      if (!finalProposedEndTime) {
        setMessage("Please add an end time so this can be added to your calendar if accepted.");
        return;
      }
    } else {
      if (!finalProposedDate || !finalProposedStartTime || !finalProposedEndTime) {
        setMessage("Please provide a proposed date, start time, and end time.");
        return;
      }
    }

    if (finalProposedEndTime <= finalProposedStartTime) {
      setMessage("End time must be later than start time.");
      return;
    }

    const finalMessage = offerMessage.trim();

    setSubmitting(true);

    const offerPayload = {
      message: finalMessage,
      proposed_price: proposedPrice.trim(),
      status: "pending",
      viewed_by_customer: false,
      proposed_date: finalProposedDate,
      proposed_start_time: finalProposedStartTime,
      proposed_end_time: finalProposedEndTime,
      matches_requested_time: isMatchingTime,
      proposed_service_mode: proposedServiceMode || proProposableModes[0] || null,
    };

    const { data: withdrawnOffer } = await supabase
      .from("request_offers")
      .select("id")
      .eq("request_id", requestId)
      .eq("professional_id", userId)
      .eq("status", "withdrawn")
      .maybeSingle();

    let createdOfferId: string | null = null;

    if (withdrawnOffer?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("request_offers")
        .update(offerPayload)
        .eq("id", withdrawnOffer.id)
        .select("id")
        .single();

      if (updateError) {
        setMessage(updateError.message);
        setSubmitting(false);
        return;
      }

      createdOfferId = updated?.id ?? null;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("request_offers")
        .insert([{ request_id: requestId, professional_id: userId, ...offerPayload }])
        .select("id")
        .single();

      if (insertError) {
        console.error("Offer insert error:", insertError);
        if (insertError.message.toLowerCase().includes("duplicate")) {
          setMessage("You already submitted an offer for this request.");
        } else {
          setMessage(insertError.message);
        }
        setSubmitting(false);
        return;
      }

      createdOfferId = inserted?.id ?? null;
    }

    if (createdOfferId) {
      await sendOfferCreatedEmail(createdOfferId);
    }

    setShowSuccess(true);
    setTimeout(() => router.push(`/requests/${requestId}#offers`), 1500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">

        <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
            <div className="h-3 w-28 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-5 h-7 w-48 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-3 h-8 w-56 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="mt-8 space-y-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
              <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-12 animate-pulse rounded-2xl bg-neutral-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">

        <div className="mx-auto max-w-4xl py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Request not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-white px-6 pb-10 pt-6 text-neutral-900">
      <MarkRequestNotificationRead requestId={requestId} />

      <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Request summary
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {formatCategory(request.category)}
            </span>

            {request.service_detail ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                {request.service_detail}
              </span>
            ) : null}

            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {request.status}
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            {request.title}
          </h1>

          {request.description ? (
            <p className="mt-4 leading-7 text-neutral-600">
              {request.description}
            </p>
          ) : null}

          <div className="mt-6 space-y-4 text-sm text-neutral-700">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Customer preferred time
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {customerTimingLabel}
              </p>
              {timingMetaLabel ? (
                <p className="mt-2 text-sm text-neutral-500">{timingMetaLabel}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Location
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {formatDisplayAddress(request)}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Open to
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {(request.service_modes?.length
                  ? request.service_modes
                  : request.service_mode
                  ? [request.service_mode]
                  : []
                )
                  .map(formatMode)
                  .join(" or ") || "Not provided"}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Budget
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {request.budget || "Not provided"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Send an offer
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Respond to this request
          </h2>

          <p className="mt-4 leading-7 text-neutral-600">
            Include your exact price, explain why you’re a fit, and propose the
            date and time that works for your schedule.
          </p>

          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-600">
            <span className="font-semibold text-neutral-900">Cancellation policy:</span> if this
            offer is accepted, either of you can cancel for a full refund up until 24 hours before
            the appointment. Neither of you can cancel inside that 24-hour window.
          </div>

          {request.status !== "open" ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm font-medium text-amber-700">
                This request is no longer accepting new offers.
              </p>
              <div className="mt-4">
                <Link
                  href={`/requests/${requestId}`}
                  className="inline-flex rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Back to request
                </Link>
              </div>
            </div>
          ) : existingOffer ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm font-medium text-emerald-700">
                You already submitted an offer for this request.
              </p>
              <p className="mt-2 text-sm text-emerald-700/90">
                Go back to the request page to review its status.
              </p>

              <div className="mt-4">
                <Link
                  href={`/requests/${requestId}`}
                  className="inline-flex rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Back to request
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-700">
                  Your price
                </label>
                <input
                  type="text"
                  value={proposedPrice}
                  onChange={(e) => setProposedPrice(e.target.value)}
                  placeholder="$55"
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                />
              </div>

              {proProposableModes.length > 1 ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-neutral-700">
                    Where will you do this?
                  </label>
                  <p className="mb-3 text-xs text-neutral-400">
                    The client said any of these work — pick the one you&apos;re offering.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {proProposableModes.map((mode) => {
                      const isSelected = proposedServiceMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setProposedServiceMode(mode)}
                          className={`rounded-2xl border px-3 py-3 text-sm font-medium transition active:scale-[0.97] ${
                            isSelected
                              ? "border-black bg-black text-white"
                              : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                          }`}
                        >
                          {formatMode(mode)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="mb-3 block text-sm font-semibold text-neutral-700">
                  Timing response
                </label>

                <div className="space-y-4">
                  <div className={`grid gap-3 ${canConfirmCustomerTime ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
                    {canConfirmCustomerTime ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTimingMode("match");
                          if (request.preferred_date) setProposedDate(request.preferred_date);
                          if (request.preferred_start_time) {
                            setProposedStartTime(String(request.preferred_start_time).slice(0, 5));
                          }
                        }}
                        className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                          timingMode === "match"
                            ? "border-black bg-black text-white"
                            : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                        }`}
                      >
                        <p className="font-semibold">Confirm customer’s time</p>
                        <p className={`mt-2 text-sm ${timingMode === "match" ? "text-white/70" : "text-neutral-500"}`}>
                          {customerTimingLabel}
                        </p>
                        <p className={`mt-2 text-xs ${timingMode === "match" ? "text-white/60" : "text-neutral-400"}`}>
                          Add an end time so it can go on your calendar if accepted.
                        </p>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setTimingMode("different")}
                      className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                        timingMode === "different"
                          ? "border-black bg-black text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                      }`}
                    >
                      <p className="font-semibold">Propose your time</p>
                      <p className={`mt-2 text-sm ${timingMode === "different" ? "text-white/70" : "text-neutral-500"}`}>
                        Choose the date, start time, and end time you can offer.
                      </p>
                    </button>
                  </div>

                  {timingMode === "match" && canConfirmCustomerTime ? (
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Customer start time
                      </p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">
                        {customerTimingLabel}
                      </p>

                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-semibold text-neutral-700">
                          Your end time
                        </label>
                        <TimeSelect
                          value={proposedEndTime}
                          onChange={setProposedEndTime}
                          selectClassName="w-full rounded-2xl border border-neutral-200 bg-white px-2 py-3 text-sm outline-none transition focus:border-neutral-900"
                        />
                        <p className="mt-2 text-xs text-neutral-500">
                          This is what blocks your calendar after the customer accepts.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-neutral-700">
                          Date
                        </label>
                        <input
                          type="date"
                          value={proposedDate}
                          onChange={(e) => setProposedDate(e.target.value)}
                          className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-neutral-700">
                          Start time
                        </label>
                        <TimeSelect
                          value={proposedStartTime}
                          onChange={setProposedStartTime}
                          selectClassName="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-2 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-neutral-700">
                          End time
                        </label>
                        <TimeSelect
                          value={proposedEndTime}
                          onChange={setProposedEndTime}
                          selectClassName="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-2 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-neutral-700">
                  Message
                </label>
                <textarea
                  rows={7}
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Hi, I’d be a great fit for this request because..."
                  className="w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                />
              </div>

              {message ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-black py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Sending offer..." : "Send offer"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>

    {(submitting || showSuccess) ? (
      <>
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
          style={{ animation: "lu-overlay-in 0.2s ease forwards" }}
        />
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ animation: "lu-overlay-in 0.25s ease forwards" }}
        >
          <div className="flex w-full max-w-xs flex-col items-center rounded-[2rem] bg-white px-10 py-12 shadow-2xl">
            <div
              className="h-28 w-28"
              style={{
                animation: showSuccess
                  ? "lu-logo-reveal 0.85s cubic-bezier(0.4,0,0.2,1) forwards"
                  : "lu-logo-reveal 0.85s cubic-bezier(0.4,0,0.2,1) forwards, lu-pulse-opacity 1.8s ease-in-out 1.4s infinite",
              }}
            >
              <svg viewBox="0 0 1024 1024" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <clipPath id="lu-sweep-offer">
                    <rect x="0" y="0" height="1024" width="0">
                      <animate attributeName="width" from="0" to="1024" dur="0.85s" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" fill="freeze" />
                    </rect>
                  </clipPath>
                </defs>
                <g clipPath="url(#lu-sweep-offer)">
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
                <p className="text-sm font-medium text-neutral-500">Offer sent</p>
              </div>
            ) : (
              <p
                className="mt-6 text-sm text-neutral-400"
                style={{ animation: "lu-success-rise 0.3s ease 0.5s both" }}
              >
                Sending your offer…
              </p>
            )}
          </div>
        </div>
      </>
    ) : null}
  </>
  );
}
