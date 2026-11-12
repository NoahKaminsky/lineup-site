"use client";

// Remembers a referral link (?ref=code) on this device for 60 days, so a pro
// who looks around before signing up is still tied to whoever invited them.
// Onboarding sends it to /api/referrals once they've joined as a pro.

import { useEffect } from "react";

const KEY = "lu-ref";
const TTL_MS = 60 * 86_400_000;

export function takeReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    return Date.now() - at < TTL_MS ? code : null;
  } catch {
    return null;
  }
}

export default function ReferralCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code && /^[a-z0-9]{4,24}$/i.test(code)) localStorage.setItem(KEY, JSON.stringify({ code: code.toLowerCase(), at: Date.now() }));
    } catch {
      /* storage unavailable */
    }
  }, []);
  return null;
}
