"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LuLoader from "@/app/components/LuLoader";
import { useRouter } from "next/navigation";
import { Scissors, Wand2, Hand, Eye, Pencil, Palette, Flame, Leaf, Star, ShoppingBag, Briefcase, Check } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { isLikelyValidPhoneNumber } from "@/app/lib/phoneValidation";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { rememberReturnTo, takeReturnTo } from "@/app/lib/returnTo";

// See the matching flag in app/account/AccountPageClient.tsx — same reasoning.
const SMS_SIGNUP_UI_ENABLED = false;

const PROFESSIONAL_OPTIONS = [
  { label: "Barber", value: "barber", Icon: Scissors },
  { label: "Hairstylist", value: "hairstylist", Icon: Wand2 },
  { label: "Nail Artist", value: "nail_artist", Icon: Hand },
  { label: "Lash Artist", value: "lash_artist", Icon: Eye },
  { label: "Brow Artist", value: "brow_artist", Icon: Pencil },
  { label: "Makeup Artist", value: "makeup_artist", Icon: Palette },
  { label: "Wax Technician", value: "wax_technician", Icon: Flame },
  { label: "Body Sugaring", value: "body_sugaring", Icon: Leaf },
  { label: "Other", value: "other_beauty_professional", Icon: Star },
];

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [professionalTypes, setProfessionalTypes] = useState<string[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsNotificationsEnabled, setSmsNotificationsEnabled] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Arrived from a sign-up that started on another page (e.g. a pro's
    // booking link): remember it for when onboarding is done.
    rememberReturnTo(new URLSearchParams(window.location.search).get("next"));

    async function checkExistingProfile() {
      const user = await getSignedInUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          "full_name, role, professional_type, professional_types, terms_accepted, privacy_accepted, marketing_consent"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (!error && profile) {
        const savedProfessionalTypes =
          profile.professional_types && profile.professional_types.length > 0
            ? profile.professional_types
            : profile.professional_type
            ? [profile.professional_type]
            : [];

        const hasCompletedProfile =
          !!profile.full_name &&
          !!profile.role &&
          !!profile.terms_accepted &&
          !!profile.privacy_accepted &&
          (profile.role !== "professional" || savedProfessionalTypes.length > 0);

        if (hasCompletedProfile) {
          router.push(takeReturnTo() || "/requests");
          return;
        }

        setName(profile.full_name || "");
        setRole("");
        setProfessionalTypes([]);
        setAcceptedTerms(!!profile.terms_accepted);
        setAcceptedPrivacy(!!profile.privacy_accepted);
        setMarketingConsent(!!profile.marketing_consent);
      }

      setLoading(false);
    }

    checkExistingProfile();
  }, [router]);

  function toggleProfessionalType(value: string) {
    setProfessionalTypes((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setSaving(true);

    const user = await getSignedInUser();

    if (!user) {
      setSaving(false);
      setErrorMessage("Could not find signed-in user.");
      return;
    }

    if (!name.trim()) {
      setSaving(false);
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!role) {
      setSaving(false);
      setErrorMessage("Please select how you are joining.");
      return;
    }

    if (role === "professional" && professionalTypes.length === 0) {
      setSaving(false);
      setErrorMessage("Please choose at least one professional category.");
      return;
    }

    const cleanPhoneNumber = phoneNumber.trim();

    if (cleanPhoneNumber && !isLikelyValidPhoneNumber(cleanPhoneNumber)) {
      setSaving(false);
      setPhoneError("Enter your number in international format, e.g. +12045551234.");
      return;
    }

    if (smsNotificationsEnabled && !cleanPhoneNumber) {
      setSaving(false);
      setPhoneError("Add a phone number to turn on text alerts.");
      return;
    }

    setPhoneError("");

    if (!acceptedTerms) {
      setSaving(false);
      setErrorMessage("Please agree to the Terms of Service.");
      return;
    }

    if (!acceptedPrivacy) {
      setSaving(false);
      setErrorMessage("Please agree to the Privacy Policy.");
      return;
    }

    const now = new Date().toISOString();
    const primaryProfessionalType =
      role === "professional" ? professionalTypes[0] ?? null : null;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: name.trim(),
        role,
        professional_type: primaryProfessionalType,
        professional_types: role === "professional" ? professionalTypes : [],
        terms_accepted: acceptedTerms,
        terms_accepted_at: acceptedTerms ? now : null,
        privacy_accepted: acceptedPrivacy,
        privacy_accepted_at: acceptedPrivacy ? now : null,
        marketing_consent: marketingConsent,
        marketing_consent_at: marketingConsent ? now : null,
        marketing_consent_source: marketingConsent ? "account_creation" : null,
        unsubscribed_from_marketing: false,
        phone_number: cleanPhoneNumber || null,
        sms_notifications_enabled: cleanPhoneNumber ? smsNotificationsEnabled : false,
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // Professionals verify their credentials as part of signing up — until
    // approved they're hidden from Browse and can't send offers.
    // Customers who came from a booking link go straight back to it.
    router.push(role === "professional" ? "/verification" : takeReturnTo() || "/requests");
  }

  if (loading) {
    return <LuLoader />;
  }

  return (
    <main className="min-h-screen bg-paper text-neutral-900">
      {/* Minimal header — no nav to distract during setup */}
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="rounded text-xl font-semibold tracking-tight text-ink">
            LineUp
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Account setup
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-2 md:items-start md:py-20">
        {/* Left: copy — hidden on mobile so form is first */}
        <div className="hidden md:block md:pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Welcome to LineUp
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
            Let&apos;s set up your account.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-neutral-500">
            Tell us who you are and we&apos;ll personalise your experience — whether you&apos;re booking services or offering them.
          </p>

          <div className="mt-10 space-y-4">
            {[
              {
                icon: (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                    <path d="M8 1v7l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                ),
                text: "Takes less than a minute",
              },
              {
                icon: (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                    <rect x="2" y="7" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                ),
                text: "Your info is private and secure",
              },
              {
                icon: (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                    <path d="M11 2.5l2.5 2.5-7 7H4v-2.5l7-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                text: "Change your details anytime in settings",
              },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-sm text-neutral-500">
                <span className="shrink-0 text-neutral-400">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.18)] sm:p-8">
          {/* Mobile-only heading — desktop heading lives in the left column */}
          <div className="mb-6 md:hidden">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Account setup</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-neutral-900">Let&apos;s set up your account.</h1>
            <p className="mt-1.5 text-sm leading-6 text-neutral-500">Tell us who you are — takes less than a minute.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Name */}
            <div>
              <label htmlFor="onboarding-name" className="mb-2 block text-sm font-medium text-neutral-800">
                Full name
              </label>
              <input
                id="onboarding-name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-ink focus:bg-white"
              />
            </div>

            {/* Role — visual cards instead of select */}
            <div>
              <label className="mb-3 block text-sm font-semibold text-neutral-700">
                How are you joining?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={role === "customer"}
                  onClick={() => { setRole("customer"); setProfessionalTypes([]); }}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                    role === "customer"
                      ? "border-ink bg-ink text-white"
                      : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                  }`}
                >
                  <ShoppingBag className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">Customer</p>
                    <p className={`mt-0.5 text-xs leading-5 ${role === "customer" ? "text-white/70" : "text-neutral-500"}`}>
                      Book beauty & style services
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={role === "professional"}
                  onClick={() => setRole("professional")}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                    role === "professional"
                      ? "border-ink bg-ink text-white"
                      : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                  }`}
                >
                  <Briefcase className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-semibold">Professional</p>
                    <p className={`mt-0.5 text-xs leading-5 ${role === "professional" ? "text-white/70" : "text-neutral-500"}`}>
                      Offer your services & get booked
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Professional categories */}
            {role === "professional" ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-semibold text-neutral-700">
                    What do you offer?
                  </label>
                  {professionalTypes.length > 0 ? (
                    <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
                      {professionalTypes.length} selected
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-neutral-500">Select all that apply — you can add more later.</p>
                <div className="grid grid-cols-2 gap-2">
                  {PROFESSIONAL_OPTIONS.map((option) => {
                    const isSelected = professionalTypes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleProfessionalType(option.value)}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition active:scale-[0.98] ${
                          isSelected
                            ? "border-ink bg-ink text-white"
                            : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                        }`}
                      >
                        <option.Icon className="h-4 w-4 shrink-0" />
                        {option.label}
                        {isSelected ? (
                          <Check aria-hidden="true" className="ml-auto h-4 w-4 text-white/80" strokeWidth={2.25} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Phone / text alerts — hidden for now in favor of push
                notifications (free, no account needed); code kept so this
                can come back if SMS is ever worth turning on. */}
            {SMS_SIGNUP_UI_ENABLED ? (
              <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-neutral-700">
                    Phone number <span className="font-normal text-neutral-400">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setPhoneError("");
                    }}
                    placeholder="+12045551234"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ink"
                  />
                  {phoneError ? (
                    <p className="mt-1.5 text-xs text-red-600">{phoneError}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-neutral-500">International format, e.g. +1 for Canada/US.</p>
                  )}
                </div>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                  type="checkbox"
                  checked={smsNotificationsEnabled}
                  onChange={(e) => setSmsNotificationsEnabled(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                    smsNotificationsEnabled ? "border-ink bg-ink" : "border-neutral-300 bg-white"
                  }`}
                >
                  {smsNotificationsEnabled ? (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5" fill="none">
                      <path d="M1 4l2.5 2.5L9 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : null}
                </span>
                  <span className="text-sm leading-6 text-neutral-700">
                    Text me time-sensitive alerts — new offers, matching requests, and upcoming
                    appointments. Faster than email. You can turn this off anytime in Account settings.
                  </span>
                </label>
              </div>
            ) : null}

            {/* Legal */}
            <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                    acceptedTerms ? "border-ink bg-ink" : "border-neutral-300 bg-white"
                  }`}
                >
                  {acceptedTerms ? (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5" fill="none">
                      <path d="M1 4l2.5 2.5L9 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : null}
                </span>
                <span className="text-sm leading-6 text-neutral-700">
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
                    Terms of Service
                  </a>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                    acceptedPrivacy ? "border-ink bg-ink" : "border-neutral-300 bg-white"
                  }`}
                >
                  {acceptedPrivacy ? (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5" fill="none">
                      <path d="M1 4l2.5 2.5L9 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : null}
                </span>
                <span className="text-sm leading-6 text-neutral-700">
                  I agree to the{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
                    Privacy Policy
                  </a>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
                    marketingConsent ? "border-ink bg-ink" : "border-neutral-300 bg-white"
                  }`}
                >
                  {marketingConsent ? (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5" fill="none">
                      <path d="M1 4l2.5 2.5L9 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : null}
                </span>
                <span className="text-sm leading-6 text-neutral-500">
                  Send me LineUp news, launch updates, and promotions. Unsubscribe anytime.
                </span>
              </label>
            </div>

            {/* Error */}
            {errorMessage ? (
              <div role="alert" className="lu-fade-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {/* Submit */}
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
            >
              {saving ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              {saving
                ? "Setting up your account…"
                : role === "professional"
                ? "Set up my professional account"
                : role === "customer"
                ? "Set up my account"
                : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
