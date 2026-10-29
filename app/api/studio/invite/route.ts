import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { INVITE_TTL_DAYS, getStudioForUser, newInviteToken, errorMessage } from "@/app/lib/studios";

// POST /api/studio/invite { email, role?, resendMemberId? }
// Owners and managers invite a pro by email. The pro gets a link, signs in
// (or creates their own LineUp account), and joins the studio's team.
// Only the owner can invite managers.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEAM = 100;

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return NextResponse.json({ error: "Only the studio's owner or managers can invite." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const role = body?.role === "manager" ? "manager" : "member";
    if (role === "manager" && !ctx.isOwner) {
      return NextResponse.json({ error: "Only the owner can add managers." }, { status: 403 });
    }

    let email = String(body?.email || "").trim().toLowerCase();
    let rowId: string | null = null;

    // Resending: a fresh link for an existing invite.
    if (body?.resendMemberId) {
      const { data: existing } = await supabase
        .from("studio_members")
        .select("id, invited_email, status, role")
        .eq("id", body.resendMemberId)
        .eq("studio_id", ctx.studio.id)
        .maybeSingle();
      if (!existing || existing.status !== "invited" || !existing.invited_email) {
        return NextResponse.json({ error: "That invite isn't open anymore." }, { status: 404 });
      }
      email = existing.invited_email;
      rowId = existing.id;
    }

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Already on this team, or on another studio's?
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: theirMembership } = await supabase
        .from("studio_members")
        .select("studio_id")
        .eq("profile_id", existingProfile.id)
        .eq("status", "active")
        .maybeSingle();
      if (theirMembership) {
        return NextResponse.json(
          {
            error:
              theirMembership.studio_id === ctx.studio.id
                ? "They're already on your team."
                : "That pro is already on another studio's team. They'd need to leave it first.",
          },
          { status: 409 }
        );
      }
    }

    const { count } = await supabase
      .from("studio_members")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", ctx.studio.id);
    if (!rowId && (count || 0) >= MAX_TEAM) {
      return NextResponse.json({ error: "Your team is at the limit. Contact LineUp to add more." }, { status: 409 });
    }

    const { token, hash } = newInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

    if (!rowId) {
      // Replace any older open invite for the same email.
      const { data: open } = await supabase
        .from("studio_members")
        .select("id")
        .eq("studio_id", ctx.studio.id)
        .eq("status", "invited")
        .eq("invited_email", email)
        .maybeSingle();
      rowId = open?.id || null;
    }

    if (rowId) {
      const { error } = await supabase
        .from("studio_members")
        .update({ invite_token_hash: hash, invite_expires_at: expiresAt, invited_by: user.id })
        .eq("id", rowId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("studio_members").insert({
        studio_id: ctx.studio.id,
        role,
        status: "invited",
        invited_email: email,
        invite_token_hash: hash,
        invite_expires_at: expiresAt,
        invited_by: user.id,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: inviter } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";
    const joinUrl = `${siteUrl}/studio/join?token=${encodeURIComponent(token)}`;
    const studioName = ctx.studio.name;

    try {
      await sendEmail({
        to: email,
        subject: `Join ${studioName} on LineUp`,
        html: createEmailLayout({
          title: `Join ${studioName} on LineUp`,
          preview: `${inviter?.full_name || "Your studio"} added you to the team.`,
          ctaLabel: "Join the team",
          ctaUrl: joinUrl,
          content: `
            <p style="margin:0 0 16px 0;"><strong>${escapeHtml(inviter?.full_name || "Your studio")}</strong> invited you to join <strong>${escapeHtml(studioName)}</strong> on LineUp.</p>
            <p style="margin:0 0 16px 0;">You'll keep your own login, profile, services and calendar. The studio covers your plan and can see the team's schedule.</p>
            <p style="margin:0;color:#666666;font-size:13px;">Use this email address to sign in or create your account. The link expires in ${INVITE_TTL_DAYS} days.</p>
          `,
        }),
      });
    } catch (emailError) {
      console.error("Studio invite email failed:", emailError);
      return NextResponse.json(
        { ok: true, emailed: false, joinUrl, warning: "The invite was saved but the email didn't send. Share this link with them instead." },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, emailed: true });
  } catch (error) {
    console.error("POST /api/studio/invite failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not send the invite.") }, { status: 500 });
  }
}
