import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { RESUME_BUCKET, RESUME_MAX_BYTES, RESUME_TYPES } from "@/app/lib/chairs";
import { errorMessage } from "@/app/lib/studios";

// POST /api/chairs/resume-upload { contentType, size } → { path, token }
// A pro applying for a chair uploads their resume straight to the private
// bucket with a short-lived signed token. The path is always under their own
// user id, and /api/chairs/apply only accepts paths that start with it.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    const size = Number(body?.size);

    const extension = RESUME_TYPES[contentType];
    if (!extension) return NextResponse.json({ error: "Upload a PDF or Word document." }, { status: 400 });
    if (!Number.isFinite(size) || size <= 0 || size > RESUME_MAX_BYTES) {
      return NextResponse.json({ error: "Resumes must be 5 MB or smaller." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "professional") return NextResponse.json({ error: "Chair openings are for professionals." }, { status: 403 });

    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage.from(RESUME_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || "Could not start the upload.");

    return NextResponse.json({ path: data.path, token: data.token });
  } catch (error) {
    console.error("POST /api/chairs/resume-upload failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not start the upload.") }, { status: 500 });
  }
}
