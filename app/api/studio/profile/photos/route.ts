import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";

// Shop photos: the cover, the logo and a gallery (owner or manager).
// POST { action: "upload-url", contentType, size } -> { path, token }: the
//   browser uploads straight to storage with a short-lived signed token, so
//   big phone photos never pass through this server.
// POST { action: "add", path, kind: "cover" | "logo" | "gallery", caption? }
// DELETE ?id=<photo id>  or  ?kind=cover|logo
// Paths are always forced under studios/<this shop's id>/.
const BUCKET = "portfolio-images";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_GALLERY = 30;

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only the shop's owner and managers can change its photos." }, { status: 403 });
    const prefix = `studios/${ctx.studio.id}/`;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === "upload-url") {
      const ext = TYPES[String(body.contentType)];
      if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 });
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return NextResponse.json({ error: "Photos must be 12 MB or smaller." }, { status: 400 });
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${prefix}${crypto.randomUUID()}.${ext}`);
      if (error || !data) return NextResponse.json({ error: error?.message || "Could not start the upload." }, { status: 500 });
      return NextResponse.json({ path: data.path, token: data.token });
    }

    if (body.action === "add") {
      const path = String(body.path || "");
      if (!path.startsWith(prefix) || path.includes("..")) return NextResponse.json({ error: "That upload doesn't belong to this shop." }, { status: 400 });
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const kind = String(body.kind);
      if (kind === "cover" || kind === "logo") {
        const { error } = await supabase.from("studios").update({ [`${kind}_url`]: url }).eq("id", ctx.studio.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, url });
      }
      if (kind !== "gallery") return NextResponse.json({ error: "Unknown photo kind." }, { status: 400 });
      const { count } = await supabase.from("studio_photos").select("id", { count: "exact", head: true }).eq("studio_id", ctx.studio.id);
      if ((count || 0) >= MAX_GALLERY) return NextResponse.json({ error: `Up to ${MAX_GALLERY} photos. Remove one to add another.` }, { status: 400 });
      const caption = String(body.caption || "").trim().slice(0, 140) || null;
      const { data, error } = await supabase
        .from("studio_photos")
        .insert({ studio_id: ctx.studio.id, url, caption, sort: count || 0, created_by: user.id })
        .select("id, url, caption, sort, created_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, photo: data });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/studio/profile/photos failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save the photo.") }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only the shop's owner and managers can change its photos." }, { status: 403 });
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind");
    if (kind === "cover" || kind === "logo") {
      await supabase.from("studios").update({ [`${kind}_url`]: null }).eq("id", ctx.studio.id);
      return NextResponse.json({ ok: true });
    }
    const id = q.get("id");
    if (!id) return NextResponse.json({ error: "Which photo?" }, { status: 400 });
    const { error } = await supabase.from("studio_photos").delete().eq("id", id).eq("studio_id", ctx.studio.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/studio/profile/photos failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not remove the photo.") }, { status: 500 });
  }
}
