import { NextResponse } from "next/server";
import { baseEmailTemplate, escapeHtml, sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

function normalize(value: string | null | undefined) {
  return String(value || "").toLowerCase().replaceAll(" ", "_");
}

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: request, error } = await supabase
      .from("service_requests")
      .select("id, title, service_detail, category, target_professions, preferred_professional_id")
      .eq("id", requestId)
      .single();

    if (error || !request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const targetProfessions = Array.isArray(request.target_professions)
      ? request.target_professions
      : [];

    let professionalsQuery = supabase
      .from("profiles")
      .select("id, email, full_name, professional_type, professional_types, email_request_notifications")
      .eq("role", "professional")
      .eq("email_request_notifications", true)
      .not("email", "is", null);

    if (request.preferred_professional_id) {
      professionalsQuery = professionalsQuery.eq("id", request.preferred_professional_id);
    }

    const { data: professionals } = await professionalsQuery;
    const targetSet = new Set(targetProfessions.map(normalize));

    const matches = (professionals || []).filter((profile: any) => {
      if (!profile.email) return false;
      if (request.preferred_professional_id) return true;
      if (targetSet.size === 0) return false;

      const types = Array.isArray(profile.professional_types)
        ? profile.professional_types
        : profile.professional_type
        ? [profile.professional_type]
        : [];

      return types.some((type: string) => targetSet.has(normalize(type)));
    });

    const emails = matches.map((profile: any) => profile.email).filter(Boolean);

    if (emails.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const href = `${siteUrl}/requests/${request.id}`;

    const body = `
      <p>A new request matching your services was posted.</p>
      <p><strong>Request:</strong> ${escapeHtml(
        request.service_detail || request.title || "New request"
      )}</p>
      <p>You can turn these emails off from your profile settings.</p>
    `;

    await sendEmail({
      to: emails,
      subject: "New matching request on LineUp",
      html: baseEmailTemplate({
        title: "New matching request",
        body,
        ctaHref: href,
        ctaLabel: "View request",
      }),
    });

    return NextResponse.json({ ok: true, sent: emails.length });
  } catch (error: any) {
    console.error("request-created notification failed:", error);
    return NextResponse.json(
      { error: error?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
