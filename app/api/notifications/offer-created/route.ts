import { NextResponse } from "next/server";
import { createEmailLayout, escapeHtml, sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

type EmailProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return null;

  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeString?: string | null) {
  if (!timeString) return null;

  const [hourString, minuteString = "00"] = String(timeString).slice(0, 5).split(":");
  const hour = Number(hourString);

  if (Number.isNaN(hour)) return null;

  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;

  return `${twelveHour}:${minuteString} ${suffix}`;
}

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return null;

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) return String(value);

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numericValue);
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

async function getEmailProfile(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string
): Promise<EmailProfile> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  let email = typeof profile?.email === "string" ? profile.email : null;

  if (!email) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email || null;
  }

  return {
    id: profile?.id || userId,
    email,
    full_name: profile?.full_name || null,
  };
}

export async function POST(req: Request) {
  try {
    const { offerId } = await req.json();

    if (!offerId) {
      return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { data: offer, error: offerError } = await supabase
      .from("request_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", offer.request_id)
      .single();

    if (requestError || !requestData) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const customer = await getEmailProfile(supabase, requestData.client_id);

    const { data: professional } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", offer.professional_id)
      .maybeSingle();

    if (!customer.email) {
      return NextResponse.json({
        ok: true,
        skipped: "customer has no email",
        customerId: requestData.client_id,
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const requestUrl = `${siteUrl}/requests/${requestData.id}`;

    const customerFirstName = customer.full_name?.split(" ")[0] || "there";
    const professionalName = professional?.full_name || "A professional";
    const requestTitle =
      requestData.title ||
      requestData.service_detail ||
      requestData.category ||
      "your request";

    const proposedPrice = formatMoney(offer.proposed_price);
    const proposedDate = formatDate(offer.proposed_date);
    const proposedStart = formatTime(offer.proposed_start_time);
    const proposedEnd = formatTime(offer.proposed_end_time);

    const proposedTime =
      proposedDate && proposedStart && proposedEnd
        ? `${proposedDate} · ${proposedStart} - ${proposedEnd}`
        : proposedDate && proposedStart
          ? `${proposedDate} · ${proposedStart}`
          : proposedDate;

    const details = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
        ${detailRow("Request", requestTitle)}
        ${detailRow("Professional", professionalName)}
        ${detailRow("Proposed price", proposedPrice)}
        ${detailRow("Proposed time", proposedTime)}
      </table>
    `;

    const html = createEmailLayout({
      title: "You received a new offer",
      preview: `${professionalName} sent you an offer for ${requestTitle}.`,
      ctaLabel: "View offer",
      ctaUrl: requestUrl,
      content: `
        <p style="margin:0 0 16px 0;">Hey ${escapeHtml(customerFirstName)},</p>

        <p style="margin:0 0 16px 0;">
          <strong>${escapeHtml(professionalName)}</strong> sent you a new offer on LineUp.
        </p>

        ${details}

        ${
          offer.message
            ? `
              <div style="margin:24px 0;padding:18px 20px;border-radius:20px;background:#f7f7f7;border:1px solid #eeeeee;">
                <p style="margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#737373;font-weight:700;">
                  Message
                </p>
                <p style="margin:0;color:#262626;line-height:26px;">
                  ${escapeHtml(offer.message)}
                </p>
              </div>
            `
            : ""
        }

        <p style="margin:20px 0 0 0;color:#525252;">
          Review the offer details and accept it if it works for you.
        </p>
      `,
    });

    await sendEmail({
      to: customer.email,
      subject: "New offer on LineUp",
      html,
    });

    await supabase.from("notifications").insert([{
      user_id: requestData.client_id,
      request_id: requestData.id,
      offer_id: offer.id,
      is_read: false,
      type: "offer",
      title: `${professionalName} sent you an offer`,
    }]);

    return NextResponse.json({
      ok: true,
      customerEmailFound: true,
    });
  } catch (err: any) {
    console.error("Offer notification failed:", err);

    return NextResponse.json(
      { error: err?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
