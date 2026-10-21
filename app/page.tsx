"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LandingPage from "@/app/components/landing/LandingPage";

// Signed-out home. Signed-in visitors are redirected to /requests by the
// middleware before this page is ever sent, so the landing page renders
// straight away (it used to sit on a loader until a network auth check
// finished). The check below is only a backstop for someone who signs in in
// another tab while this one is open.
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) router.replace("/requests");
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return <LandingPage />;
}
