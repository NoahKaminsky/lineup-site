import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { errorMessage } from "@/app/lib/studios";
import { proTypes } from "@/app/lib/chairs";

// POST /api/chairs/apply { openingId, message? } — a pro in the matching trade
// tells the studio they're interested. The studio sees them in its Chairs tab
// and can invite them onto the team.
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 800) || null : null;

    const supabase = getServiceSupabase();
    const [{ data: me }, { data: opening }] = await Promise.all([
      supabase.from("profiles").select("id, role, full_name, professional_type, professional_types").eq("id", user.id).maybeSingle(),
      supabase
        .from("chair_openings")
        .select("id, studio_id, title, professions, status, expires_at")
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

    const { error } = await supabase
      .from("chair_applications")
      .insert({ opening_id: opening.id, professional_id: user.id, message });
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
          title: `${me.full_name || "A pro"} is interested in your chair: ${opening.title}`,
        }))
      );

      const owner = (managers || []).find((m) => m.role === "owner");
      if (owner?.profile_id) {
        const { data: ownerProfile } = await supabase.from("profiles").select("email").eq("id", owner.profile_id).maybeSingle();
        if (ownerProfile?.email) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";
          sendEmail({
            to: ownerProfile.email,
            subject: `${me.full_name || "A pro"} is interested in your chair`,
            html: createEmailLayout({
              title: "Someone wants your chair",
              preview: `${me.full_name || "A pro"} replied to "${opening.title}".`,
              ctaLabel: "See who applied",
              ctaUrl: `${siteUrl}/studio?tab=chairs`,
              content: `
                <p style="margin:0 0 16px 0;"><strong>${escapeHtml(me.full_name || "A pro")}</strong> is interested in <strong>${escapeHtml(opening.title)}</strong>.</p>
                ${message ? `<p style="margin:0 0 16px 0;color:#444444;">"${escapeHtml(message)}"</p>` : ""}
                <p style="margin:0;">Look at their profile and invite them onto your team from your Studio page.</p>
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
