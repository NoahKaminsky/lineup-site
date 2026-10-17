"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { LuMarkPaths } from "@/app/components/LuMark";

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

    if (params.get("mode") === "forgot") {
      setMode("forgot");
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
        const cleanEmail = email.trim().toLowerCase();
        setEmail(cleanEmail);

        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: getAuthCallbackUrl("/reset-password"),
        });

        if (error) {
          const rateLimited =
            error.status === 429 || /rate limit|too many|security purposes/i.test(error.message);

          setMessageTone("error");
          setMessage(
            rateLimited
              ? "Too many reset emails have been requested just now. Please wait a few minutes and try again."
              : error.message
          );
          return;
        }

        setMessageTone("success");
        setMessage(
          "If an account exists for that email, a reset link is on its way. It can take a few minutes — check your spam folder, and open the link in this same browser."
        );
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
    <main className="min-h-screen bg-paper text-neutral-900">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="rounded text-xl font-semibold tracking-tight text-ink">
            LineUp
          </Link>

          <Link href="/" className="rounded text-sm text-neutral-500 transition-colors hover:text-ink">
            Back to site
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center md:gap-16 md:py-24">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            {isForgot ? "Reset password" : isSignup ? "Create account" : "Sign in"}
          </p>

          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
            {isForgot
              ? "Reset your LineUp password."
              : isSignup
              ? "Create your LineUp account."
              : "Sign in to LineUp."}
          </h1>

          <p className="mt-5 max-w-md text-lg leading-8 text-neutral-600">
            {isForgot
              ? "Enter your email and we’ll send you a secure password reset link."
              : isSignup
              ? "Create an account, confirm your email, then sign in to finish setup."
              : "Access your LineUp account with your email and password."}
          </p>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.18)] sm:p-9">
          <form onSubmit={handleAuth} className="space-y-5" aria-busy={loading}>
            <div>
              <label htmlFor="auth-email" className="mb-2 block text-sm font-medium text-neutral-800">
                Email
              </label>

              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-neutral-200 bg-paper/60 px-4 py-3 outline-none transition-colors placeholder:text-neutral-400 focus:border-ink focus:bg-surface"
              />
            </div>

            {!isForgot ? (
              <div>
                <label htmlFor="auth-password" className="mb-2 block text-sm font-medium text-neutral-800">
                  Password
                </label>

                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  aria-describedby={isSignup ? "auth-password-hint" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "Create a password" : "Enter your password"}
                  className="w-full rounded-xl border border-neutral-200 bg-paper/60 px-4 py-3 outline-none transition-colors placeholder:text-neutral-400 focus:border-ink focus:bg-surface"
                />
                {isSignup ? (
                  <p id="auth-password-hint" className="mt-2 text-xs text-neutral-500">
                    At least 6 characters.
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
            >
              {loading ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              {loading
                ? isForgot
                  ? "Sending link…"
                  : isSignup
                  ? "Creating account…"
                  : "Signing in…"
                : isForgot
                ? "Send reset link"
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>

            <div className="flex flex-col items-center gap-2.5 border-t border-hairline pt-5">
            {!isForgot ? (
              <button
                type="button"
                onClick={() => switchMode(isSignup ? "signin" : "signup")}
                className="rounded text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
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
                className="rounded text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                {isForgot ? "Back to sign in" : "Forgot password?"}
              </button>
            ) : null}
            </div>

            {message ? (
              <p
                role={messageTone === "success" ? "status" : "alert"}
                className={`lu-fade-in rounded-xl border px-4 py-3 text-sm leading-6 ${
                  messageTone === "success"
                    ? "border-neutral-200 bg-neutral-50 text-neutral-800"
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
        <div className="lu-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-email-title"
            className="lu-dialog-in w-full max-w-md rounded-2xl bg-surface p-8 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35)]"
          >
            {/* LineUp lockup: the brush mark (public/images/logo.svg) beside the
                wordmark, painted in left to right as the dialog opens. */}
            <div
              className="flex items-center justify-center gap-1.5"
              style={{ animation: "lu-logo-reveal 900ms var(--ease-arrive) 120ms both" }}
            >
              <svg viewBox="0 0 1024 1024" aria-hidden="true" className="-my-2 h-14 w-14 text-ink">
                <LuMarkPaths />
              </svg>
              <span className="text-2xl font-semibold tracking-[-0.04em] text-ink">LineUp</span>
            </div>

            <h2 id="confirm-email-title" className="mt-6 text-center text-2xl font-semibold tracking-[-0.03em]">
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
                {resending ? "Sending…" : "Resend confirmation email"}
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
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
