"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getCached, setCached } from "@/app/lib/pageCache";

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | null;

type Profile = {
  id: string;
  role: string | null;
  full_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  subscription_current_period_end: string | null;
};

type Plan = {
  key: string;
  name: string;
  price: number;
  priceLabel: string;
  trialDays: number | null;
  tagline: string;
  recommended: boolean;
  isBasic?: boolean;
  features: string[];
  envKey?: keyof typeof PRICE_IDS;
};

const PRICE_IDS = {
  STRIPE_APPRENTICE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_APPRENTICE_PRICE_ID,
  STRIPE_PRO_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
  STRIPE_MASTER_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_MASTER_PRICE_ID,
} as const;

const PLANS: Plan[] = [
  {
    key: "basic",
    name: "Basic",
    price: 0,
    priceLabel: "$0.00",
    trialDays: null,
    tagline: "Where every professional starts",
    recommended: false,
    isBasic: true,
    features: [
      "Up to 15 bookings per month",
      "No advanced booking calendar",
      "Basic performance analytics",
    ],
  },
  {
    key: "apprentice",
    name: "Apprentice",
    price: 25,
    priceLabel: "$25",
    trialDays: null,
    tagline: "Best for getting started",
    recommended: false,
    features: [
      "Up to 25 bookings per month",
      "1-year advanced booking calendar",
      "Basic performance analytics",
      "LineUp professional badge",
    ],
    envKey: "STRIPE_APPRENTICE_PRICE_ID",
  },
  {
    key: "pro",
    name: "Pro",
    price: 50,
    priceLabel: "$50",
    trialDays: 7,
    tagline: "Best for growing fast",
    recommended: true,
    features: [
      "Unlimited bookings",
      "1-year advanced booking calendar",
      "Full analytics suite",
      "Stripe Connect payouts",
      "10 Explore Page promotions per month",
      "LineUp Pro badge",
    ],
    envKey: "STRIPE_PRO_PRICE_ID",
  },
  {
    key: "master",
    name: "Master",
    price: 75,
    priceLabel: "$75",
    trialDays: 5,
    tagline: "Best for maximizing earnings",
    recommended: false,
    features: [
      "Unlimited bookings",
      "1-year advanced booking calendar",
      "Full analytics suite",
      "Stripe Connect payouts",
      "Unlimited Explore Page promotions",
      "Reduced LineUp commission",
      "Priority support",
    ],
    envKey: "STRIPE_MASTER_PRICE_ID",
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8l3.5 3.5L13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: SubscriptionStatus) {
  if (status === "active") return "Active";
  if (status === "trialing") return "Free trial";
  if (status === "past_due") return "Payment overdue";
  if (status === "canceled") return "Canceled";
  if (status === "incomplete") return "Incomplete";
  return null;
}

function statusColor(status: SubscriptionStatus) {
  if (status === "active" || status === "trialing")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "past_due")
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "canceled" || status === "incomplete")
    return "bg-red-50 text-red-700 border-red-200";
  return "bg-neutral-100 text-neutral-600 border-neutral-200";
}

