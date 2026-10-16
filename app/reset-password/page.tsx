"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type LinkState = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  // Set when the email link carries a token instead of an already-created
  // session (the format that works across browsers/devices). It's redeemed
  // only when the form is submitted, so an email scanner that merely opens
  // the link can't use it up.
  const [tokenHash, setTokenHash] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = params.get("token_hash");

      if (hash && params.get("type") === "recovery") {
        if (cancelled) return;
        setTokenHash(hash);
        setLinkState("ready");
        return;
      }

      // Otherwise the link should already have signed them in (via
      // /auth/callback, or tokens in the URL fragment). No session means the
      // link was expired, already used, or opened somewhere it can't work.
      let {
        data: { session },
      } = await supabase.auth.getSession();

      // A session created a moment ago (by the callback, or from tokens in the
      // URL) can take a beat to register — look once more before calling the
      // link dead.
      if (!session) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (cancelled) return;
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }

      if (cancelled) return;
      setLinkState(session ? "ready" : "invalid");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessageTone("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessageTone("error");
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (verifyError) {
          setLinkState("invalid");
          return;
        }

        // Redeemed — from here on the session it created is what counts, so a
        // retry (e.g. after a weak-password error) must not try the token again.
        setTokenHash(null);
      }

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        if (/session/i.test(error.message)) {
          setLinkState("invalid");
          return;
        }

        setMessageTone("error");
        setMessage(error.message);
        return;
      }

      setMessageTone("success");
      setMessage("Password updated. Redirecting you to sign in...");

      await supabase.auth.signOut();

      setTimeout(() => {
        router.push("/login?reset=1");
      }, 900);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-6 py-10 text-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          LineUp
        </Link>

        <Link
          href="/login"
          className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
        >
          Back to sign in
        </Link>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Reset password
          </p>

          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
            {linkState === "invalid" ? "This link can't be used." : "Create a new password."}
          </h1>

          <p className="mt-5 max-w-md text-lg leading-8 text-neutral-600">
            {linkState === "invalid"
              ? "Reset links work once and expire after an hour."
              : "Enter a new password for your LineUp account."}
          </p>
        </div>

        <div className="rounded-panel border border-neutral-200 bg-white p-8 shadow-sm">
          {linkState === "checking" ? (
            <div className="space-y-4" aria-busy="true">
              <div className="h-12 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-12 animate-pulse rounded-2xl bg-neutral-100" />
              <div className="h-12 animate-pulse rounded-2xl bg-neutral-200" />
            </div>
          ) : linkState === "invalid" ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-neutral-700">
                This reset link has expired, was already used, or was opened somewhere different from where
                you asked for it. That happens when an email app opens links in its own browser, or a mail
                filter opens the link before you do.
              </p>
              <p className="text-sm leading-6 text-neutral-700">
                Request a new link, then open it in the same browser you request it from (Safari or Chrome
                rather than inside your email app).
              </p>
              <Link
                href="/login?mode=forgot"
                className="block w-full rounded-2xl bg-ink py-3 text-center text-white transition hover:bg-neutral-800"
              >
                Get a new reset link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  New password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-ink"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-ink"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-ink py-3 text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update password"}
              </button>

              {message ? (
                <p
                  className={`rounded-2xl border p-4 text-sm ${
                    messageTone === "success"
                      ? "border-neutral-200 bg-neutral-50 text-neutral-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {message}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
