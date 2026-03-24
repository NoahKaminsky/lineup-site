"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Account created. Please sign in.");
        setIsSignup(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, professional_type")
        .eq("id", user.id)
        .single();

      const hasCompletedProfile =
        !!profile?.full_name &&
        !!profile?.role &&
        (profile.role !== "professional" || !!profile.professional_type);

      router.push(hasCompletedProfile ? "/account" : "/onboarding");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Could not load your account.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, professional_type")
      .eq("id", user.id)
      .single();

    const hasCompletedProfile =
      !!profile?.full_name &&
      !!profile?.role &&
      (profile.role !== "professional" || !!profile.professional_type);

    router.push(hasCompletedProfile ? "/account" : "/onboarding");
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
            {isSignup ? "Create account" : "Sign in"}
          </p>

          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight md:text-6xl">
            {isSignup ? "Create your LineUp account." : "Sign in to LineUp."}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-600">
            {isSignup
              ? "Create an account to access LineUp as a client or beauty professional."
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
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-black py-3 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading
                ? "Loading..."
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSignup(!isSignup);
                setMessage("");
              }}
              className="w-full text-sm font-medium text-neutral-600 underline underline-offset-4"
            >
              {isSignup
                ? "Already have an account? Sign in"
                : "Don’t have an account? Create one"}
            </button>

            {message ? (
              <p className="text-sm text-red-600">{message}</p>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  );
}