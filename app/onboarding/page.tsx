"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const PROFESSIONAL_OPTIONS = [
  { label: "Barber", value: "barber" },
  { label: "Hairstylist", value: "hairstylist" },
  { label: "Nail Artist", value: "nail_artist" },
  { label: "Lash Artist", value: "lash_artist" },
  { label: "Brow Artist", value: "brow_artist" },
  { label: "Makeup Artist", value: "makeup_artist" },
  { label: "Wax Technician", value: "wax_technician" },
];

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [professionalTypes, setProfessionalTypes] = useState<string[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkExistingProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(
          `
            full_name,
            role,
            professional_type,
            professional_types,
            terms_accepted,
            privacy_accepted,
            marketing_consent
          `
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
          router.push("/account");
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
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
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push("/account");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-6xl py-16">
          <p className="text-neutral-500">Loading...</p>
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

        <p className="text-sm font-medium text-neutral-500">Account setup</p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 py-16 md:grid-cols-2 md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Welcome to LineUp
          </p>

          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight md:text-6xl">
            Finish setting up your account.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600">
            Tell us a bit about yourself so we can personalize your experience on
            the marketplace.
          </p>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Full name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                How are you joining?
              </label>
              <select
                required
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  if (e.target.value !== "professional") {
                    setProfessionalTypes([]);
                  }
                }}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              >
                <option value="">Select one</option>
                <option value="customer">Customer</option>
                <option value="professional">Professional</option>
              </select>
            </div>

            {role === "professional" && (
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700">
                      Professional categories
                    </label>
                    <p className="mt-1 text-sm text-neutral-500">
                      Select every service you offer.
                    </p>
                  </div>

                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                    {professionalTypes.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {PROFESSIONAL_OPTIONS.map((option) => {
                    const isSelected = professionalTypes.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleProfessionalType(option.value)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition active:scale-[0.99] ${
                          isSelected
                            ? "border-black bg-black text-white shadow-sm"
                            : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <label className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="text-black underline"
                  >
                    Terms of Service
                  </a>
                  .
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    className="text-black underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm leading-6 text-neutral-600">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I want to receive newsletters, launch updates, promotions, and
                  product news from LineUp Aesthetics. I can unsubscribe at any
                  time.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-black py-3 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Continue"}
            </button>

            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  );
}