export default function SubscriptionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(() => !getCached<Profile>("subscription-page"));
  const [profile, setProfile] = useState<Profile | null>(() => getCached<Profile>("subscription-page"));
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [portalLoadingKey, setPortalLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setShowSuccess(true);
      window.history.replaceState({}, "", "/subscription");
    }
  }, []);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, role, full_name, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, subscription_current_period_end"
        )
        .eq("id", user.id)
        .single();

      if (error || !data) {
        setMessage("Could not load your profile.");
        setLoading(false);
        return;
      }

      const normalizedRole = String(data.role || "").toLowerCase().trim();
      const isProfessional = !!normalizedRole && !normalizedRole.includes("customer");

      if (!isProfessional) {
        router.push("/account");
        return;
      }

      setProfile(data as Profile);
      setCached<Profile>("subscription-page", data as Profile);
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleSubscribe(plan: Plan) {
    if (!plan.envKey) return;

    const priceId = PRICE_IDS[plan.envKey];

    if (!priceId) {
      setMessage(`Price ID for ${plan.name} is not configured yet.`);
      return;
    }

    setSubscribing(plan.key);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/stripe/subscription/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ priceId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || "Something went wrong.");
        return;
      }

      window.location.href = json.url;
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSubscribing(null);
    }
  }

  async function handleManageBilling(options?: { plan?: Plan; cancel?: boolean; fallbackPlan?: Plan }) {
    const targetPlan = options?.plan;
    const loadingKey = targetPlan?.key ?? (options?.cancel ? "basic" : "billing");
    setPortalLoadingKey(loadingKey);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const priceId = targetPlan?.envKey ? PRICE_IDS[targetPlan.envKey] : undefined;

      const res = await fetch("/api/stripe/subscription/customer-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          ...(priceId ? { priceId } : {}),
          ...(options?.cancel ? { cancel: true } : {}),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 404 && options?.fallbackPlan) {
          // No real Stripe customer exists yet (e.g. subscription_status was set manually
          // for testing). Nothing to manage in a billing portal — start a real checkout instead.
          setPortalLoadingKey(null);
          await handleSubscribe(options.fallbackPlan);
          return;
        }

        setMessage(json.error || "Could not open billing portal.");
        return;
      }

      window.location.href = json.url;
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setPortalLoadingKey(null);
    }
  }

  const isActiveSubscriber =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";

  const currentPlan = PLANS.find((p) => p.key === profile?.subscription_plan);
  const currentTierName = isActiveSubscriber && currentPlan ? currentPlan.name : "Basic";

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6">

        <div className="mx-auto max-w-5xl py-12">
          <div className="h-4 w-32 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-4 h-10 w-72 animate-pulse rounded-2xl bg-neutral-200" />
          <div className="mt-3 h-4 w-96 animate-pulse rounded-full bg-neutral-100" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-[2rem] bg-neutral-100" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6">


      <div className="mx-auto max-w-5xl py-10">

        {/* Header */}
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            LineUp Professional
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {isActiveSubscriber ? "Your subscription" : "Choose your plan"}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">
            {isActiveSubscriber
              ? "Manage your plan, billing, and subscription details below."
              : "Unlock the tools to grow your beauty business. Cancel anytime."}
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700">
            You're currently on the
            <span className="font-semibold text-neutral-900">{currentTierName}</span>
            plan
          </span>
        </div>

        {/* Success banner */}
        {showSuccess ? (
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            You&apos;re subscribed! Your plan is now active.
          </div>
        ) : null}

        {/* Error */}
        {message ? (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        {/* Active subscription card */}
        {isActiveSubscriber && currentPlan ? (
          <div className="mb-10 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
            <div className="bg-black px-6 py-8 text-white sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                  Current plan
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor(
                    profile?.subscription_status ?? null
                  )}`}
                >
                  {statusLabel(profile?.subscription_status ?? null)}
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {currentPlan.name} Plan
              </p>
              <p className="mt-1 text-sm text-white/60">
                {currentPlan.priceLabel}/month
              </p>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {profile?.subscription_status === "trialing"
                      ? "Trial ends"
                      : "Renews on"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-neutral-900">
                    {formatDate(profile?.subscription_current_period_end ?? null) ?? "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Included features
                  </p>
                  <p className="mt-2 text-base font-semibold text-neutral-900">
                    {currentPlan.features.length} features
                  </p>
                </div>
              </div>

              <ul className="mt-5 space-y-2">
                {currentPlan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-neutral-700"
                  >
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleManageBilling({ fallbackPlan: currentPlan })}
                  disabled={portalLoadingKey === "billing"}
                  className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {portalLoadingKey === "billing" ? "Opening..." : "Manage billing"}
                </button>
                <Link
                  href="/account"
                  className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  Back to account
                </Link>
              </div>

              <p className="mt-4 text-xs text-neutral-400">
                Cancel, upgrade, or update payment method anytime through the billing portal.
              </p>
            </div>
          </div>
        ) : null}

        {/* Plans — always visible */}
        <div>
          {isActiveSubscriber ? (
            <h2 className="mb-6 text-xl font-semibold tracking-tight">
              Available plans
            </h2>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.isBasic
                ? !isActiveSubscriber
                : profile?.subscription_plan === plan.key && isActiveSubscriber;
              const isRecommended = plan.recommended;

              return (
                <div
                  key={plan.key}
                  className={`relative flex flex-col overflow-hidden rounded-[2rem] border transition ${
                    isCurrent
                      ? "border-black ring-2 ring-black"
                      : isRecommended
                      ? "border-black shadow-lg"
                      : "border-neutral-200"
                  }`}
                >
                  {/* Top badges */}
                  {(isRecommended || isCurrent) ? (
                    <div className="bg-black px-5 py-2 text-center text-xs font-semibold uppercase tracking-widest text-white">
                      {isCurrent ? "You" : "Most popular"}
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col p-6">
                    {/* Plan name + price */}
                    <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                      {plan.name}
                    </p>
                    <div className="mt-2 flex items-end gap-1">
                      <span className="text-4xl font-semibold tracking-tight">
                        {plan.priceLabel}
                      </span>
                      <span className="mb-1 text-sm text-neutral-500">/month</span>
                    </div>

                    {plan.isBasic ? (
                      <p className="mt-1 text-xs font-medium text-neutral-400">Always free</p>
                    ) : plan.trialDays ? (
                      <p className="mt-1 text-xs font-medium text-emerald-600">
                        {plan.trialDays}-day free trial
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-400">No trial</p>
                    )}

                    <p className="mt-2 text-xs text-neutral-500">{plan.tagline}</p>

                    {/* Features */}
                    <ul className="mt-5 flex-1 space-y-2">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-neutral-700"
                        >
                          <span className="mt-0.5 text-neutral-900">
                            <CheckIcon />
                          </span>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-6">
                      {isCurrent && plan.isBasic ? (
                        <p className="rounded-full border border-dashed border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-400">
                          Your current plan
                        </p>
                      ) : isCurrent ? (
                        <button
                          type="button"
                          onClick={() => handleManageBilling({ fallbackPlan: plan })}
                          disabled={portalLoadingKey === "billing"}
                          className="w-full rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
                        >
                          {portalLoadingKey === "billing" ? "Opening..." : "Manage plan"}
                        </button>
                      ) : isActiveSubscriber && plan.isBasic ? (
                        <button
                          type="button"
                          onClick={() => handleManageBilling({ cancel: true })}
                          disabled={portalLoadingKey === "basic"}
                          className="w-full rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
                        >
                          {portalLoadingKey === "basic" ? "Opening..." : "Downgrade to Basic"}
                        </button>
                      ) : isActiveSubscriber ? (
                        <button
                          type="button"
                          onClick={() => handleManageBilling({ plan, fallbackPlan: plan })}
                          disabled={portalLoadingKey === plan.key}
                          className="w-full rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
                        >
                          {portalLoadingKey === plan.key ? "Opening..." : `Switch to ${plan.name}`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSubscribe(plan)}
                          disabled={!!subscribing}
                          className={`w-full rounded-full px-5 py-3 text-sm font-medium transition disabled:opacity-60 ${
                            isRecommended
                              ? "bg-black text-white hover:opacity-90"
                              : "border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          {subscribing === plan.key
                            ? "Redirecting..."
                            : plan.trialDays
                            ? `Start ${plan.trialDays}-day free trial`
                            : "Subscribe"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!isActiveSubscriber ? (
            <p className="mt-6 text-center text-xs text-neutral-400">
              Secure billing through Stripe. Cancel anytime — no lock-in.
            </p>
          ) : null}
        </div>

        {/* Past due warning */}
        {profile?.subscription_status === "past_due" ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-800">Payment required</p>
            <p className="mt-1 text-sm text-amber-700">
              Your last payment didn&apos;t go through. Update your payment method to keep
              your plan active.
            </p>
            <button
              type="button"
              onClick={() => handleManageBilling()}
              disabled={portalLoadingKey === "billing"}
              className="mt-4 rounded-full bg-amber-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              {portalLoadingKey === "billing" ? "Opening..." : "Update payment method"}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
