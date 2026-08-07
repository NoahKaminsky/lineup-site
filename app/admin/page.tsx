"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  is_admin: boolean;
  is_featured: boolean;
  created_at: string;
};

type ContentType = "requests" | "bookings" | "reviews" | "portfolio" | "messages";

type ContentItem = Record<string, any>;

const CONTENT_TABS: { key: ContentType; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "bookings", label: "Bookings" },
  { key: "reviews", label: "Reviews" },
  { key: "portfolio", label: "Portfolio" },
  { key: "messages", label: "Messages" },
];

const PLAN_OPTIONS = [
  { value: "", label: "Basic (free)" },
  { value: "apprentice", label: "Apprentice" },
  { value: "pro", label: "Pro" },
  { value: "master", label: "Master" },
];

const STATUS_OPTIONS = [
  { value: "", label: "None" },
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "incomplete", label: "Incomplete" },
];

async function authedFetch(url: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}

export default function AdminPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<"users" | ContentType>("users");
  const [message, setMessage] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftPlans, setDraftPlans] = useState<Record<string, { plan: string; status: string }>>({});
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null);

  const [contentQuery, setContentQuery] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [people, setPeople] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [contentLoading, setContentLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin) {
        router.push("/account");
        return;
      }

      setIsAdmin(true);
      setChecking(false);
    }

    check();
  }, [router]);

  async function loadUsers() {
    setUsersLoading(true);
    setMessage("");

    const res = await authedFetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}`);
    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not load users.");
      setUsersLoading(false);
      return;
    }

    setUsers(json.users || []);
    const drafts: Record<string, { plan: string; status: string }> = {};
    (json.users || []).forEach((u: AdminUser) => {
      drafts[u.id] = { plan: u.subscription_plan || "", status: u.subscription_status || "" };
    });
    setDraftPlans(drafts);
    setUsersLoading(false);
  }

  async function loadContent(type: ContentType) {
    setContentLoading(true);
    setMessage("");

    const res = await authedFetch(`/api/admin/content?type=${type}&q=${encodeURIComponent(contentQuery)}`);
    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not load content.");
      setContentLoading(false);
      return;
    }

    setItems(json.items || []);
    setPeople(json.people || {});
    setContentLoading(false);
  }

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === "users") {
      loadUsers();
    } else {
      loadContent(tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab]);

  async function handleSaveUserTier(userId: string) {
    const draft = draftPlans[userId];
    if (!draft) return;

    setSavingUserId(userId);
    setMessage("");

    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        subscriptionPlan: draft.plan || null,
        subscriptionStatus: draft.status || null,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not update user.");
      setSavingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, subscription_plan: draft.plan || null, subscription_status: draft.status || null }
          : u
      )
    );
    setMessage("Updated.");
    setSavingUserId(null);
  }

  async function handleToggleFeatured(userId: string, next: boolean) {
    setTogglingFeaturedId(userId);
    setMessage("");

    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isFeatured: next }),
    });

    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not update featured status.");
      setTogglingFeaturedId(null);
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_featured: next } : u)));
    setTogglingFeaturedId(null);
  }

  async function handleDeleteContent(type: ContentType, id: string) {
    if (!confirm("Delete this permanently?")) return;

    setDeletingId(id);
    setMessage("");

    const res = await authedFetch("/api/admin/content", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });

    const json = await res.json();

    if (!res.ok) {
      setMessage(json.error || "Could not delete.");
      setDeletingId(null);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    setDeletingId(null);
  }

  function personLabel(id?: string | null) {
    if (!id) return "—";
    const person = people[id];
    return person?.full_name || person?.email || id.slice(0, 8);
  }

  if (checking) {
    return <main className="p-8 text-sm text-neutral-500">Checking access...</main>;
  }

  if (!isAdmin) return null;

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">Internal tool — manage subscriptions and moderate content.</p>

        {message ? (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
            {message}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "users" ? "bg-black text-white" : "bg-white text-neutral-700 border border-neutral-200"
            }`}
          >
            Users
          </button>
          {CONTENT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t.key ? "bg-black text-white" : "bg-white text-neutral-700 border border-neutral-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users" ? (
          <div className="mt-6">
            <div className="flex gap-2">
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                placeholder="Search by name or email"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={loadUsers}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Search
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                    <th className="px-3 py-2">Name / Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Featured</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr><td className="px-3 py-4 text-neutral-400" colSpan={6}>Loading...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td className="px-3 py-4 text-neutral-400" colSpan={6}>No users found.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="border-b border-neutral-100">
                        <td className="px-3 py-2">
                          <p className="font-medium">{u.full_name || "—"}</p>
                          <p className="text-xs text-neutral-500">{u.email}</p>
                          {u.is_admin ? <span className="text-xs font-semibold text-emerald-600">admin</span> : null}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{u.role || "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={draftPlans[u.id]?.plan ?? ""}
                            onChange={(e) =>
                              setDraftPlans((prev) => ({
                                ...prev,
                                [u.id]: { ...prev[u.id], plan: e.target.value },
                              }))
                            }
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            {PLAN_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draftPlans[u.id]?.status ?? ""}
                            onChange={(e) =>
                              setDraftPlans((prev) => ({
                                ...prev,
                                [u.id]: { ...prev[u.id], status: e.target.value },
                              }))
                            }
                            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(u.id, !u.is_featured)}
                            disabled={togglingFeaturedId === u.id}
                            title="Manually promote this profile to the top of Discover, overriding normal ranking"
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
                              u.is_featured
                                ? "border-amber-300 bg-amber-100 text-amber-800"
                                : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                            }`}
                          >
                            {togglingFeaturedId === u.id ? "..." : u.is_featured ? "★ Featured" : "Feature"}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleSaveUserTier(u.id)}
                            disabled={savingUserId === u.id}
                            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >
                            {savingUserId === u.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex gap-2">
              <input
                value={contentQuery}
                onChange={(e) => setContentQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadContent(tab)}
                placeholder="Search"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => loadContent(tab)}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Search
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {contentLoading ? (
                <p className="text-sm text-neutral-400">Loading...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-neutral-400">Nothing found.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      {tab === "requests" ? (
                        <>
                          <p className="font-medium">{item.title || item.category}</p>
                          <p className="text-neutral-500">{item.description}</p>
                          <p className="mt-1 text-xs text-neutral-400">
                            By {personLabel(item.client_id)} · {item.status}
                          </p>
                        </>
                      ) : tab === "bookings" ? (
                        <>
                          <p className="font-medium">{item.service_name || "Booked service"}</p>
                          <p className="text-xs text-neutral-400">
                            {personLabel(item.professional_id)} ↔ {personLabel(item.customer_id)} · {item.booking_date} · {item.status}
                          </p>
                        </>
                      ) : tab === "reviews" ? (
                        <>
                          <p className="font-medium">★ {item.rating} — {personLabel(item.reviewer_id)} on {personLabel(item.professional_id)}</p>
                          <p className="text-neutral-500">{item.comment}</p>
                        </>
                      ) : tab === "messages" ? (
                        <>
                          <p className="font-medium">{personLabel(item.sender_id)}</p>
                          <p className="text-neutral-700">{item.message}</p>
                          {item.booking ? (
                            <p className="mt-1 text-xs text-neutral-400">
                              Booking: {personLabel(item.booking.professional_id)} ↔ {personLabel(item.booking.customer_id)} ·{" "}
                              {item.booking.service_name || "Booked service"} · {item.booking.booking_date}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-neutral-400">Booking not found (id: {item.booking_id})</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="font-medium">{item.caption || "Untitled"}</p>
                          <p className="text-xs text-neutral-400">By {personLabel(item.user_id)}</p>
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="mt-2 h-20 w-20 rounded object-cover" />
                          ) : null}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteContent(tab, item.id)}
                      disabled={deletingId === item.id}
                      className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-60"
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
