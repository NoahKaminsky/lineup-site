"use client";

import { useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function MarkRequestNotificationRead({
  requestId,
}: {
  requestId: string;
}) {
  useEffect(() => {
    const markRead = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !requestId) return;

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("request_id", requestId)
        .eq("is_read", false);
    };

    markRead();
  }, [requestId]);

  return null;
}