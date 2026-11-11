import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { errorMessage } from "@/app/lib/studios";
import { proTypes, RESUME_BUCKET } from "@/app/lib/chairs";
import { getSiteUrl } from "@/app/lib/siteUrl";

// POST /api/chairs/apply { openingId, message?, yearsExperience?, availableFrom?,
// preferredArrangement?, resumePath? } — a pro in the matching trade applies.
// The studio sees the application in its Chairs tab and can invite them onto
// the team. The resume (uploaded first through /api/chairs/resume-upload) is
// required when the opening asks for one.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 800) || null : null;
    const years =
      body?.yearsExperience === null || body?.yearsExperience === undefined || body?.yearsExperience === ""
        ? null
        : Math.round(Number(body.yearsExperience));
    if (years !== null && (!Number.isFinite(years) || years < 0 || years > 60)) {
      return NextResponse.json({ error: "Years of experience should be between 0 and 60." }, { status: 400 });
    }
    const availableFrom =
      typeof body?.availableFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.availableFrom) ? body.availableFrom : null;
    const preferredArrangement = ["booth_rent", "commission", "either"].includes(body?.preferredArrangement)
      ? (body.preferredArrangement as string)
      : null;
    // Only a file this pro uploaded: their own folder in the bucket.
    const resumePath =
      typeof body?.resumePath === "string" && body.resumePath.startsWith(`${user.id}/`) && !body.resumePath.includes("..")
        ? body.resumePath
        : null;

    const supabase = getServiceSupabase();
    const [{ data: me }, { data: opening }] = await Promise.all([
      supabase.from("profiles").select("id, role, full_name, professional_type, professional_types").eq("id", user.id).maybeSingle(),
      supabase
        .from("chair_openings")
        .select("id, studio_id, title, professions, status, expires_at, resume_required")
        .eq("id", typeof body?.openingId === "string" ? body.openingId : "")
        .maybeSingle(),
    ]);

    if (me?.role !== "professional") return NextResponse.json({ error: "Chair openings are for professionals." }, { status: 403 });
    if (!opening || opening.status !== "open" || Date.parse(opening.expires_at) < Date.now()) {
      return NextResponse.json({ error: "This opening isn't available anymore." }, { status: 404 });
    }
    if (!proTypes(me).some((t) => (opening.professions as string[]).includes(t))) {
      return NextResponse.json({ error: "This opening is for a different trade." }, { status: 403 });
    }

    if (opening.resume_required && !resumePath) {
      return NextResponse.json({ error: "This shop asks for a resume. Attach one to apply." }, { status: 400 });
    }
    if (resumePath) {
      // Make sure the upload actually finished before pointing at it.
      const folder = resumePath.slice(0, resumePath.lastIndexOf("/"));
      const name = resumePath.slice(resumePath.lastIndexOf("/") + 1);
      const { data: found } = await supabase.storage.from(RESUME_BUCKET).list(folder, { search: name });
      if (!found?.some((f) => f.name === name)) {
        return NextResponse.json({ error: "Your resume didn't finish uploading. Try attaching it again." }, { status: 400 });
      }
    }

    const { error } = await supabase.from("chair_applications").insert({
      opening_id: opening.id,
      professional_id: user.id,
      message,
      years_experience: years,
      available_from: availableFrom,
      preferred_arrangement: preferredArrangement,
      resume_path: resumePath,
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ ok: true, already: true });
      throw new Error(error.message);
    }

    // Let the studio's owner and managers know.
    const { data: managers } = await supabase
      .from("studio_members")
      .select("profile_id, role")
      .eq("studio_id", opening.studio_id)
      .eq("status", "active")
      .in("role", ["owner", "manager"]);
    const managerIds = (managers || []).map((m) => m.profile_id).filter(Boolean) as string[];

    if (managerIds.length) {
      await supabase.from("notifications").insert(
        managerIds.map((id) => ({
          user_id: id,
          request_id: null,
          is_read: false,
          type: "chair_application",
          title: `${me.full_name || "A pro"} applied for your chair: ${opening.title}`,
        }))
      );

      const owner = (managers || []).find((m) => m.role === "owner");
      if (owner?.profile_id) {
        const { data: ownerProfile } = await supabase.from("profiles").select("email").eq("id", owner.profile_id).maybeSingle();
        if (ownerProfile?.email) {
          const siteUrl = getSiteUrl("https://lineup-aesthetics.ca");
          sendEmail({
            to: ownerProfile.email,
            subject: `${me.full_name || "A pro"} applied for your chair`,
            html: createEmailLayout({
              title: "New application for your chair",
              preview: `${me.full_name || "A pro"} applied for "${opening.title}".`,
              ctaLabel: "See the application",
              ctaUrl: `${siteUrl}/studio/chairs`,
              content: `
                <p style="margin:0 0 16px 0;"><strong>${escapeHtml(me.full_name || "A pro")}</strong> applied for <strong>${escapeHtml(opening.title)}</strong>.</p>
                ${years !== null ? `<p style="margin:0 0 8px 0;color:#444444;">${years} ${years === 1 ? "year" : "years"} of experience${resumePath ? ", resume attached" : ""}.</p>` : resumePath ? `<p style="margin:0 0 8px 0;color:#444444;">Resume attached.</p>` : ""}
                ${message ? `<p style="margin:0 0 16px 0;color:#444444;">"${escapeHtml(message)}"</p>` : ""}
                <p style="margin:0;">Read the full application, open their resume and invite them onto your team from your Studio page.</p>
              `,
            }),
          }).catch((e) => console.error("Chair application email failed:", e));
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/chairs/apply failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not send that.") }, { status: 500 });
  }
}
