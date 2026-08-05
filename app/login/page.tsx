"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type AuthMode = "signin" | "signup" | "forgot";

function getSiteUrl() {
  // Use current origin so local dev emails point to localhost, production emails point to production
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function getAuthCallbackUrl(nextPath?: string) {
  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
  return `${getSiteUrl()}/auth/callback${nextQuery}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resending, setResending] = useState(false);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("mode") === "signup") {
      setMode("signup");
    }

    if (params.get("confirmed") === "1") {
      setMessageTone("success");
      setMessage("Email confirmed successfully. Sign in to continue setup.");
      setMode("signin");
    }

    if (params.get("reset") === "1") {
      setMessageTone("success");
      setMessage("Your password was updated. You can sign in now.");
      setMode("signin");
    }
  }, []);

  async function redirectAfterLogin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessageTone("error");
      setMessage("Could not load your account.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "full_name, role, professional_type, professional_types, terms_accepted, privacy_accepted"
      )
      .eq("id", user.id)
      .maybeSingle();

    const professionalTypes = Array.isArray(profile?.professional_types)
      ? profile.professional_types
      : [];

    const hasCompletedProfile =
      !!profile?.full_name &&
      !!profile?.role &&
      !!profile?.terms_accepted &&
      !!profile?.privacy_accepted &&
      (profile.role !== "professional" ||
        !!profile?.professional_type ||
        professionalTypes.length > 0);

    router.push(hasCompletedProfile ? "/requests" : "/onboarding");
  }

  async function handleResendConfirmation() {
    if (!email) {
      setMessageTone("error");
      setMessage("Enter your email first.");
      return;
    }

    setResending(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: getAuthCallbackUrl("/login?confirmed=1"),
        },
      });

      if (error) {
        setMessageTone("error");
        setMessage(error.message);
        return;
      }

      setMessageTone("success");
      setMessage("Confirmation email resent.");
    } finally {
      setResending(false);
    }
  }

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMessage("");
    setMessageTone("error");
    setLoading(true);

    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthCallbackUrl("/reset-password"),
        });

        if (error) {
          setMessageTone("error");
          setMessage(error.message);
          return;
        }

        setMessageTone("success");
        setMessage("Check your email for a password reset link.");
        return;
      }

      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl("/login?confirmed=1"),
          },
        });

        if (error) {
          setMessageTone("error");
          setMessage(error.message);
          return;
        }

        setMessageTone("success");
        setMessage("Check your email to confirm your LineUp account.");
        setShowConfirmModal(true);
        setMode("signin");
        setPassword("");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessageTone("error");
        setMessage(error.message);
        return;
      }

      await redirectAfterLogin();
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setMessageTone("error");

    if (nextMode === "forgot") {
      setPassword("");
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          LineUp
        </Link>

        <Link
          href="/"
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
        >
          Back to site
        </Link>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            {isForgot ? "Reset password" : isSignup ? "Create account" : "Sign in"}
          </p>

          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight md:text-6xl">
            {isForgot
              ? "Reset your LineUp password."
              : isSignup
              ? "Create your LineUp account."
              : "Sign in to LineUp."}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600">
            {isForgot
              ? "Enter your email and we’ll send you a secure password reset link."
              : isSignup
              ? "Create an account, confirm your email, then sign in to finish setup."
              : "Access your LineUp account with your email and password."}
          </p>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Email
              </label>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            {!isForgot ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Password
                </label>

                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "Create a password" : "Enter your password"}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none transition focus:border-neutral-900"
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-black py-3 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading
                ? "Loading..."
                : isForgot
                ? "Send reset link"
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>

            {!isForgot ? (
              <button
                type="button"
                onClick={() => switchMode(isSignup ? "signin" : "signup")}
                className="w-full text-sm font-medium text-neutral-600 underline underline-offset-4"
              >
                {isSignup
                  ? "Already have an account? Sign in"
                  : "Don’t have an account? Create one"}
              </button>
            ) : null}

            {!isSignup ? (
              <button
                type="button"
                onClick={() => switchMode(isForgot ? "signin" : "forgot")}
                className="w-full text-sm font-medium text-neutral-600 underline underline-offset-4"
              >
                {isForgot ? "Back to sign in" : "Forgot password?"}
              </button>
            ) : null}

            {message ? (
              <p
                className={`rounded-2xl border p-4 text-sm ${
                  messageTone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message}
              </p>
            ) : null}
          </form>
        </div>
      </div>

      {showConfirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-2xl font-semibold text-white">
              LU
            </div>

            <h2 className="mt-6 text-center text-3xl font-semibold tracking-tight">
              Confirm your email
            </h2>

            <p className="mt-4 text-center text-sm leading-6 text-neutral-600">
              We sent a confirmation link to{" "}
              <span className="font-semibold text-neutral-900">{email}</span>.
              Click the link, then sign in to finish setting up your account.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resending}
                className="w-full rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-60"
              >
                {resending ? "Sending..." : "Resend confirmation email"}
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
