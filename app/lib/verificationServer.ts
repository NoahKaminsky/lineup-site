import { getServiceSupabase } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { todayDateString, type VerificationStatus, type VerificationTrack } from "@/app/lib/verificationRules";

type VerificationRow = {
  track: VerificationTrack;
  status: "pending" | "approved" | "rejected";
  license_expiry: string | null;
  enrollment_end_date: string | null;
  reviewed_at: string | null;
};

function expiryOf(row: VerificationRow) {
  return row.track === "student" ? row.enrollment_end_date : row.license_expiry;
}

// Recomputes profiles.verification_* from the professional's submitted
// credentials. This is the only place those columns are derived, so the
// aggregate can never drift from what an admin actually approved.
export async function recomputeProfileVerification(
  professionalId: string
): Promise<VerificationStatus> {
  const service = getServiceSupabase();

  const { data } = await service
    .from("professional_verifications")
    .select("track, status, license_expiry, enrollment_end_date, reviewed_at")
    .eq("professional_id", professionalId);

  const rows = (data || []) as VerificationRow[];
  const today = todayDateString();

  const liveApproved = rows.filter(
    (row) => row.status === "approved" && (!expiryOf(row) || expiryOf(row)! >= today)
  );

  let status: VerificationStatus = "unverified";
  let track: VerificationTrack | null = null;
  let verifiedUntil: string | null = null;
  let verifiedAt: string | null = null;

  if (liveApproved.length > 0) {
    status = "verified";
    track = liveApproved.some((row) => row.track === "licensed") ? "licensed" : "student";
    const expiries = liveApproved.map(expiryOf);
    // Any live credential with no expiry keeps them verified indefinitely.
    verifiedUntil = expiries.some((e) => !e) ? null : (expiries as string[]).sort().at(-1)!;
    verifiedAt =
      liveApproved
        .map((row) => row.reviewed_at)
        .filter(Boolean)
        .sort()
        .at(-1) || new Date().toISOString();
  } else if (rows.some((row) => row.status === "pending")) {
    status = "pending";
  } else if (rows.some((row) => row.status === "approved")) {
    status = "expired";
  } else if (rows.some((row) => row.status === "rejected")) {
    status = "rejected";
  }

  await service
    .from("profiles")
    .update({
      verification_status: status,
      verification_track: track,
      verified_at: verifiedAt,
      verified_until: verifiedUntil,
    })
    .eq("id", professionalId);

  return status;
}

export async function notifyVerificationOutcome(params: {
  professionalId: string;
  outcome: "approved" | "rejected" | "expired";
  reason?: string | null;
}) {
  const service = getServiceSupabase();
  const { professionalId, outcome, reason } = params;

  const titles = {
    approved: "You're verified — you're now visible in Browse and can send offers",
    rejected: "We couldn't verify your credentials — see what to fix",
    expired: "Your verification has expired — resubmit to stay visible",
  } as const;

  await service.from("notifications").insert([
    {
      user_id: professionalId,
      is_read: false,
      type: `verification_${outcome}`,
      title: titles[outcome],
    },
  ]);

  // Email is best-effort — the in-app notification and dashboard banner are
  // the source of truth, so a mail failure shouldn't fail the review action.
  try {
    const { data: profile } = await service
      .from("profiles")
      .select("email, full_name")
      .eq("id", professionalId)
      .maybeSingle();

    if (!profile?.email) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";
    const firstName = profile.full_name?.split(" ")[0] || "there";

    const bodies = {
      approved: `<p style="margin:0 0 16px 0;">Hey ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px 0;">Your credentials have been reviewed and approved. You're now visible in Browse and can send offers on requests.</p>`,
      rejected: `<p style="margin:0 0 16px 0;">Hey ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px 0;">We weren't able to approve the credentials you submitted.</p>
        ${
          reason
            ? `<p style="margin:0 0 16px 0;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`
            : ""
        }
        <p style="margin:0 0 16px 0;">You can submit updated documents any time.</p>`,
      expired: `<p style="margin:0 0 16px 0;">Hey ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 16px 0;">Your verified credentials have passed their expiry date, so your profile is hidden from Browse until you submit a current one.</p>`,
    } as const;

    const ctas = {
      approved: "Go to your dashboard",
      rejected: "Update your credentials",
      expired: "Renew your credentials",
    } as const;

    const html = createEmailLayout({
      title: outcome === "approved" ? "You're verified" : "Verification update",
      preview: titles[outcome],
      ctaLabel: ctas[outcome],
      ctaUrl: `${siteUrl}${outcome === "approved" ? "/requests" : "/verification"}`,
      content: bodies[outcome],
    });

    await sendEmail({
      to: profile.email,
      subject: outcome === "approved" ? "You're verified on LineUp" : "Update on your LineUp verification",
      html,
    });
  } catch (error) {
    console.error("Verification email failed:", error);
  }
}
