"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";
import { buttonClass } from "@/app/components/ui";

// Share the shop: the phone's share sheet where there is one, else copy the link.
export default function ShopShare({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split("?")[0];
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }
  return (
    <button type="button" onClick={share} className={buttonClass("secondary", "md", "shrink-0")}>
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share className="h-4 w-4" aria-hidden="true" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
