import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import {
  VERIFICATION_BUCKET,
  VERIFICATION_DOCUMENT_MAX_BYTES,
  VERIFICATION_DOCUMENT_TYPES,
} from "@/app/lib/verificationRules";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Documents go to a private bucket (licences and enrollment letters are
// personal information). The client uploads straight to storage with a
// short-lived signed token, so no storage RLS policies are needed and the
// path is always forced under the caller's own user id.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { contentType, size } = await req.json();

  if (!VERIFICATION_DOCUMENT_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "Please upload a JPG, PNG, WebP or PDF file." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(size) || size <= 0 || size > VERIFICATION_DOCUMENT_MAX_BYTES) {
    return NextResponse.json({ error: "Files must be 8 MB or smaller." }, { status: 400 });
  }

  const service = getServiceSupabase();

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(profile?.role || "").toLowerCase();
  if (!role || role.includes("customer")) {
    return NextResponse.json({ error: "Only professionals can submit credentials." }, { status: 403 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${EXTENSIONS[contentType]}`;

  const { data, error } = await service.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not start upload." }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
