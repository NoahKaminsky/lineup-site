"use client";

import { useEffect, useState } from "react";
import { DrawnCheck, MaskLine } from "@/app/components/moments/Moments";

// Shown once, right after someone clicks the confirmation link in their
// signup email. /auth/callback leaves a short-lived `lu_email_confirmed`
// cookie on the redirect ("1" = signed in and on their way, "signin" = the
// email is confirmed but they still need to sign in, e.g. the link was opened
// in a different browser). We read it, clear it straight away so it never
// shows twice, and tell the person what just happened.
const COOKIE = "lu_email_confirmed";

function readAndClearCookie(): string | null {
  try {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`));
    if (!match) return null;
    document.cookie = `${COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
    return decodeURIComponent(match.slice(COOKIE.length + 1)) || null;
  } catch {
    return null;
  }
}

export default function EmailConfirmedModal() {
  const [state, setState] = useState<"signedIn" | "signin" | null>(null);

  useEffect(() => {
    const value = readAndClearCookie();
    if (!value) return;
    // Let the first-visit splash screen (~700ms) clear before the moment plays.
    const timer = window.setTimeout(() => setState(value === "signin" ? "signin" : "signedIn"), 750);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setState(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!state) return null;

  const needsSignIn = state === "signin";
  const close = () => setState(null);

  return (
    <div
      className="lu-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lu-email-confirmed-title"
        onClick={(event) => event.stopPropagation()}
        className="lu-sheet-in w-full max-w-md rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.3)] sm:p-8"
      >
        <DrawnCheck size={52} delay={120} />

        <h2
          id="lu-email-confirmed-title"
          className="mt-7 text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink"
        >
          <MaskLine delay={200}>Email confirmed.</MaskLine>
          <MaskLine delay={290} className="text-neutral-500">
            {needsSignIn ? "Sign in to keep going." : "You're all set."}
          </MaskLine>
        </h2>

        <p className="lu-fade-in mt-4 text-sm leading-6 text-neutral-600">
          {needsSignIn
            ? "Your LineUp account is verified. Sign in with the email and password you just created to finish setting up."
            : "Your LineUp account is verified and you're signed in. Let's finish setting things up."}
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={close}
            autoFocus
            className="rounded-full bg-ink px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            {needsSignIn ? "Sign in" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
