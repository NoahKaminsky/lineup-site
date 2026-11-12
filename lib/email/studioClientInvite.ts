// The one email a shop sends its own clients from LineUp: "we take bookings
// on LineUp now, here's our page". Sent in the shop's name. Must carry the
// shop's name and address and an unsubscribe link (CASL), so those aren't
// optional here.

import { escapeHtml } from "@/app/lib/email";

const SITE = "https://www.lineup-aesthetics.ca";

export function studioInviteEmail({
  shopName,
  shopAddress,
  bookUrl,
  clientName,
  unsubscribeUrl,
  kind = "shop",
}: {
  kind?: "shop" | "pro";
  shopName: string;
  shopAddress: string | null;
  bookUrl: string;
  clientName: string | null;
  unsubscribeUrl: string;
}) {
  const shop = escapeHtml(shopName);
  const first = clientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${escapeHtml(first)},` : "Hi there,";
  const subject = `${shopName} now takes bookings on LineUp`;

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f5f5f5;">
    <div style="display:none; max-height:0; overflow:hidden; color:#f5f5f5;">See open times and book your next visit online, any time.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; background-color:#ffffff; border:1px solid #e5e5e5; border-radius:28px;">
            <tr>
              <td style="padding:40px 36px 8px 36px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#8a8a8a;">
                ${shop}
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 20px 36px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:30px; line-height:36px; font-weight:700; letter-spacing:-0.5px; color:#111111;">
                You can now book with us online.
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 24px 36px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:16px; line-height:26px; color:#333333;">
                ${greeting}<br /><br />
                ${shop} is now on LineUp. You can ${kind === "shop" ? "see who&rsquo;s working, " : "see open times, "}pick a service and book whenever it suits you, without calling or messaging.
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 32px 36px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:999px; background-color:#111111;">
                      <a href="${bookUrl}" style="display:inline-block; padding:15px 30px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Book with ${shop}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 36px 36px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:14px; line-height:22px; color:#666666;">
                Save the link for next time. If you have a question, just reply to this email and it goes straight to ${kind === "shop" ? "the shop" : shop}.
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:20px 36px 0 36px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:12px; line-height:19px; color:#8a8a8a;">
                You&rsquo;re getting this one-time email because you&rsquo;re a client of ${shop}${
                  shopAddress ? `, ${escapeHtml(shopAddress)}` : ""
                }. Sent on their behalf by <a href="${SITE}" style="color:#8a8a8a;">LineUp</a>.<br />
                <a href="${unsubscribeUrl}" style="color:#555555; text-decoration:underline;">Don&rsquo;t email me from ${shop} again</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
