"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import EarningsReport from "@/app/components/earnings/EarningsReport";

// A pro's own earnings, for their records and their accountant. Free on every
// plan: everyone has to file taxes.
export default function EarningsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [onShop, setOnShop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/earnings");
        return;
      }
      const [{ data: profile }, { data: member }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("studio_members").select("role").eq("profile_id", user.id).eq("status", "active").maybeSingle(),
      ]);
      const role = String(profile?.role || "").toLowerCase();
      if (!role || role.includes("customer")) {
        router.replace("/requests");
        return;
      }
      if (cancelled) return;
      setOnShop(member?.role === "owner" || member?.role === "manager");
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-neutral-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl py-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Earnings</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
          What you made, month by month: bookings, tips, walk-ins, gift cards and fees. Download the CSV for your accountant at
          tax time.
          {onShop ? (
            <>
              {" "}
              For the whole shop, open{" "}
              <Link href="/studio/earnings" className="font-medium text-ink underline underline-offset-2">
                your shop&apos;s earnings
              </Link>
              .
            </>
          ) : null}
        </p>
        <div className="mt-8">{ready ? <EarningsReport scope="me" /> : <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />}</div>
      </div>
    </main>
  );
}
