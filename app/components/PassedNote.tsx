"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { studioFetch } from "@/app/studio/studioApi";

// "Sam at Northside Barbers passed this to you." on a request a pro's shop
// handed them. Renders nothing for anyone else.
export default function PassedNote({ requestId }: { requestId: string }) {
  const [note, setNote] = useState<{ by: string; shop: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    studioFetch<{ passed?: { by: string; shop: string }[] }>(`/api/studio/requests/passed?requestId=${encodeURIComponent(requestId)}`).then((res) => {
      if (!cancelled && res.ok && res.data.passed?.length) setNote(res.data.passed[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [requestId]);
  if (!note) return null;
  return (
    <p className="lu-fade-in mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white">
      <Store className="h-3.5 w-3.5" aria-hidden="true" />
      {note.by} at {note.shop} passed this to you
    </p>
  );
}
