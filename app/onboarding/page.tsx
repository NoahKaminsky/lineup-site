"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [professionalType, setProfessionalType] = useState("");
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
            terms_accepted,
            privacy_accepted,
            marketing_consent
          `
        )
        .eq("id", user.id)
        .single();

      if (!error && profile) {
        const hasCompletedProfile =
          !!profile.full_name &&
          !!profile.role &&
          (profile.role !== "professional" || !!profile.professional_type);

        if (hasCompletedProfile) {
          router.push("/account");
          return;
        }

        setName(profile.full_name || "");
        setRole(profile.role || "");
        setProfessionalType(profile.professional_type || "");
        setAcceptedTerms(!!profile.terms_accepted);
        setAcceptedPrivacy(!!profile.privacy_accepted);
        setMarketingConsent(!!profile.marketing_consent);
      }

      setLoading(false);
    }

    checkExistingProfile();
  }, [router]);

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

    if (role === "professional" && !professionalType) {
      setSaving(false);
      setErrorMessage("Please choose your professional category.");
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

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        full_name: name.trim(),
        role,
        professional_type: role === "professional" ? professionalType : null,
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
                    setProfessionalType("");
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
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Professional category
                </label>
                <select
                  required
                  value={professionalType}
                  onChange={(e) => setProfessionalType(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
                >
                  <option value="">Select your category</option>
                  <option value="barber">Barber</option>
                  <option value="hairstylist">Hairstylist</option>
                  <option value="nail_artist">Nail Artist</option>
                  <option value="lash_artist">Lash Artist</option>
                  <option value="brow_artist">Brow Artist</option>
                  <option value="makeup_artist">Makeup Artist</option>
                  <option value="wax_technician">Wax Technician</option>
                </select>
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
                    className="underline text-black"
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
                    className="underline text-black"
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