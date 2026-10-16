"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LuLoader from "@/app/components/LuLoader";
import LandingPage from "@/app/components/landing/LandingPage";

// Signed-out home. Signed-in visitors go straight to their dashboard, so the
// landing page only mounts once auth has resolved to "nobody".
export default function Page() {
  const router = useRouter();
  const [authResolved, setAuthResolved] = useState<boolean>(false);

  useEffect(() => {
    const redirectIfSignedIn = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/requests");
        return;
      }

      setAuthResolved(true);
    };

    redirectIfSignedIn();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;

      if (user) {
        router.replace("/requests");
        return;
      }

      setAuthResolved(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (!authResolved) {
    return <LuLoader />;
  }

  return <LandingPage />;
}
