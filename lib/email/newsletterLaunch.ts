// Launch announcement: LineUp is live — come set up your account.
// Same dark look as the March 27 newsletter, with a real button and one
// short section each for clients and professionals.

const SITE = "https://www.lineup-aesthetics.ca";

export const NEWSLETTER_LAUNCH_SUBJECT = "LineUp is live — set up your account";

function step(number: string, title: string, body: string) {
  return `
            <tr>
              <td style="padding:0 0 18px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="44" valign="top" style="padding:2px 0 0 0;">
                      <div style="width:32px; height:32px; border-radius:16px; background-color:#1a1d28; color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; line-height:32px; text-align:center;">${number}</div>
                    </td>
                    <td valign="top" style="font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#d7dbe7;">
                      <strong style="color:#ffffff;">${title}</strong><br />${body}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

function button(label: string, href: string, light = true) {
  return `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:999px; background-color:${light ? "#ffffff" : "#1a1d28"};">
                      <a href="${href}" style="display:inline-block; padding:16px 32px; font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:700; color:${light ? "#07080d" : "#ffffff"}; text-decoration:none; border-radius:999px;">${label}</a>
                    </td>
                  </tr>
                </table>`;
}

export function getNewsletterLaunchHtml(email: string) {
  const encodedEmail = encodeURIComponent(email);

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charSet="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LineUp is live</title>
  </head>
  <body style="margin:0; padding:0; background-color:#07080d;">
    <div style="display:none; max-height:0; overflow:hidden; color:#07080d;">Book local beauty pros in Winnipeg — or get booked. Your account takes two minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0; padding:0; width:100%; background-color:#07080d;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#07080d;">

            <tr>
              <td align="center" style="padding:0 0 20px 0;">
                <img src="${SITE}/favicon.png" alt="LineUp" width="96" style="display:block; width:96px; max-width:96px; height:auto; border:0;" />
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; letter-spacing:4px; text-transform:uppercase; color:#7f8599;">
                LineUp Newsletter • We&rsquo;re Live
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 22px 0; font-family:Georgia, 'Times New Roman', Times, serif; font-size:44px; line-height:50px; font-weight:bold; color:#ffffff;">
                LineUp is ready to go.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 30px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                The beta is over. Requests, offers, secure payments and booking are all live in Winnipeg &mdash; and the first pros and clients are already on. Set up your account now so you&rsquo;re in from day one.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 40px 0;">
                <img src="${SITE}/images/hero-barber.jpg" alt="A LineUp professional at work" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0; border-radius:24px;" />
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:3px; text-transform:uppercase; color:#8a90a5;">
                Looking for a service
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 22px 0; font-family:Georgia, 'Times New Roman', Times, serif; font-size:30px; line-height:36px; font-weight:bold; color:#ffffff;">
                Post what you want. Pros come to you.
              </td>
            </tr>

            ${step("1", "Post a request", "Hair, nails, lashes, brows, makeup, waxing or sugaring &mdash; add photos and when you&rsquo;re free.")}
            ${step("2", "Compare offers", "Verified local pros send you a price and a time. Check their work and reviews.")}
            ${step("3", "Book and pay securely", "Pick one, pay through LineUp, and chat with your pro right in the app.")}

            <tr>
              <td style="padding:8px 0 44px 0;">
                ${button("Create your account", `${SITE}/login`)}
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 34px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#dfe3f2; border-radius:24px;">
                  <tr>
                    <td style="padding:30px 28px 10px 28px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:3px; text-transform:uppercase; color:#5d6478;">
                      For professionals
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 14px 28px; font-family:Georgia, 'Times New Roman', Times, serif; font-size:28px; line-height:34px; font-weight:bold; color:#111111;">
                      Get booked without chasing DMs.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 22px 28px; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:29px; color:#262a36;">
                      Clients near you post what they want &mdash; you send offers on the jobs that fit. To start getting requests:<br /><br />
                      &bull; <strong>Create your account</strong> and pick every profession you do<br />
                      &bull; <strong>Get verified</strong> &mdash; upload your licence or certificate once<br />
                      &bull; <strong>Connect payouts</strong> so you get paid straight to your bank<br />
                      &bull; <strong>Add your services</strong> and photos of your work
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 30px 28px;">
                      ${button("Set up my pro account", `${SITE}/login`, false)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 20px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                Already have an account? Sign in and finish your profile &mdash; that&rsquo;s what clients and pros see first.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 12px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                See you on LineUp.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 30px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#ffffff;">
                Noah &amp; Dan<br />
                <span style="color:#8a90a5; font-size:15px;">Co-founders, LineUp</span>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 0 0 0; border-top:1px solid #1a1d28; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:22px; color:#8f96aa;">
                You&rsquo;re receiving this because you signed up for LineUp updates.<br />
                Questions? Reply or email lineupmb@gmail.com<br />
                To stop receiving these emails, <a href="${SITE}/unsubscribe?email=${encodedEmail}" style="color:#bfc6da; text-decoration:underline;">unsubscribe here</a>.
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
