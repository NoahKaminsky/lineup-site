"use client";

import Link from "next/link";
import { isVerifiedNow, todayDateString } from "@/app/lib/verificationRules";

const RENEW_WARNING_DAYS = 30;

function daysUntil(date: string) {
  const ms = new Date(`${date}T00:00:00`).getTime() - new Date(`${todayDateString()}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export default function VerificationBanner({
  status,
  verifiedUntil,
}: {
  status: string | null | undefined;
  verifiedUntil: string | null | undefined;
}) {
  const verified = isVerifiedNow({ verification_status: status, verified_until: verifiedUntil });

  if (verified) {
    if (!verifiedUntil) return null;
    const days = daysUntil(verifiedUntil);
    if (days > RENEW_WARNING_DAYS) return null;

    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div>
          <p className="font-semibold text-neutral-900">
            Your verification {days <= 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Submit a current credential to stay visible in Browse.
          </p>
        </div>
        <Link
          href="/verification"
          className="inline-flex shrink-0 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-white"
        >
          Renew
        </Link>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <div>
          <p className="font-semibold text-neutral-900">Your credentials are under review</p>
          <p className="mt-1 text-sm text-neutral-500">
            You&apos;ll be visible in Browse and able to send offers once they&apos;re approved. We&apos;ll email you.
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

  const copy =
    status === "rejected"
      ? { title: "We couldn't approve your credentials", body: "See what to fix and resubmit to get visible in Browse.", cta: "Fix and resubmit" }
      : status === "expired" || status === "verified"
      ? { title: "Your verification has expired", body: "You're hidden from Browse and can't send offers until you submit a current credential.", cta: "Renew now" }
      : { title: "Verify your credentials to get started", body: "Until you're approved you won't appear in Browse and can't send offers or be booked.", cta: "Verify now" };

  return (
    <div className="mt-8 rounded-2xl border border-neutral-900 bg-neutral-900 p-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/60">Action needed</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{copy.title}</p>
          <p className="mt-1 text-sm text-white/70">{copy.body}</p>
        </div>
        <Link
          href="/verification"
          className="inline-flex shrink-0 rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-900 transition hover:opacity-90"
        >
          {copy.cta}
        </Link>
      </div>
    </div>
  );
}
