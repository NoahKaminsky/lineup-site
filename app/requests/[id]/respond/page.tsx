"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  service_detail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  service_mode: string | null;
  budget: string | null;
  status: string;
  target_professions: string[] | null;
  created_at: string;
};

export default function RespondToRequestPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [proposedPrice, setProposedPrice] = useState("");
  const [existingOffer, setExistingOffer] = useState<boolean>(false);

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
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Could not load profile.");
        setLoading(false);
        return;
      }

      const isProfessional =
        profile.role === "professional" || profile.role === "I am a professional";

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

const { data: existingOfferData } = await supabase
  .from("request_offers")
  .select("id")
  .eq("request_id", requestId)
  .eq("professional_id", user.id)
  .maybeSingle();

setExistingOffer(!!existingOfferData);
setUserId(user.id);
setRequest(requestData);
setLoading(false);
    }

    if (requestId) {
      loadPage();
    }
  }, [requestId, router]);

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setMessage("");

  if (existingOffer) {
    setMessage("You already submitted an offer for this request.");
    return;
  }

  if (!offerMessage.trim()) {
    setMessage("Please enter a message.");
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

  setSubmitting(true);
  const { error: offerError } = await supabase
    .from("request_offers")
    .insert([
      {
        request_id: requestId,
        professional_id: userId,
        message: offerMessage.trim(),
        proposed_price: proposedPrice.trim() || null,
        status: "pending",
        viewed_by_customer: false,
      },
    ]);

  if (offerError) {
    console.error("Offer insert error:", offerError);

    if (offerError.message.toLowerCase().includes("duplicate")) {
      setMessage("You already submitted an offer for this request.");
    } else {
      setMessage(offerError.message);
    }

    setSubmitting(false);
    return;
  }

  router.push(`/requests/${requestId}`);
}

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

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-4xl py-16">
          <p className="text-neutral-500">Loading response page...</p>
        </div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-4xl py-16">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            ← Back to requests
          </Link>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Request not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          LineUp
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href={`/requests/${requestId}`}
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            Back to request
          </Link>

          <Link
            href="/requests"
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            View requests
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 py-16 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Request summary
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {formatCategory(request.category)}
            </span>

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
                Location
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {request.location || "Not provided"}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Service mode
              </p>
              <p className="mt-2 font-medium text-neutral-900">
                {formatMode(request.service_mode)}
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
            Introduce yourself, share your fit for the request, and include your
            proposed price.
          </p>

 {existingOffer ? (
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
      <label className="mb-2 block text-sm font-medium text-neutral-700">
        Proposed price
      </label>
      <input
        type="text"
        value={proposedPrice}
        onChange={(e) => setProposedPrice(e.target.value)}
        placeholder="$55"
        className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
      />
    </div>

    <div>
      <label className="mb-2 block text-sm font-medium text-neutral-700">
        Message
      </label>
      <textarea
        rows={7}
        value={offerMessage}
        onChange={(e) => setOfferMessage(e.target.value)}
        placeholder="Hi, I’d be a great fit for this request because..."
        className="w-full resize-none rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
      />
    </div>

    <button
      type="submit"
      disabled={submitting}
      className="w-full rounded-2xl bg-black py-3 text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {submitting ? "Sending offer..." : "Send offer"}
    </button>

    {message ? (
      <p className="text-sm text-red-600">{message}</p>
    ) : null}
  </form>
)}
        </div>
      </div>
    </main>
  );
}