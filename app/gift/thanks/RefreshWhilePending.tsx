"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Stripe can still say "unpaid" for a moment after Checkout sends the buyer
// back, so the card may not be switched on yet when this page first renders.
// Look again every few seconds (about 30s at most) until it is.
export default function RefreshWhilePending({ tries = 10, everyMs = 3000 }: { tries?: number; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      if (n > tries) return window.clearInterval(id);
      router.refresh();
    }, everyMs);
    return () => window.clearInterval(id);
  }, [router, tries, everyMs]);
  return null;
}
