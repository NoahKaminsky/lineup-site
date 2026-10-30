import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { getStudioForUser, hashInviteToken, syncStudioMemberPlans, errorMessage } from "@/app/lib/studios";

// GET  /api/studio/join?token=…   — which studio an invite link is for.
// POST /api/studio/join { token } or { inviteId } — accept it.
//
// The invite only works for the account whose email it was sent to, so a
// forwarded link can't put someone else on the team.

async function findInvite(
  supabase: ReturnType<typeof getServiceSupabase>,
  by: { token?: string; inviteId?: string }
) {
  let query = supabase
    .from("studio_members")
    .select("id, studio_id, status, invited_email, invite_expires_at, studios(name)")
    .eq("status", "invited");

  if (by.token) query = query.eq("invite_token_hash", hashInviteToken(by.token));
  else if (by.inviteId) query = query.eq("id", by.inviteId);
  else return null;

  const { data } = await query.maybeSingle();
  if (!data) return null;

  return {
    id: data.id as string,
    studioId: data.studio_id as string,
    invitedEmail: (data.invited_email as string | null) || "",
    expired: !!data.invite_expires_at && Date.parse(data.invite_expires_at) < Date.now(),
    studioName: (data.studios as unknown as { name: string } | null)?.name || "A studio",
  };
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "Missing invite." }, { status: 400 });

  const invite = await findInvite(getServiceSupabase(), { token });
  if (!invite) return NextResponse.json({ error: "This invite has already been used or was cancelled." }, { status: 404 });

  return NextResponse.json({
    studioName: invite.studioName,
    invitedEmail: maskEmail(invite.invitedEmail),
    expired: invite.expired,
  });
}

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supabase = getServiceSupabase();

    const invite = await findInvite(supabase, {
      token: typeof body?.token === "string" ? body.token : undefined,
      inviteId: typeof body?.inviteId === "string" ? body.inviteId : undefined,
    });

    if (!invite) {
      return NextResponse.json({ error: "This invite has already been used or was cancelled." }, { status: 404 });
    }
    if (invite.expired) {
      return NextResponse.json({ error: "This invite has expired. Ask the studio to send a new one." }, { status: 410 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const myEmail = (user.email || profile?.email || "").toLowerCase();
    if (!myEmail || myEmail !== invite.invitedEmail.toLowerCase()) {
      return NextResponse.json(
        {
          error: `This invite was sent to ${maskEmail(invite.invitedEmail)}. Sign in with that email to accept it.`,
          code: "wrong_account",
        },
        { status: 403 }
      );
    }

    if (!profile?.role || !profile.full_name) {
      return NextResponse.json({ error: "Finish setting up your account first.", code: "needs_onboarding" }, { status: 409 });
    }
    if (profile.role !== "professional") {
      return NextResponse.json(
        { error: "Studio teams are for professional accounts. This account is set up as a client.", code: "not_professional" },
        { status: 409 }
      );
    }

    const current = await getStudioForUser(supabase, user.id);
    if (current) {
      return NextResponse.json(
        {
          error:
            current.studio.id === invite.studioId
              ? "You're already on this team."
              : `You're on ${current.studio.name}'s team. Leave it first to join another studio.`,
        },
        { status: 409 }
      );
    }

    const { data: joined, error } = await supabase
      .from("studio_members")
      .update({
        profile_id: user.id,
        status: "active",
        joined_at: new Date().toISOString(),
        invite_token_hash: null,
        invite_expires_at: null,
      })
      .eq("id", invite.id)
      .eq("status", "invited")
      .select("id")
      .maybeSingle();

    if (error) {
      const message = error.code === "23505" ? "You're already on a studio's team." : error.message;
      return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
    }
    if (!joined) {
      return NextResponse.json({ error: "This invite has already been used." }, { status: 409 });
    }

    // Everyone, not just them: a second pro joining is what switches the
    // team benefits on.
    await syncStudioMemberPlans(supabase, invite.studioId);

    return NextResponse.json({ ok: true, studioName: invite.studioName });
  } catch (error) {
    console.error("POST /api/studio/join failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not join the studio.") }, { status: 500 });
  }
}
