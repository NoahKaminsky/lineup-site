import { NextResponse } from "next/server";
import { requireAdmin, getServiceSupabase } from "@/app/lib/serverSupabase";
import { VERIFICATION_BUCKET } from "@/app/lib/verificationRules";
import {
  notifyVerificationOutcome,
  recomputeProfileVerification,
} from "@/app/lib/verificationServer";

const DOCUMENT_LINK_SECONDS = 600;

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = getServiceSupabase();

  const [{ data: pending }, { data: recent }, { data: needsAttention }] = await Promise.all([
    service
      .from("professional_verifications")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    service
      .from("professional_verifications")
      .select("*")
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(25),
    service
      .from("profiles")
      .select("id, full_name, email, professional_types, professional_type, verification_status, created_at")
      .neq("role", "customer")
      .in("verification_status", ["unverified", "rejected", "expired"])
      .order("created_at", { ascending: true }),
  ]);

  const rows = [...(pending || []), ...(recent || [])];
  const personIds = [...new Set(rows.map((row) => row.professional_id))];

  const { data: people } = personIds.length
    ? await service
        .from("profiles")
        .select("id, full_name, email, professional_types, professional_type, formatted_address, location")
        .in("id", personIds)
    : { data: [] };

  const personMap = new Map((people || []).map((p) => [p.id, p]));

  // Short-lived signed links — documents live in a private bucket.
  const withDocuments = await Promise.all(
    rows.map(async (row) => {
      let documentUrl: string | null = null;
      if (row.document_path) {
        const { data } = await service.storage
          .from(VERIFICATION_BUCKET)
          .createSignedUrl(row.document_path, DOCUMENT_LINK_SECONDS);
        documentUrl = data?.signedUrl || null;
      }
      // Submissions made before the id_document_path migration ran keep the
      // ID's path in admin_note ("Photo ID file: <path>").
      const idPath: string | null =
        row.id_document_path ||
        (typeof row.admin_note === "string" && row.admin_note.startsWith("Photo ID file: ")
          ? row.admin_note.slice("Photo ID file: ".length).trim()
          : null);
      let idDocumentUrl: string | null = null;
      if (idPath) {
        const { data } = await service.storage
          .from(VERIFICATION_BUCKET)
          .createSignedUrl(idPath, DOCUMENT_LINK_SECONDS);
        idDocumentUrl = data?.signedUrl || null;
      }
      return {
        ...row,
        document_url: documentUrl,
        id_document_url: idDocumentUrl,
        professional: personMap.get(row.professional_id) || null,
      };
    })
  );

  const pendingIds = new Set((pending || []).map((row) => row.id));

  // Professionals who haven't submitted anything (or whose last submission
  // was rejected/expired) and have nothing waiting — candidates for manual
  // approval or a nudge.
  const professionalsWithPending = new Set((pending || []).map((row) => row.professional_id));

  return NextResponse.json({
    pending: withDocuments.filter((row) => pendingIds.has(row.id)),
    recent: withDocuments.filter((row) => !pendingIds.has(row.id)),
    needsAttention: (needsAttention || []).filter((p) => !professionalsWithPending.has(p.id)),
  });
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const service = getServiceSupabase();
  const now = new Date().toISOString();

  if (body.action === "approve" || body.action === "reject") {
    const { data: row } = await service
      .from("professional_verifications")
      .select("id, professional_id, status")
      .eq("id", body.id)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    if (row.status !== "pending") {
      return NextResponse.json({ error: "This submission was already reviewed." }, { status: 409 });
    }

    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (body.action === "reject" && reason.length < 3) {
      return NextResponse.json({ error: "Add a short reason so they know what to fix." }, { status: 400 });
    }

    const { error } = await service
      .from("professional_verifications")
      .update({
        status: body.action === "approve" ? "approved" : "rejected",
        rejection_reason: body.action === "reject" ? reason : null,
        reviewed_by: admin.id,
        reviewed_at: now,
      })
      .eq("id", row.id)
      .eq("status", "pending");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const status = await recomputeProfileVerification(row.professional_id);
    await notifyVerificationOutcome({
      professionalId: row.professional_id,
      outcome: body.action === "approve" ? "approved" : "rejected",
      reason,
    });

    return NextResponse.json({ ok: true, status });
  }

  if (body.action === "manual_approve") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!body.professionalId || note.length < 3) {
      return NextResponse.json(
        { error: "Add a short note on why you're approving this account without documents." },
        { status: 400 }
      );
    }

    const { data: target } = await service
      .from("profiles")
      .select("id, role, professional_type, professional_types")
      .eq("id", body.professionalId)
      .maybeSingle();

    const role = String(target?.role || "").toLowerCase();
    if (!target || !role || role.includes("customer")) {
      return NextResponse.json({ error: "Professional not found" }, { status: 404 });
    }

    const types: string[] =
      Array.isArray(target.professional_types) && target.professional_types.length > 0
        ? target.professional_types
        : target.professional_type
        ? [target.professional_type]
        : [];

    const { error } = await service.from("professional_verifications").insert({
      professional_id: target.id,
      track: "licensed",
      profession_type: types[0] || "other_beauty_professional",
      status: "approved",
      is_manual: true,
      admin_note: note,
      reviewed_by: admin.id,
      reviewed_at: now,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const status = await recomputeProfileVerification(target.id);
    await notifyVerificationOutcome({ professionalId: target.id, outcome: "approved" });

    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
