"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
};

export default function RequestsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [respondedRequestIds, setRespondedRequestIds] = useState<string[]>([]);
  const [unreadNotificationRequestIds, setUnreadNotificationRequestIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadRequests() {
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
        userRole === "professional" || userRole === "I am a professional";

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

  setRequests(data || []);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("request_id")
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (notifications) {
    const unreadIds = notifications
      .map((item) => item.request_id)
      .filter((id): id is string => !!id);

    setUnreadNotificationRequestIds(unreadIds);
  }
} else if (isProfessional) {



        const { data: openRequests, error: openRequestsError } = await supabase
          .from("service_requests")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false });

        if (openRequestsError) {
          setMessage(openRequestsError.message);
          setLoading(false);
          return;
        }

const { data: trackedRequests, error: trackedRequestsError } = await supabase
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

        (openRequests ?? []).forEach((item) => {
          mergedRequestsMap.set(item.id, item);
        });

        myTrackedRequests.forEach((item) => {
          mergedRequestsMap.set(item.id, item);
        });

        const mergedRequests = Array.from(mergedRequestsMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setRequests(mergedRequests);

        const { data: offers } = await supabase
          .from("request_offers")
          .select("request_id")
          .eq("professional_id", user.id);

        if (offers) {
          const ids = offers.map((o) => o.request_id);
          setRespondedRequestIds(ids);
        }

        const { data: notifications } = await supabase
          .from("notifications")
          .select("request_id")
          .eq("user_id", user.id)
          .eq("is_read", false);

        if (notifications) {
          const unreadIds = notifications
            .map((item) => item.request_id)
            .filter((id): id is string => !!id);

          setUnreadNotificationRequestIds(unreadIds);
        }
      } else {
        setMessage("Invalid account role.");
        setLoading(false);
        return;
      }

      setLoading(false);
    }

    loadRequests();
  }, [router]);

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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const isCustomer =
    role === "customer" || role === "I am a customer";

  const isProfessional =
    role === "professional" || role === "I am a professional";

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
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-3xl">
<div className="flex flex-wrap items-center gap-3">
  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
    {formatCategory(request.category)}
    {request.service_detail ? ` • ${request.service_detail}` : ""}
  </span>

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
  unreadNotificationRequestIds.includes(request.id) &&
  !respondedRequestIds.includes(request.id) ? (
    <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
      New
    </span>
  ) : null}

  {isCustomer &&
  unreadNotificationRequestIds.includes(request.id) ? (
    <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
      New offer
    </span>
  ) : null}
</div>

                      <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                        {request.title}
                      </h2>

                      {request.description ? (
                        <p className="mt-3 text-neutral-600">
                          {request.description}
                        </p>
                      ) : null}
                    </div>

                    <p className="text-sm text-neutral-500">
                      {formatDate(request.created_at)}
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
                        {request.target_professions?.length
                          ? request.target_professions
                              .map((item) =>
                                item
                                  .replaceAll("_", " ")
                                  .replace(/\b\w/g, (char) => char.toUpperCase())
                              )
                              .join(", ")
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  {isProfessional ? (
                    <div className="mt-6">
                      {request.status === "open" ? (
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
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="block rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-3xl">
<div className="flex flex-wrap items-center gap-3">
  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
    {formatCategory(request.category)}
    {request.service_detail ? ` • ${request.service_detail}` : ""}
  </span>

  <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
    Completed
  </span>

  {isCustomer &&
  unreadNotificationRequestIds.includes(request.id) ? (
    <span className="animate-notification-pop rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
      New offer
    </span>
  ) : null}
</div>

                      <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                        {request.title}
                      </h2>

                      {request.description ? (
                        <p className="mt-3 text-neutral-600">
                          {request.description}
                        </p>
                      ) : null}
                    </div>

                    <p className="text-sm text-neutral-500">
                      {formatDate(request.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}