"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInUser } from "@/lib/getSignedInUser";
import type { VerificationInitialData } from "./getInitialData";
import {
  JURISDICTIONS,
  MAX_PENDING_SUBMISSIONS,
  STUDENT_DOCUMENT_HELP,
  VERIFICATION_BUCKET,
  VERIFICATION_DOCUMENT_MAX_BYTES,
  VERIFICATION_DOCUMENT_TYPES,
  DEFAULT_LICENSED_RULE,
  getLicensedRule,
  jurisdictionLabel,
  isVerifiedNow,
  todayDateString,
  PROFESSION_LABELS,
  type VerificationStatus,
  type VerificationTrack,
} from "@/app/lib/verificationRules";
import { useHashTarget } from "@/app/lib/useHashTarget";

type Submission = {
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

type ProfileState = {
  role: string | null;
  professional_type: string | null;
  professional_types: string[] | null;
  verification_status: VerificationStatus | null;
  verification_track: VerificationTrack | null;
  verified_until: string | null;
};

const labelClass = "mb-2 block text-sm font-semibold text-neutral-900";

// One upload slot: an empty "+" tile that becomes a preview once a file is
// chosen. Two of these sit side by side so it's obvious that two things are
// needed: the credential and a photo ID.
function UploadSlot({
  title,
  hint,
  optional,
  file,
  onChange,
}: {
  title: string;
  hint: string;
  optional?: boolean;
  file: File | null;
  onChange: (next: File | null) => void;
}) {
  const previewUrl = useMemo(
    () => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col">
      <label
        className={`group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl text-center transition focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2 ${
          file
            ? "bg-neutral-100 ring-1 ring-ink/10"
            : "border-2 border-dashed border-neutral-300 bg-white hover:border-neutral-500 hover:bg-neutral-50"
        }`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            onChange(e.target.files?.[0] || null);
            e.target.value = "";
          }}
          className="sr-only"
        />
        {file ? (
          previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 px-3 text-neutral-700">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
                <path d="M7 3h7l5 5v13H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="line-clamp-2 text-xs font-medium">{file.name}</span>
            </span>
          )
        ) : (
          <span className="flex flex-col items-center px-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="mt-3 text-sm font-semibold text-neutral-900">{title}</span>
            <span className="mt-0.5 text-xs text-neutral-500">{optional ? "Optional" : "Required"}</span>
          </span>
        )}
        {file ? (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-sm">
            {title} · Replace
          </span>
        ) : null}
      </label>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{hint}</p>
      {file ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 self-start text-xs font-medium text-neutral-500 underline-offset-2 hover:text-ink hover:underline"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}
const inputClass =
  "w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white";

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function authedFetch(url: string, body: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

type VerificationPageClientProps = {
  // Fetched server-side (app/verification/page.tsx + getInitialData.ts) so a
  // cold load already has real content. null means either a logged-in-but-
  // non-professional edge case the server already redirected away from, or
  // the server fetch failed and this just does a normal client load instead.
  initialData: VerificationInitialData | null;
};

export default function VerificationPageClient({ initialData }: VerificationPageClientProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(!initialData);
  const [userId, setUserId] = useState<string | null>(initialData?.userId ?? null);
  const [profile, setProfile] = useState<ProfileState | null>(
    (initialData?.profile as ProfileState | undefined) ?? null
  );
  // Checklist deep link (/verification#verification-form).
  useHashTarget(!loading && !!profile);
  const [submissions, setSubmissions] = useState<Submission[]>(
    (initialData?.submissions as Submission[] | undefined) ?? []
  );
  const [showForm, setShowForm] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const [track, setTrack] = useState<VerificationTrack>("licensed");
  const [professionType, setProfessionType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [enrollmentEndDate, setEnrollmentEndDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [attested, setAttested] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const user = await getSignedInUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, professional_type, professional_types, verification_status, verification_track, verified_until")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profileRow?.role || "").toLowerCase();
    if (!profileRow || !role || role.includes("customer")) {
      router.push("/requests");
      return;
    }

    setProfile(profileRow as ProfileState);

    const { data: rows } = await supabase
      .from("professional_verifications")
      .select(
        "id, track, profession_type, jurisdiction, license_number, school_name, status, rejection_reason, is_manual, license_expiry, enrollment_end_date, created_at"
      )
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false });

    setSubmissions((rows || []) as Submission[]);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const ownTypes = useMemo(
    () =>
      profile?.professional_types && profile.professional_types.length > 0
        ? profile.professional_types
        : profile?.professional_type
        ? [profile.professional_type]
        : [],
    [profile]
  );

  useEffect(() => {
    if (!professionType && ownTypes.length > 0) setProfessionType(ownTypes[0]);
  }, [ownTypes, professionType]);

  const status = (profile?.verification_status || "unverified") as VerificationStatus;
  const verifiedNow = isVerifiedNow(profile);
  const pendingCount = submissions.filter((s) => s.status === "pending").length;
  const latestRejection = submissions.find((s) => s.status === "rejected" && s.rejection_reason);

  const rule = jurisdiction && professionType ? getLicensedRule(jurisdiction, professionType) : DEFAULT_LICENSED_RULE;
  const documentHelp = track === "student" ? STUDENT_DOCUMENT_HELP : rule.documentHelp;
  const documentRequired = track === "student" || rule.document === "required";

  function handleFileChange(next: File | null, set: (file: File | null) => void = setFile) {
    setError("");
    if (!next) {
      set(null);
      return;
    }
    if (!VERIFICATION_DOCUMENT_TYPES.includes(next.type)) {
      setError("Please choose a JPG, PNG, WebP or PDF file.");
      return;
    }
    if (next.size > VERIFICATION_DOCUMENT_MAX_BYTES) {
      setError("That file is too large — the limit is 8 MB.");
      return;
    }
    set(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !userId) return;

    setError("");
    setNotice("");

    if (!professionType) {
      setError("Choose which profession this is for.");
      return;
    }

    if (track === "licensed") {
      if (!jurisdiction) {
        setError("Choose where you're licensed.");
        return;
      }
      if (rule.licenseNumber === "required" && !licenseNumber.trim()) {
        setError(`Enter your ${rule.numberLabel.toLowerCase()}.`);
        return;
      }
      if (rule.expiry === "required" && !licenseExpiry) {
        setError("Enter your credential's expiry date.");
        return;
      }
    } else {
      if (schoolName.trim().length < 2) {
        setError("Enter the name of your school.");
        return;
      }
      if (!enrollmentEndDate) {
        setError("Enter when your program is expected to finish.");
        return;
      }
    }

    if (documentRequired && !file) {
      setError("Upload your proof document.");
      return;
    }

    if (!idFile) {
      setError("Add a photo of your government-issued ID.");
      return;
    }

    if (!attested) {
      setError("Please confirm the information is accurate.");
      return;
    }

    setSubmitting(true);

    try {
      // Same private-bucket upload for each file; null means it failed and
      // the error is already showing.
      const uploadOne = async (upload: File): Promise<string | null> => {
        const uploadRes = await authedFetch("/api/verification/upload-url", {
          contentType: upload.type,
          size: upload.size,
        });
        const uploadJson = await uploadRes.json();

        if (!uploadRes.ok) {
          setError(uploadJson.error || "Could not upload your document.");
          return null;
        }

        const { error: uploadError } = await supabase.storage
          .from(VERIFICATION_BUCKET)
          .uploadToSignedUrl(uploadJson.path, uploadJson.token, upload, { contentType: upload.type });

        if (uploadError) {
          setError(uploadError.message || "Could not upload your document.");
          return null;
        }

        return uploadJson.path as string;
      };

      let documentPath: string | null = null;

      if (file) {
        documentPath = await uploadOne(file);
        if (!documentPath) return;
      }

      const idDocumentPath = await uploadOne(idFile);
      if (!idDocumentPath) return;

      const res = await authedFetch("/api/verification/submit", {
        track,
        professionType,
        jurisdiction: track === "licensed" ? jurisdiction : undefined,
        licenseNumber,
        issuingBody,
        licenseExpiry,
        schoolName,
        enrollmentEndDate,
        documentPath,
        idDocumentPath,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Could not submit your credentials.");
        return;
      }

      setNotice("Submitted. We'll email you as soon as it's been reviewed.");
      setShowForm(false);
      setFile(null);
      setIdFile(null);
      setLicenseNumber("");
      setIssuingBody("");
      setLicenseExpiry("");
      setSchoolName("");
      setEnrollmentEndDate("");
      setAttested(false);
      await load();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-12 text-neutral-900">
        <div className="mx-auto max-w-2xl">
          <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
          <div className="mt-4 h-10 w-3/4 animate-pulse rounded-2xl bg-neutral-200" />
          <div className="mt-8 h-40 animate-pulse rounded-panel bg-neutral-100" />
        </div>
      </main>
    );
  }

  const formVisible = showForm || (!verifiedNow && status !== "pending");
  const canAddMore = pendingCount < MAX_PENDING_SUBMISSIONS;

  return (
    <main className="px-4 sm:px-6 lg:px-8 min-h-screen bg-paper py-10 text-neutral-900">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">Verification</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Verify your credentials</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
          Clients book with confidence when they know a professional has been checked. Submit your
          licence or, if you&apos;re still studying, proof of enrollment — our team reviews it before
          you appear in Browse or can send offers.
        </p>

        {/* Status */}
        <div className="mt-8 rounded-panel border border-neutral-200 bg-neutral-50 p-6">
          {verifiedNow ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white" fill="none">
                  <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="font-semibold">
                  You&apos;re verified{profile?.verification_track === "student" ? " as a student" : ""}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {profile?.verified_until
                    ? `Valid until ${formatDate(profile.verified_until)}. Renew before then to stay visible.`
                    : "You're visible in Browse and can send offers."}
                </p>
              </div>
            </div>
          ) : status === "pending" ? (
            <div>
              <p className="font-semibold">Under review</p>
              <p className="mt-1 text-sm text-neutral-600">
                We&apos;ve got your credentials and will email you as soon as they&apos;re reviewed. Until
                then you can set up your profile, but you won&apos;t appear in Browse or be able to send
                offers.
              </p>
            </div>
          ) : status === "rejected" ? (
            <div>
              <p className="font-semibold">We couldn&apos;t approve your last submission</p>
              {latestRejection?.rejection_reason ? (
                <p className="mt-1 text-sm text-neutral-600">Reason: {latestRejection.rejection_reason}</p>
              ) : null}
              <p className="mt-1 text-sm text-neutral-600">Submit updated documents below.</p>
            </div>
          ) : status === "expired" ? (
            <div>
              <p className="font-semibold">Your verification has expired</p>
              <p className="mt-1 text-sm text-neutral-600">
                Submit a current credential below to become visible in Browse again.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold">Not verified yet</p>
              <p className="mt-1 text-sm text-neutral-600">
                Until you&apos;re approved you won&apos;t appear in Browse and can&apos;t send offers or be
                booked.
              </p>
            </div>
          )}
        </div>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800">
            {notice}
          </div>
        ) : null}

        {/* Past submissions */}
        {submissions.length > 0 ? (
          <div className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">Your submissions</h2>
            <div className="mt-3 space-y-2.5">
              {submissions.map((s) => (
                <div key={s.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {s.track === "student" ? "Student" : "Licensed"} ·{" "}
                      {PROFESSION_LABELS[s.profession_type] || s.profession_type}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        s.status === "approved"
                          ? "bg-neutral-900 text-white"
                          : s.status === "rejected"
                          ? "border border-neutral-300 bg-white text-neutral-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {s.status === "pending" ? "Under review" : s.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {s.track === "student"
                      ? `${s.school_name || "School"} · finishes ${formatDate(s.enrollment_end_date)}`
                      : [
                          s.jurisdiction ? jurisdictionLabel(s.jurisdiction) : null,
                          s.license_number ? `#${s.license_number}` : null,
                          s.license_expiry ? `expires ${formatDate(s.license_expiry)}` : null,
                          s.is_manual ? "approved by LineUp" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                    {" · submitted "}
                    {formatDate(s.created_at.slice(0, 10))}
                  </p>
                  {s.status === "rejected" && s.rejection_reason ? (
                    <p className="mt-2 text-sm text-neutral-700">Reason: {s.rejection_reason}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Form */}
        {!formVisible && canAddMore ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            Add or renew a credential
          </button>
        ) : null}

        {formVisible && canAddMore ? (
          <form id="verification-form" onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-panel border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <div>
              <label className={labelClass}>I am a…</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "licensed", label: "Licensed / certified professional" },
                    { value: "student", label: "Student / in training" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTrack(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      track === option.value
                        ? "border-ink bg-ink text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 hover:bg-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {track === "student" ? (
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  Students are shown with a &ldquo;Student&rdquo; label so clients know you&apos;re in
                  training, and your approval ends when your program does.
                </p>
              ) : null}
            </div>

            <div>
              <label className={labelClass}>
                {track === "student" ? "Which program are you studying?" : "Which profession is this credential for?"}
              </label>
              <select
                value={professionType}
                onChange={(e) => setProfessionType(e.target.value)}
                className={inputClass}
              >
                {ownTypes.map((type) => (
                  <option key={type} value={type}>
                    {PROFESSION_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </div>

            {track === "licensed" ? (
              <>
                <div>
                  <label className={labelClass}>Where are you licensed?</label>
                  <select
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select province / state</option>
                    {JURISDICTIONS.map((j) => (
                      <option key={j.value} value={j.value}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </div>

                {rule.licenseNumber !== "hidden" ? (
                  <div>
                    <label className={labelClass}>
                      {rule.numberLabel}
                      {rule.licenseNumber === "optional" ? " (optional)" : ""}
                    </label>
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      maxLength={64}
                      placeholder="e.g. 123456"
                      className={inputClass}
                    />
                  </div>
                ) : null}

                {rule.issuingBody !== "hidden" ? (
                  <div>
                    <label className={labelClass}>
                      Issued by{rule.issuingBody === "optional" ? " (optional)" : ""}
                    </label>
                    <input
                      type="text"
                      value={issuingBody}
                      onChange={(e) => setIssuingBody(e.target.value)}
                      maxLength={120}
                      placeholder="e.g. State Board of Cosmetology"
                      className={inputClass}
                    />
                  </div>
                ) : null}

                {rule.expiry !== "hidden" ? (
                  <div>
                    <label className={labelClass}>
                      Expiry date{rule.expiry === "optional" ? " (if it has one)" : ""}
                    </label>
                    <input
                      type="date"
                      value={licenseExpiry}
                      min={todayDateString()}
                      onChange={(e) => setLicenseExpiry(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className={labelClass}>School name</label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    maxLength={120}
                    placeholder="Where are you enrolled?"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Expected finish date</label>
                  <input
                    type="date"
                    value={enrollmentEndDate}
                    min={todayDateString()}
                    onChange={(e) => setEnrollmentEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            <div>
              <p className={labelClass}>Two photos</p>
              <p className="mb-4 -mt-1 text-xs leading-5 text-neutral-500">
                Your {track === "student" ? "proof of enrollment" : "credential"} and a photo ID, so we can match the
                document to you. JPG, PNG, WebP or PDF, up to 8 MB each.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <UploadSlot
                  title={track === "student" ? "Enrollment proof" : "Credential"}
                  hint={documentHelp}
                  optional={!documentRequired}
                  file={file}
                  onChange={(next) => handleFileChange(next, setFile)}
                />
                <UploadSlot
                  title="Photo ID"
                  hint="Driver's licence, passport or provincial ID. The name must match your profile."
                  file={idFile}
                  onChange={(next) => handleFileChange(next, setIdFile)}
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-neutral-500">
                Stored privately and only seen by LineUp&apos;s review team — never shown on your profile.
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-neutral-300"
              />
              <span>I confirm this information and document are genuine and accurate.</span>
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
              {showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}

        {!canAddMore ? (
          <p className="mt-6 text-sm text-neutral-500">
            You have {MAX_PENDING_SUBMISSIONS} submissions waiting for review — we&apos;ll email you when
            they&apos;re checked.
          </p>
        ) : null}

        <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-xs leading-5 text-neutral-500">
          <p className="font-semibold text-neutral-700">What &ldquo;verified&rdquo; means</p>
          <p className="mt-1">
            It means our team reviewed the credential you provided and it appeared genuine and current.
            It isn&apos;t a guarantee of the quality of any service, and professionals remain
            responsible for holding any licences their work requires.
          </p>
        </div>

        {status !== "verified" && status !== "pending" ? (
          <div className="mt-6">
            {confirmSkip ? (
              <div className="rounded-2xl border border-ink bg-surface p-5 text-ink">
                <p className="text-lg font-semibold tracking-tight">You can&apos;t use LineUp until you&apos;re verified</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Without verification you won&apos;t appear in Browse, you can&apos;t send offers, and clients
                  can&apos;t book or pay you. You can still set up your profile, but nothing works for getting
                  clients until this is done — your dashboard will keep reminding you.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmSkip(false);
                      document.getElementById("verification-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                  >
                    Verify now
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/requests")}
                    className="rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-ink transition hover:bg-neutral-50"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSkip(true)}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-800"
              >
                I&apos;ll do this later →
              </button>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
