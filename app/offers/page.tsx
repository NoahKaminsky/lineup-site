"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type OfferRow = {
  id: string;
  request_id: string;
  professional_id: string;
  message: string | null;
  proposed_price: string | null;
  status: "pending" | "accepted" | "declined" | string;
  customer_response_message: string | null;
  created_at: string;
};

type RequestRow = {
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
  accepted_professional_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type EnrichedOffer = OfferRow & {
  request: RequestRow | null;
  client: ProfileRow | null;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCategory(category: string | null) {
  if (!category) return "Service";
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

function getStatusClasses(status: string) {
  if (status === "accepted") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "declined") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}

function getStatusLabel(status: string) {
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  if (status === "pending") return "Pending";
  return status.replaceAll("_", " ");
}

export default function MyOffersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState("");
  const [offers, setOffers] = useState<EnrichedOffer[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const loadOffers = async () => {
      setLoading(true);
      setPageMessage("");

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
        .select("role, full_name")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setPageMessage("Could not load your profile.");
        setLoading(false);
        return;
      }

      const role = profile?.role ?? null;
      setUserName(profile?.full_name ?? null);

      const isProfessional =
        !!role && role !== "customer" && role !== "I am a customer";

      if (!isProfessional) {
        router.push("/requests");
        return;
      }

      const { data: offersData, error: offersError } = await supabase
        .from("request_offers")
        .select(
          "id, request_id, professional_id, message, proposed_price, status, customer_response_message, created_at"
        )
        .eq("professional_id", user.id)
        .order("created_at", { ascending: false });

      if (offersError) {
        setPageMessage(offersError.message);
        setLoading(false);
        return;
      }

      if (!offersData || offersData.length === 0) {
        setOffers([]);
        setLoading(false);
        return;
      }

      const requestIds = [...new Set(offersData.map((offer) => offer.request_id))];

      const { data: requestsData, error: requestsError } = await supabase
        .from("service_requests")
        .select(
          "id, client_id, category, service_detail, title, description, location, service_mode, budget, status, accepted_professional_id, created_at"
        )
        .in("id", requestIds);

      if (requestsError) {
        setPageMessage(requestsError.message);
        setLoading(false);
        return;
      }

      const requestsMap = new Map<string, RequestRow>();
      (requestsData ?? []).forEach((request) => {
        requestsMap.set(request.id, request);
      });

      const clientIds = [
        ...new Set(
          (requestsData ?? [])
            .map((request) => request.client_id)
            .filter(Boolean)
        ),
      ];

      let clientsMap = new Map<string, ProfileRow>();

      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", clientIds);

        clientsMap = new Map(
          (clientsData ?? []).map((client) => [client.id, client])
        );
      }

      const enriched: EnrichedOffer[] = offersData.map((offer) => {
        const request = requestsMap.get(offer.request_id) ?? null;
        const client = request ? clientsMap.get(request.client_id) ?? null : null;

        return {
          ...offer,
          request,
          client,
        };
      });

      setOffers(enriched);
      setLoading(false);
    };

    loadOffers();
  }, [router]);

  const pendingOffers = useMemo(
    () => offers.filter((offer) => offer.status === "pending"),
    [offers]
  );

  const acceptedOffers = useMemo(
    () => offers.filter((offer) => offer.status === "accepted"),
    [offers]
  );

  const declinedOffers = useMemo(
    () => offers.filter((offer) => offer.status === "declined"),
    [offers]
  );

  const totalOffers = offers.length;

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            LineUp
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/requests"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              View requests
            </Link>

            <Link
              href="/offers"
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              My offers
            </Link>

            <Link
              href="/account"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Account
            </Link>
          </div>

          <div className="md:hidden">
            <Link
              href="/account"
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
            >
              Account
            </Link>
          </div>
        </div>

        <div className="border-t border-neutral-200 px-6 py-3 md:hidden">
          <div className="flex items-center justify-between text-sm font-medium text-neutral-900">
            <Link
              href="/requests"
              className="rounded-full border border-neutral-300 px-4 py-2 transition hover:bg-neutral-50"
            >
              View requests
            </Link>

            <Link
              href="/offers"
              className="rounded-full bg-neutral-900 px-4 py-2 text-white transition hover:opacity-90"
            >
              My offers
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">
              Professional dashboard
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              My offers
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-neutral-600">
              Track all the offers you’ve sent, see what got accepted, and keep up with customer responses.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:w-[360px]">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Total
              </p>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">
                {totalOffers}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Pending
              </p>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">
                {pendingOffers.length}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Accepted
              </p>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">
                {acceptedOffers.length}
              </p>
            </div>
          </div>
        </div>

        {pageMessage ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {pageMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-neutral-500">Loading your offers...</p>
          </div>
        ) : totalOffers === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">No offers yet</h2>
            <p className="mt-3 max-w-xl leading-7 text-neutral-600">
              Once you start responding to requests, your offers will show up here so you can track their status.
            </p>

            <div className="mt-6">
              <Link
                href="/requests"
                className="inline-flex rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Browse requests
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            <OfferSection title="Accepted" offers={acceptedOffers} />
            <OfferSection title="Pending" offers={pendingOffers} />
            <OfferSection title="Declined" offers={declinedOffers} />
          </div>
        )}
      </section>
    </main>
  );
}

function OfferSection({
  title,
  offers,
}: {
  title: string;
  offers: EnrichedOffer[];
}) {
  if (offers.length === 0) return null;

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-600">
          {offers.length}
        </span>
      </div>

      <div className="grid gap-5">
        {offers.map((offer) => {
          const request = offer.request;
          const client = offer.client;

          return (
            <div
              key={offer.id}
              className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                      {formatCategory(request?.category ?? null)}
                      {request?.service_detail ? ` • ${request.service_detail}` : ""}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${getStatusClasses(
                        offer.status
                      )}`}
                    >
                      {getStatusLabel(offer.status)}
                    </span>
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
                    {request?.title ?? "Request unavailable"}
                  </h3>

                  {client ? (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-white text-sm font-semibold text-neutral-700">
                        {client.avatar_url ? (
                          <img
                            src={client.avatar_url}
                            alt={client.full_name || "Customer"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          client.full_name?.trim().charAt(0).toUpperCase() || "C"
                        )}
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500">Customer</p>
                        <p className="font-semibold text-neutral-900">
                          {client.full_name || "Customer"}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoCard
                      label="Offered price"
                      value={offer.proposed_price || "Not provided"}
                    />
                    <InfoCard
                      label="Location"
                      value={request?.location || "Not provided"}
                    />
                    <InfoCard
                      label="Mode"
                      value={formatMode(request?.service_mode ?? null)}
                    />
                    <InfoCard
                      label="Request status"
                      value={request?.status ? getStatusLabel(request.status) : "Unknown"}
                    />
                  </div>

                  {offer.message ? (
                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Your offer message
                      </p>
                      <p className="mt-2 leading-7 text-neutral-700">{offer.message}</p>
                    </div>
                  ) : null}

                  {offer.customer_response_message ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                        Customer response
                      </p>
                      <p className="mt-2 leading-7 text-amber-900">
                        {offer.customer_response_message}
                      </p>
                    </div>
                  ) : null}

                  <p className="mt-5 text-sm text-neutral-500">
                    Sent {formatDate(offer.created_at)}
                  </p>
                </div>

                <div className="flex flex-col gap-3 lg:w-[220px]">
                  <Link
                    href={`/requests/${offer.request_id}`}
                    className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Open request
                  </Link>

                  {client?.id ? (
                    <Link
                      href={`/profile/${client.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                    >
                      View customer
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}