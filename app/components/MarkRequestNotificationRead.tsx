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

      console.log("MARK READ DEBUG requestId:", requestId);
      console.log("MARK READ DEBUG user:", user);

      if (!user) return;

      const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("request_id", requestId)
        .eq("is_read", false)
        .select("*");

      console.log("MARK READ DEBUG updated rows:", data);
      console.log("MARK READ DEBUG error:", error);
    };

    if (requestId) {
      markRead();
    }
  }, [requestId]);

  return null;
}