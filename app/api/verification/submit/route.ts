import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { recomputeProfileVerification } from "@/app/lib/verificationServer";
import {
  JURISDICTIONS,
  MAX_PENDING_SUBMISSIONS,
  VERIFICATION_BUCKET,
  getStrictestLicensedRule,
  todayDateString,
} from "@/app/lib/verificationRules";
import { getSiteUrl } from "@/app/lib/siteUrl";

const NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 \-/._]{1,63}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addYears(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("role, full_name, professional_type, professional_types")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(profile?.role || "").toLowerCase();
  if (!role || role.includes("customer")) {
    return NextResponse.json({ error: "Only professionals can submit credentials." }, { status: 403 });
  }

  const track = body.track;
  if (track !== "licensed" && track !== "student") {
    return NextResponse.json({ error: "Choose whether you're licensed or a student." }, { status: 400 });
  }

  const ownTypes: string[] = Array.isArray(profile?.professional_types) && profile.professional_types.length > 0
    ? profile.professional_types
    : profile?.professional_type
    ? [profile.professional_type]
    : [];
  if (ownTypes.length === 0) {
    return NextResponse.json(
      { error: "Add your profession in your account settings first." },
      { status: 400 }
    );
  }
  // One submission covers every profession on the account. For licensed
  // pros the rule (and the profession recorded) is the strictest of theirs
  // in that province — see getStrictestLicensedRule. Whatever the browser
  // sends is ignored.
  let professionType = ownTypes[0];

  const { count: pendingCount } = await service
    .from("professional_verifications")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", user.id)
    .eq("status", "pending");

  if ((pendingCount || 0) >= MAX_PENDING_SUBMISSIONS) {
    return NextResponse.json(
      { error: "You already have credentials waiting for review. We'll email you once they're checked." },
      { status: 409 }
    );
  }

  const today = todayDateString();
  const row: Record<string, unknown> = {
    professional_id: user.id,
    track,
    profession_type: professionType,
    status: "pending",
  };
  let documentRequired = true;

  if (track === "licensed") {
    const jurisdiction = clean(body.jurisdiction, 20);
    if (!JURISDICTIONS.some((j) => j.value === jurisdiction)) {
      return NextResponse.json({ error: "Choose where you're licensed." }, { status: 400 });
    }

    const strictest = getStrictestLicensedRule(jurisdiction, ownTypes);
    const rule = strictest.rule;
    professionType = strictest.profession;
    row.profession_type = professionType;
    const licenseNumber = clean(body.licenseNumber, 64);
    const issuingBody = clean(body.issuingBody, 120);
    const licenseExpiry = clean(body.licenseExpiry, 10);

    if (rule.licenseNumber === "required" && !licenseNumber) {
      return NextResponse.json({ error: `Enter your ${rule.numberLabel.toLowerCase()}.` }, { status: 400 });
    }
    if (licenseNumber && !NUMBER_PATTERN.test(licenseNumber)) {
      return NextResponse.json({ error: "That credential number doesn't look right." }, { status: 400 });
    }
    if (rule.issuingBody === "required" && !issuingBody) {
      return NextResponse.json({ error: "Enter who issued your credential." }, { status: 400 });
    }
    if (rule.expiry === "required" && !licenseExpiry) {
      return NextResponse.json({ error: "Enter your credential's expiry date." }, { status: 400 });
    }
    if (licenseExpiry) {
      if (!DATE_PATTERN.test(licenseExpiry) || licenseExpiry < today || licenseExpiry > addYears(30)) {
        return NextResponse.json({ error: "That expiry date has already passed or isn't valid." }, { status: 400 });
      }
    }

    row.jurisdiction = jurisdiction;
    row.license_number = licenseNumber || null;
    row.issuing_body = issuingBody || null;
    row.license_expiry = licenseExpiry || null;
    documentRequired = rule.document === "required";
  } else {
    const schoolName = clean(body.schoolName, 120);
    const enrollmentEndDate = clean(body.enrollmentEndDate, 10);

    if (schoolName.length < 2) {
      return NextResponse.json({ error: "Enter the name of your school." }, { status: 400 });
    }
    if (!DATE_PATTERN.test(enrollmentEndDate) || enrollmentEndDate <= today || enrollmentEndDate > addYears(5)) {
      return NextResponse.json(
        { error: "Enter the date your program is expected to finish (it must be in the future)." },
        { status: 400 }
      );
    }

    row.school_name = schoolName;
    row.enrollment_end_date = enrollmentEndDate;
    row.jurisdiction = clean(body.jurisdiction, 20) || null;
    // Proof of enrollment is always required for students.
    documentRequired = true;
  }

  // Both files must sit in the caller's own folder and actually exist.
  const ownsUploadedFile = async (path: string) => {
    const [folder, filename] = path.split("/");
    if (folder !== user.id || !filename || path.split("/").length !== 2) return false;
    const { data: files } = await service.storage.from(VERIFICATION_BUCKET).list(user.id, { search: filename });
    return !!files?.some((f) => f.name === filename);
  };

  const documentPath = clean(body.documentPath, 200);
  const idDocumentPath = clean(body.idDocumentPath, 200);

  if (documentRequired && !documentPath) {
    return NextResponse.json({ error: "Upload your proof document." }, { status: 400 });
  }

  if (!idDocumentPath) {
    return NextResponse.json({ error: "Add a photo of your government-issued ID." }, { status: 400 });
  }

  if (documentPath) {
    if (!(await ownsUploadedFile(documentPath))) {
      return NextResponse.json({ error: "We couldn't find your uploaded document. Please try again." }, { status: 400 });
    }
    row.document_path = documentPath;
  }

  if (!(await ownsUploadedFile(idDocumentPath))) {
    return NextResponse.json({ error: "We couldn't find your uploaded ID. Please try again." }, { status: 400 });
  }
  row.id_document_path = idDocumentPath;

  let { error: insertError } = await service.from("professional_verifications").insert(row);

  // Until migration 20261017_verification_id_document.sql has been run the
  // column doesn't exist. Rather than block every submission, save without
  // it and leave the ID's storage path in admin_note so it isn't lost.
  if (insertError && /id_document_path/.test(insertError.message || "")) {
    delete row.id_document_path;
    row.admin_note = `Photo ID file: ${idDocumentPath}`;
    ({ error: insertError } = await service.from("professional_verifications").insert(row));
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const status = await recomputeProfileVerification(user.id);

  // Tell admins there's something to review — best-effort.
  try {
    const { data: admins } = await service
      .from("profiles")
      .select("id, email")
      .eq("is_admin", true);

    if (admins && admins.length > 0) {
      await service.from("notifications").insert(
        admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          is_read: false,
          type: "verification_submitted",
          title: `${profile?.full_name || "A professional"} submitted credentials for review`,
        }))
      );

      const siteUrl = getSiteUrl("https://lineup-aesthetics.ca");
      const html = createEmailLayout({
        title: "Credentials to review",
        preview: `${profile?.full_name || "A professional"} submitted credentials.`,
        ctaLabel: "Open the review queue",
        ctaUrl: `${siteUrl}/admin`,
        content: `<p style="margin:0 0 16px 0;"><strong>${escapeHtml(
          profile?.full_name || "A professional"
        )}</strong> submitted ${track === "student" ? "proof of enrollment" : "a licence/credential"} for review.</p>`,
      });

      await Promise.all(
        admins
          .filter((admin: { email: string | null }) => admin.email)
          .map((admin: { email: string | null }) =>
            sendEmail({ to: admin.email as string, subject: "New LineUp credentials to review", html })
          )
      );
    }
  } catch (error) {
    console.error("Admin verification notice failed:", error);
  }

  return NextResponse.json({ ok: true, status });
}
