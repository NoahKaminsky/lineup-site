"use client";

import { fetchBusyTimes } from "@/app/lib/fetchBusyTimes";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import TimeSelect from "@/app/components/TimeSelect";
import MarkRequestNotificationRead from "@/app/components/MarkRequestNotificationRead";
import { containsProfanity } from "@/app/lib/profanityFilter";
import { isVerifiedNow } from "@/app/lib/verificationRules";
import { MomentCard, MomentOverlay, formatMomentDate, formatMomentPrice } from "@/app/components/moments/Moments";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  categories?: string[] | null;
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
  const [needsVerification, setNeedsVerification] = useState(false);
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

      const user = await getSignedInUser();

      if (!user) {
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

      // Separate, best-effort read so a problem here never blocks the page load.
      const { data: verificationRow, error: verificationError } = await supabase
        .from("profiles")
        .select("verification_status, verified_until")
        .eq("id", user.id)
        .maybeSingle();

      if (!verificationError && verificationRow) {
        setNeedsVerification(!isVerifiedNow(verificationRow));
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
        .in("status", ["pending", "payment_pending", "accepted"])
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
    if (mode === "at_home") return "Mobile (client's place)";
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

    if (needsVerification) {
      setMessage("Verify your credentials before sending offers.");
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

    if (containsProfanity(offerMessage)) {
      setMessage("Please remove inappropriate language from your message before sending.");
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

    // Don't offer a time that's already taken by another booking (from the
    // calendar or another request) — the client couldn't pay for it anyway.
    if (userId && finalProposedDate) {
      const busy = await fetchBusyTimes([userId], finalProposedDate, finalProposedDate);
      const clash = (busy || []).find(
        (row) =>
          String(finalProposedStartTime).slice(0, 5) < row.end_time &&
          String(finalProposedEndTime).slice(0, 5) > row.start_time
      );
      if (clash) {
        setMessage(
          clash.start_time === "00:00" && clash.end_time === "24:00"
            ? "You marked that day as time off. Pick another day, or remove the time off in Services."
            : `You already have a booking from ${clash.start_time} to ${clash.end_time} that day. Pick a time that doesn't overlap it.`
        );
        return;
      }
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

    const { data: reusableOffer } = await supabase
      .from("request_offers")
      .select("id")
      .eq("request_id", requestId)
      .eq("professional_id", userId)
      .in("status", ["withdrawn", "declined"])
      .maybeSingle();

    let createdOfferId: string | null = null;

    if (reusableOffer?.id) {
      const { data: updated, error: updateError } = await supabase
        .from("request_offers")
        .update({ ...offerPayload, customer_response_message: null, responded_at: null })
        .eq("id", reusableOffer.id)
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
      <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10 text-neutral-900">

        <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-6">
            <div className="h-3 w-28 animate-pulse rounded-full bg-neutral-200" />
            <div className="mt-5 h-7 w-48 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-neutral-100" />
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          </div>
          <div className="rounded-panel border border-neutral-200 bg-white p-8 shadow-sm">
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
      <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10 text-neutral-900">

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
    <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper pb-10 pt-6 text-neutral-900">
      <MarkRequestNotificationRead requestId={requestId} />

      <div className="mx-auto grid max-w-6xl gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Request summary
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {(request.categories?.length ? request.categories : [request.category]).map((c) => (
              <span
                key={c}
                className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700"
              >
                {formatCategory(c)}
              </span>
            ))}

            {request.service_detail ? (
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
                {request.service_detail}
              </span>
            ) : null}

            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-neutral-700">
              {request.status}
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
            {request.title}
          </h1>

          {request.description ? (
            <p className="mt-4 leading-7 text-neutral-600">
              {request.description}
            </p>
          ) : null}

          <div className="mt-6 space-y-4 text-sm text-neutral-700">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
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
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
                Location
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {formatDisplayAddress(request)}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
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
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
                Budget
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {request.budget || "Not provided"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-panel border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
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
                  className="inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  Back to request
                </Link>
              </div>
            </div>
          ) : existingOffer ? (
            <div className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-100 p-5">
              <p className="text-sm font-medium text-ink">
                You already submitted an offer for this request.
              </p>
              <p className="mt-2 text-sm text-ink/90">
                Go back to the request page to review its status.
              </p>

              <div className="mt-4">
                <Link
                  href={`/requests/${requestId}`}
                  className="inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  Back to request
                </Link>
              </div>
            </div>
          ) : needsVerification ? (
            <div className="mt-8 rounded-2xl border border-ink bg-surface p-5 text-ink">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Verification needed
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                Get verified to send offers
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Clients see offers only from professionals whose credentials we&apos;ve reviewed.
                Submit your licence, or proof of enrollment if you&apos;re a student.
              </p>
              <div className="mt-4">
                <Link
                  href="/verification"
                  className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  Verify now
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
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
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
                              ? "border-ink bg-ink text-white"
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
                            ? "border-ink bg-ink text-white"
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
                          ? "border-ink bg-ink text-white"
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
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
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
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
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
                className="w-full rounded-full bg-ink py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {submitting ? "Sending offer..." : "Send offer"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>

    {(submitting || showSuccess) ? (
      <MomentOverlay
        status={showSuccess ? "done" : "working"}
        workingTitle="Sending your offer"
        title="Offer sent."
        subtitle="It's in their lineup now."
        card={
          <MomentCard
            eyebrow="Your offer"
            title={request?.title || "Offer"}
            meta={[
              formatMomentPrice(proposedPrice),
              timingMode === "different" ? formatMomentDate(proposedDate) : null,
            ]}
          />
        }
      />
    ) : null}
  </>
  );
}
