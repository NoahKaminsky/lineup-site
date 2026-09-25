import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { todayDateString } from "@/app/lib/verificationRules";
import {
  notifyVerificationOutcome,
  recomputeProfileVerification,
} from "@/app/lib/verificationServer";

// Licences run out and students graduate, so an approval isn't permanent.
// isVerifiedNow() already hides an expired professional the moment their
// date passes; this daily sweep just makes the stored status match and lets
// them know to renew.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const service = getServiceSupabase();

    const { data: lapsed, error } = await service
      .from("profiles")
      .select("id")
      .eq("verification_status", "verified")
      .not("verified_until", "is", null)
      .lt("verified_until", todayDateString());

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let expired = 0;

    for (const profile of lapsed || []) {
      const status = await recomputeProfileVerification(profile.id);

      if (status === "expired") {
        expired += 1;
        await notifyVerificationOutcome({ professionalId: profile.id, outcome: "expired" });
      }
    }

    return NextResponse.json({ ok: true, checked: (lapsed || []).length, expired });
  } catch (err) {
    console.error("Verification expiry cron error:", err);
    return NextResponse.json({ error: "Expiry sweep failed" }, { status: 500 });
  }
}
