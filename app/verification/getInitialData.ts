// Server-only initial data for /verification — see app/requests/getInitialData.ts
// for the pattern this follows and why (duplicated query logic on purpose,
// falls back to a normal client cold load on any failure).

import { createSupabaseServerClient, getVerifiedUser } from "@/app/lib/serverSupabase";
import type { VerificationStatus, VerificationTrack } from "@/app/lib/verificationRules";

export type VerificationSubmission = {
  id: string;
  track: VerificationTrack;
  profession_type: string;
  jurisdiction: string | null;
  license_number: string | null;
  school_name: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  is_manual: boolean;
  license_expiry: string | null;
  enrollment_end_date: string | null;
  created_at: string;
};

export type VerificationProfile = {
  role: string | null;
  professional_type: string | null;
  professional_types: string[] | null;
  verification_status: VerificationStatus | null;
  verification_track: VerificationTrack | null;
  verified_until: string | null;
};

export type VerificationInitialData = {
  userId: string;
  profile: VerificationProfile;
  submissions: VerificationSubmission[];
};

export type VerificationInitialResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: VerificationInitialData }
  | { kind: "fallback" };

export async function getInitialVerificationData(): Promise<VerificationInitialResult> {
  const supabase = await createSupabaseServerClient();

  const user = await getVerifiedUser(supabase);

  if (!user) return { kind: "redirect", to: "/login" };

  try {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, professional_type, professional_types, verification_status, verification_track, verified_until")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profileRow?.role || "").toLowerCase();
    if (!profileRow || !role || role.includes("customer")) {
      return { kind: "redirect", to: "/requests" };
    }

    const { data: rows, error: submissionsError } = await supabase
      .from("professional_verifications")
      .select(
        "id, track, profession_type, jurisdiction, license_number, school_name, status, rejection_reason, is_manual, license_expiry, enrollment_end_date, created_at"
      )
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false });

    if (submissionsError) throw new Error(submissionsError.message);

    return {
      kind: "ok",
      data: {
        userId: user.id,
        profile: profileRow as VerificationProfile,
        submissions: (rows || []) as VerificationSubmission[],
      },
    };
  } catch (error) {
    console.error("getInitialVerificationData failed, falling back to client load:", error);
    return { kind: "fallback" };
  }
}
