import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createEmailLayout({
  title,
  preview,
  content,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  preview?: string;
  content: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://lineup-aesthetics.ca";

  const logoUrl = `${siteUrl}/lineup-apple-touch-icon.png`;

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
    </head>

    <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
      ${
        preview
          ? `
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
          ${escapeHtml(preview)}
        </div>
      `
          : ""
      }

      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
        <tr>
          <td align="center">
            <table
              width="100%"
              cellpadding="0"
              cellspacing="0"
              style="
                max-width:600px;
                background:#ffffff;
                border-radius:28px;
                overflow:hidden;
                border:1px solid #e5e5e5;
              "
            >
              <tr>
                <td style="padding:40px 40px 24px 40px;" align="center">
                  <img
                    src="${logoUrl}"
                    alt="LineUp"
                    width="64"
                    height="64"
                    style="display:block;border-radius:18px;"
                  />

                  <h1
                    style="
                      margin:20px 0 0 0;
                      font-size:30px;
                      line-height:36px;
                      font-weight:700;
                      color:#111111;
                      letter-spacing:-0.02em;
                    "
                  >
                    ${escapeHtml(title)}
                  </h1>
                </td>
              </tr>

              <tr>
                <td
                  style="
                    padding:0 40px 8px 40px;
                    font-size:16px;
                    line-height:28px;
                    color:#404040;
                  "
                >
                  ${content}
                </td>
              </tr>

              ${
                ctaLabel && ctaUrl
                  ? `
                <tr>
                  <td align="center" style="padding:24px 40px 8px 40px;">
                    <a
                      href="${ctaUrl}"
                      style="
                        display:inline-block;
                        background:#111111;
                        color:#ffffff;
                        text-decoration:none;
                        font-size:15px;
                        font-weight:600;
                        padding:14px 24px;
                        border-radius:999px;
                      "
                    >
                      ${escapeHtml(ctaLabel)}
                    </a>
                  </td>
                </tr>
              `
                  : ""
              }

              <tr>
                <td
                  style="
                    padding:32px 40px 40px 40px;
                    font-size:13px;
                    line-height:22px;
                    color:#737373;
                    text-align:center;
                  "
                >
                  LineUp • Trusted on-demand beauty and personal services
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  if (!process.env.EMAIL_FROM) {
    throw new Error("Missing EMAIL_FROM env var");
  }

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}