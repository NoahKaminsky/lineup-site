"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import LuLoader from "@/app/components/LuLoader";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import { loginHref, rememberReturnTo } from "@/app/lib/returnTo";
import { studioFetch } from "../studioApi";

type Preview = { studioName: string; invitedEmail: string; expired: boolean };

function JoinStudio() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const returnPath = `/studio/join?token=${encodeURIComponent(token)}`;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [wrongAccount, setWrongAccount] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("This invite link is incomplete. Ask the studio to send it again.");
        setLoading(false);
        return;
      }
      const [res, user] = await Promise.all([
        studioFetch<Preview>(`/api/studio/join?token=${encodeURIComponent(token)}`),
        getSignedInUser(),
      ]);
      if (!res.ok) setError(res.data.error || "This invite isn't valid anymore.");
      else setPreview(res.data);
      setSignedInEmail(user?.email || null);
      // So sign-up (through email confirmation) and onboarding come back here.
      rememberReturnTo(returnPath);
      setLoading(false);
    })();
  }, [token, returnPath]);

  async function join() {
    setJoining(true);
    setError("");
    const res = await studioFetch<{ studioName?: string }>("/api/studio/join", { method: "POST", body: { token } });
    setJoining(false);

    if (res.ok) {
      router.push("/studio");
      return;
    }
    if (res.data.code === "needs_onboarding") {
      router.push(`/onboarding?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    setWrongAccount(res.data.code === "wrong_account");
    setError(res.data.error || "Could not join the studio.");
  }

  async function switchAccount() {
    await supabase.auth.signOut();
    router.push(loginHref(returnPath));
  }

  if (loading) return <LuLoader />;

  return (
    <main className="min-h-screen bg-paper text-neutral-900">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="rounded text-xl font-semibold tracking-tight text-ink">
            LineUp
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Studio invite</span>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-16 md:py-24">
        <div className="rounded-2xl border border-hairline bg-surface p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.18)] sm:p-9">
          {preview ? (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">You&apos;re invited</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Join {preview.studioName}</h1>
              <p className="mt-4 text-sm leading-6 text-neutral-600">
                You&apos;ll keep your own LineUp login, profile, services and calendar. The studio covers your plan and
                can see the team&apos;s schedule.
              </p>
              <p className="mt-3 text-sm text-neutral-500">
                Sent to <span className="font-medium text-neutral-800">{preview.invitedEmail}</span>
              </p>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {preview && !preview.expired ? (
            signedInEmail ? (
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={join}
                  disabled={joining}
                  className="w-full rounded-full bg-ink py-3.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                >
                  {joining ? "Joining…" : `Join ${preview.studioName}`}
                </button>
                <p className="text-center text-xs text-neutral-500">
                  Signed in as {signedInEmail}.{" "}
                  {wrongAccount ? (
                    <button type="button" onClick={switchAccount} className="font-medium text-ink underline underline-offset-2">
                      Switch account
                    </button>
                  ) : null}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <Link
                  href={loginHref(returnPath, "signup")}
                  className="block w-full rounded-full bg-ink py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                  Create my account
                </Link>
                <Link
                  href={loginHref(returnPath)}
                  className="block w-full rounded-full border border-neutral-300 py-3 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                >
                  I already use LineUp
                </Link>
                <p className="text-center text-xs text-neutral-500">Use the email address this invite was sent to.</p>
              </div>
            )
          ) : preview?.expired ? (
            <p className="mt-6 text-sm text-neutral-600">This invite has expired. Ask the studio to send a new one.</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function JoinStudioPage() {
  return (
    <Suspense fallback={<LuLoader />}>
      <JoinStudio />
    </Suspense>
  );
}
