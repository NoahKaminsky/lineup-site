import { NextResponse } from "next/server";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

function normalize(value: string | null | undefined) {
  return String(value || "").toLowerCase().replaceAll(" ", "_");
}

function formatCategory(value: string | null | undefined) {
  if (!value) return "Service";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function detailRow(label: string, value: string | null | undefined) {
  if (!value) return "";

  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#737373;font-size:14px;">
        ${escapeHtml(label)}
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#111111;font-size:14px;font-weight:600;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
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
      .select("id, title, service_detail, category, service_mode, target_professions, preferred_professional_id")
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
      .select("id, email, full_name, professional_type, professional_types, service_modes, email_request_notifications")
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
      if (!profile.email_request_notifications) return false;
      if (request.preferred_professional_id) return true;
      if (targetSet.size === 0) return false;

      const types = Array.isArray(profile.professional_types)
        ? profile.professional_types
        : profile.professional_type
        ? [profile.professional_type]
        : [];

      if (!types.some((type: string) => targetSet.has(normalize(type)))) return false;

      // If the pro has service modes configured and the request specifies a mode, must match
      const proModes = Array.isArray(profile.service_modes) ? profile.service_modes : [];
      if (proModes.length > 0 && request.service_mode) {
        if (!proModes.includes(request.service_mode)) return false;
      }

      return true;
    });

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const requestUrl = `${siteUrl}/requests/${request.id}`;

    const requestTitle = request.title || request.service_detail || "New request";
    const category = formatCategory(request.category);
    const serviceDetail = request.service_detail || null;
    const isDirectRequest = Boolean(request.preferred_professional_id);

    let sent = 0;

    for (const profile of matches) {
      const firstName = profile.full_name?.split(" ")[0] || "there";

      const html = createEmailLayout({
        title: isDirectRequest ? "You received a direct request" : "New matching request",
        preview: `${requestTitle} is available on LineUp.`,
        ctaLabel: "View request",
        ctaUrl: requestUrl,
        content: `
          <p style="margin:0 0 16px 0;">Hey ${escapeHtml(firstName)},</p>

          <p style="margin:0 0 16px 0;">
            ${
              isDirectRequest
                ? "A client sent a request directly to you on LineUp."
                : "A new request matching your services was posted on LineUp."
            }
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
            ${detailRow("Request", requestTitle)}
            ${detailRow("Category", category)}
            ${detailRow("Service detail", serviceDetail)}
          </table>

          <p style="margin:20px 0 0 0;color:#525252;">
            Review the request details and send an offer if it fits your schedule.
          </p>

          <p style="margin:18px 0 0 0;color:#737373;font-size:13px;line-height:22px;">
            You can turn new request emails off from your profile settings.
          </p>
        `,
      });

      await sendEmail({
        to: profile.email,
        subject: isDirectRequest
          ? "You received a direct request on LineUp"
          : "New matching request on LineUp",
        html,
      });

      await supabase.from("notifications").insert([
        {
          user_id: profile.id,
          request_id: request.id,
          is_read: false,
          type: "request",
          title: isDirectRequest
            ? "Direct request"
            : requestTitle,
        },
      ]);

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error: any) {
    console.error("request-created notification failed:", error);

    return NextResponse.json(
      { error: error?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
