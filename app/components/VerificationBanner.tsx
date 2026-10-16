"use client";

import Link from "next/link";
import { isVerifiedNow, todayDateString } from "@/app/lib/verificationRules";
import { useVerificationState } from "@/app/lib/useVerificationState";

const RENEW_WARNING_DAYS = 30;

function daysUntil(date: string) {
  const ms = new Date(`${date}T00:00:00`).getTime() - new Date(`${todayDateString()}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Drop this at the top of any professional page. It loads its own state, and
// renders nothing for customers, while loading, or when there's nothing to say.
export default function VerificationBanner() {
  const state = useVerificationState();

  if (!state) return null;

  const { status, until, track, submittedTrack } = state;
  const verified = isVerifiedNow({ verification_status: status, verified_until: until });

  if (verified) {
    const days = until ? daysUntil(until) : null;
    const expiringSoon = days !== null && days <= RENEW_WARNING_DAYS;
    const isStudent = track === "student";

    // Licensed and comfortably valid: nothing to show.
    if (!isStudent && !expiringSoon) return null;

    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-semibold text-neutral-900">
            {isStudent ? (
              <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                Student
              </span>
            ) : null}
            {expiringSoon
              ? `Your verification ${days! <= 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`}`
              : "You're verified as a student"}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {isStudent
              ? `Clients see a Student badge on your profile.${
                  until
                    ? ` Your approval ends ${formatDate(until)}, when your program finishes — submit your licence then to stay visible.`
                    : ""
                }`
              : "Submit a current credential to stay visible in Browse."}
          </p>
        </div>
        <Link
          href="/verification"
          className="inline-flex shrink-0 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white"
        >
          {expiringSoon ? "Renew" : "Manage"}
        </Link>
      </div>
    );
  }

  const student = submittedTrack === "student";

  if (status === "pending") {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div>
          <p className="font-semibold text-neutral-900">
            Your {student ? "proof of enrollment" : "credentials"} {student ? "is" : "are"} under review
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Until you&apos;re approved you can&apos;t appear in Browse, send offers, or be booked. We&apos;ll email
            you as soon as it&apos;s reviewed.
          </p>
        </div>
        <Link
          href="/verification"
          className="inline-flex shrink-0 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white"
        >
          View status
        </Link>
      </div>
    );
  }

  // Never verified, rejected, or lapsed: the blocking message.
  const copy =
    status === "rejected"
      ? {
          title: "We couldn't approve your verification",
          body: "You can't take clients until you're verified. See what to fix and resubmit.",
          cta: "Fix and resubmit",
        }
      : status === "expired" || status === "verified"
      ? {
          title: "Your verification has expired",
          body: "You're hidden from Browse and can't send offers or be booked until you submit a current credential.",
          cta: "Renew now",
        }
      : {
          title: "Verify to start using LineUp",
          body: "You can't use LineUp to get clients until you're verified — you won't appear in Browse, can't send offers, and can't be booked.",
          cta: "Verify now",
        };

  return (
    <div className="mt-8 rounded-2xl border border-ink bg-surface p-5 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Verification required</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{copy.title}</p>
          <p className="mt-1 text-sm text-neutral-600">{copy.body}</p>
          <p className="mt-1 text-sm text-neutral-600">
            Licensed? Add your licence number and a photo. Still studying? Add proof of enrollment — you&apos;ll
            get a Student badge.
          </p>
        </div>
        <Link
          href="/verification"
          className="inline-flex shrink-0 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          {copy.cta}
        </Link>
      </div>
    </div>
  );
}
