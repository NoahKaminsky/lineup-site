"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  accepted_professional_id: string | null;
  created_at: string;
  reference_photos: string[] | null;
  preferred_professional_id?: string | null;
  is_direct_rebook?: boolean | null;
};

type RequestOfferRow = {
  id: string;
  request_id: string;
  viewed_by_customer: boolean | null;
};

type NotificationRow = {
  request_id: string | null;
};

export default function RequestsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>([]);
  const [professionalUnreadRequestIds, setProfessionalUnreadRequestIds] =
    useState<string[]>([]);
  const [offerCountsByRequest, setOfferCountsByRequest] = useState<
    Record<string, number>
  >({});
  const [unreadOfferCountsByRequest, setUnreadOfferCountsByRequest] = useState<
    Record<string, number>
  >({});
  const [message, setMessage] = useState("");

  const loadRequestsLive = useCallback(async () => {
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
      .select("role, professional_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setMessage("Could not load profile.");
      setLoading(false);
      return;
    }

    const userRole = profile.role;
    setRole(userRole);

    const isCustomer =
      userRole === "customer" || userRole === "I am a customer";

    const isProfessional =
      userRole === "professional" ||
      userRole === "I am a professional" ||
      (!!userRole && userRole !== "customer" && userRole !== "I am a customer");

    if (isCustomer) {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const customerRequests = (data as ServiceRequest[]) || [];
      setRequests(customerRequests);

      const requestIds = customerRequests.map((r) => r.id);

      if (requestIds.length > 0) {
        const { data: offersData, error: offersError } = await supabase
          .from("request_offers")
          .select("id, request_id, viewed_by_customer")
          .in("request_id", requestIds);

        if (offersError) {
          setMessage(offersError.message);
          setLoading(false);
          return;
        }

        const totalOfferCounts: Record<string, number> = {};
        const unreadCounts: Record<string, number> = {};

        ((offersData as RequestOfferRow[]) || []).forEach((offer) => {
          totalOfferCounts[offer.request_id] =
            (totalOfferCounts[offer.request_id] || 0) + 1;

          if (!offer.viewed_by_customer) {
            unreadCounts[offer.request_id] =
              (unreadCounts[offer.request_id] || 0) + 1;
          }
        });

        setOfferCountsByRequest(totalOfferCounts);
        setUnreadOfferCountsByRequest(unreadCounts);
      } else {
        setOfferCountsByRequest({});
        setUnreadOfferCountsByRequest({});
      }

      setProfessionalUnreadRequestIds([]);
      setRespondedRequestIds([]);
    } else if (isProfessional) {
      const { data: allRequests, error: allRequestsError } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (allRequestsError) {
        setMessage(allRequestsError.message);
        setLoading(false);
        return;
      }

      const { data: trackedRequests, error: trackedRequestsError } =
        await supabase
          .from("service_requests")
          .select("*")
          .eq("accepted_professional_id", user.id)
          .in("status", ["accepted", "completion_requested", "completed"])
          .order("created_at", { ascending: false });

      if (trackedRequestsError) {
        setMessage(trackedRequestsError.message);
        setLoading(false);
        return;
      }

      const myTrackedRequests: ServiceRequest[] = trackedRequests ?? [];
      const mergedRequestsMap = new Map<string, ServiceRequest>();

      ((allRequests as ServiceRequest[]) ?? []).forEach((item) => {
        mergedRequestsMap.set(item.id, item);
      });

      myTrackedRequests.forEach((item) => {
        mergedRequestsMap.set(item.id, item);
      });

      const mergedRequests = Array.from(mergedRequestsMap.values())
        .filter((request) => {
          if (request.is_direct_rebook) {
            return request.preferred_professional_id === user.id;
          }

          return (
            request.status === "open" ||
            request.accepted_professional_id === user.id
          );
        })
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );

      setRequests(mergedRequests);

      const { data: offers, error: offersError } = await supabase
        .from("request_offers")
        .select("request_id")
        .eq("professional_id", user.id);

      if (offersError) {
        setMessage(offersError.message);
        setLoading(false);
        return;
      }

const uniqueRespondedIds = Array.from(
  new Set(
    (offers ?? [])
      .map((offer) => offer.request_id)
      .filter((id): id is string => !!id)
  )
);
setRespondedRequestIds(uniqueRespondedIds);

const { error: markReadError } = await supabase
  .from("notifications")
  .update({ is_read: true })
  .eq("user_id", user.id)
  .eq("is_read", false);

if (markReadError) {
  console.error("Error marking notifications as read:", markReadError);
}

const { data: notifications, error: notificationsError } = await supabase
  .from("notifications")
  .select("request_id")
  .eq("user_id", user.id)
  .eq("is_read", false);

      if (notificationsError) {
        console.error(
          "Error loading unread notifications:",
          notificationsError
        );
        setProfessionalUnreadRequestIds([]);
      } else {
        const unreadIds = Array.from(
          new Set(
            ((notifications as NotificationRow[]) ?? [])
              .map((item) => item.request_id)
              .filter((id): id is string => !!id)
          )
        );

        setProfessionalUnreadRequestIds(unreadIds);
      }

      setOfferCountsByRequest({});
      setUnreadOfferCountsByRequest({});
    } else {
      setMessage("Invalid account role.");
      setLoading(false);
      return;
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadRequestsLive();
  }, [loadRequestsLive]);

  useEffect(() => {
    if (!role) return;

    const channel = supabase
      .channel("requests-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
        },
        async () => {
          await loadRequestsLive();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_offers",
        },
        async () => {
          await loadRequestsLive();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        async () => {
          await loadRequestsLive();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, loadRequestsLive]);

  function formatCategory(category: string) {
    return category
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatMode(mode: string | null) {
    if (!mode) return null;
    if (mode === "in_shop") return "In shop";
    if (mode === "at_home") return "At home";
    if (mode === "home_studio") return "Home studio";

    return mode.replaceAll("_", " ");
  }

  function formatDateTime(dateString: string) {
    return new Date(dateString).toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const isCustomer = role === "customer" || role === "I am a customer";

  const isProfessional =
    role === "professional" ||
    role === "I am a professional" ||
    (!!role && role !== "customer" && role !== "I am a customer");

  const activeRequests = requests.filter(
    (request) => request.status !== "completed"
  );

  const completedRequests = requests.filter(
    (request) => request.status === "completed"
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl py-16">
          <p className="text-neutral-500">Loading requests...</p>
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
            href="/account"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            View profile
          </Link>

          {isCustomer ? (
            <Link
              href="/requests/new"
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              New request
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-6xl py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Requests
            </p>

            <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
              {isCustomer ? "Your requests." : "Available requests."}
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              {isCustomer
                ? "Track your active requests and completed services."
                : "Browse open requests and manage accepted work in one place."}
            </p>
          </div>
        </div>

        {message ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {!message && requests.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              {isCustomer ? "No requests yet" : "No matching requests right now"}
            </h2>

            <p className="mt-3 max-w-xl text-neutral-600">
              {isCustomer
                ? "Once you post a request, it will appear here."
                : "When a client posts a matching request, it will show up here automatically."}
            </p>

            {isCustomer ? (
              <div className="mt-6">
                <Link
                  href="/requests/new"
                  className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Submit a request
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeRequests.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-2xl font-semibold tracking-tight">
              Active {isCustomer ? "requests" : "work"}
            </h2>

            <div className="mt-6 grid gap-6">
              {activeRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="block rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 gap-4">
                      {request.reference_photos &&
                      request.reference_photos.length > 0 ? (
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                          <img
                            src={request.reference_photos[0]}
                            alt="Reference preview"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}

                      <div className="min-w-0 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                            {formatCategory(request.category)}
                            {request.service_detail
                              ? ` • ${request.service_detail}`
                              : ""}
                          </span>

                          {request.is_direct_rebook ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800">
                              Direct rebook
                            </span>
                          ) : null}

                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                            {request.status === "open"
                              ? "Pending"
                              : request.status === "accepted"
                              ? "Accepted"
                              : request.status === "completion_requested"
                              ? "Awaiting confirmation"
                              : request.status}
                          </span>

                          {isProfessional &&
                          professionalUnreadRequestIds.includes(request.id) &&
                          !respondedRequestIds.includes(request.id) ? (
                            <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                              New
                            </span>
                          ) : null}

                          {isCustomer &&
                          unreadOfferCountsByRequest[request.id] ? (
                            <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                              {unreadOfferCountsByRequest[request.id]} of{" "}
                              {offerCountsByRequest[request.id] || 0} offers new
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                          {request.title}
                        </h2>

                        {request.description ? (
                          <p className="mt-3 text-neutral-600 line-clamp-3">
                            {request.description}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <p className="shrink-0 text-sm text-neutral-500">
                      Posted {formatDateTime(request.created_at)}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Location
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">
                        {request.location || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Service mode
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">
                        {formatMode(request.service_mode) || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Budget
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">
                        {request.budget || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        Matched to
                      </p>
                      <p className="mt-2 text-sm font-medium text-neutral-900">
                        {request.is_direct_rebook
                          ? "Direct to requested professional"
                          : request.target_professions?.length
                          ? request.target_professions
                              .map((item) =>
                                item
                                  .replaceAll("_", " ")
                                  .replace(/\b\w/g, (char) =>
                                    char.toUpperCase()
                                  )
                              )
                              .join(", ")
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  {isProfessional ? (
                    <div className="mt-6">
                      {request.is_direct_rebook ? (
                        respondedRequestIds.includes(request.id) ? (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
                            Rebook response sent
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
                            Repeat client request
                          </span>
                        )
                      ) : request.status === "open" ? (
                        respondedRequestIds.includes(request.id) ? (
                          <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-500">
                            Responded
                          </span>
                        ) : (
                          <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900">
                            Respond now
                          </span>
                        )
                      ) : request.status === "accepted" ? (
                        <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900">
                          Accepted job
                        </span>
                      ) : request.status === "completion_requested" ? (
                        <span className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-500">
                          Awaiting customer confirmation
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {completedRequests.length > 0 ? (
          <div className="mt-14">
            <h2 className="text-2xl font-semibold tracking-tight">
              Completed services
            </h2>

            <div className="mt-6 grid gap-6">
{completedRequests.map((request) => (
  <div
    key={request.id}
    className="block rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
  >
    <Link href={`/requests/${request.id}`}>
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          {request.reference_photos &&
          request.reference_photos.length > 0 ? (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <img
                src={request.reference_photos[0]}
                alt="Reference preview"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                {formatCategory(request.category)}
                {request.service_detail
                  ? ` • ${request.service_detail}`
                  : ""}
              </span>

              {request.is_direct_rebook ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-800">
                  Direct rebook
                </span>
              ) : null}

              <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                Completed
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              {request.title}
            </h2>

            {request.description ? (
              <p className="mt-3 text-neutral-600 line-clamp-3">
                {request.description}
              </p>
            ) : null}
          </div>
        </div>

        <p className="shrink-0 text-sm text-neutral-500">
          Posted {formatDateTime(request.created_at)}
        </p>
      </div>
    </Link>

    {isCustomer && request.accepted_professional_id ? (
      <div className="mt-6">
        <Link
          href={`/requests/new?rebook=1&pro=${request.accepted_professional_id}&request=${request.id}`}
          className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
        >
          Book again
        </Link>
      </div>
    ) : null}
  </div>
))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}