// LineUp Studio announcement: studio accounts are live, and what they are.
// Same dark look as the launch newsletter: one headline, a short section per
// feature, a light card for chair openings, then the two plan prices.

import { STUDIO_PLANS } from "@/app/lib/plans";

const SITE = "https://www.lineup-aesthetics.ca";

export const NEWSLETTER_STUDIO_SUBJECT = "LineUp Studio is live: one account for your whole shop";

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

function plan(name: string, price: string, body: string) {
  return `
            <tr>
              <td style="padding:0 0 14px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#11131c; border:1px solid #1a1d28; border-radius:20px;">
                  <tr>
                    <td style="padding:22px 24px; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#d7dbe7;">
                      <span style="font-family:Georgia, 'Times New Roman', Times, serif; font-size:24px; line-height:30px; font-weight:bold; color:#ffffff;">${name}</span>
                      <span style="color:#8a90a5;">&nbsp;&middot;&nbsp;${price} a month</span><br />
                      ${body}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

export function getNewsletterStudioHtml(email: string) {
  const encodedEmail = encodeURIComponent(email);
  const signup = `${SITE}/login?mode=signup`;

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charSet="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LineUp Studio is live</title>
  </head>
  <body style="margin:0; padding:0; background-color:#07080d;">
    <div style="display:none; max-height:0; overflow:hidden; color:#07080d;">One calendar, a login for every pro, and a new way to fill an empty chair.</div>
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
                LineUp Newsletter • Studio Is Live
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 22px 0; font-family:Georgia, 'Times New Roman', Times, serif; font-size:44px; line-height:50px; font-weight:bold; color:#ffffff;">
                One account for your whole shop.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 30px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                LineUp Studio is now open to salon, barbershop and studio owners. Until now, LineUp was built for individual pros. Studio is for the person who runs the shop: it puts your whole team on one account, so you can see every booking, bring in new clients and fill your chairs from one place.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 40px 0;">
                <img src="${SITE}/images/news/studio-salon.jpg" alt="A salon floor with a row of styling chairs and round mirrors" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0; border-radius:24px;" />
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:3px; text-transform:uppercase; color:#8a90a5;">
                For shop owners
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 22px 0; font-family:Georgia, 'Times New Roman', Times, serif; font-size:30px; line-height:36px; font-weight:bold; color:#ffffff;">
                What a Studio account gives you.
              </td>
            </tr>

            ${step("1", "A login for every pro", "You run the main account, and everyone on your team gets their own LineUp account that is linked to your shop.")}
            ${step("2", "One calendar for the whole shop", "Online bookings, walk-ins and phone bookings all show up in the same calendar, so you always know who is busy and who is free.")}
            ${step("3", "New clients sent to your shop", "On LineUp, clients post what they want done. Requests near your shop come to you, and you decide which of your pros takes each one.")}
            ${step("4", "Keep what your own clients pay", "When your own clients book with you, LineUp takes no commission.")}
            ${step("5", "Memberships for your regulars", "Offer a monthly membership to the clients who come back every few weeks.")}

            <tr>
              <td style="padding:8px 0 44px 0;">
                ${button("Set up your shop", signup)}
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 34px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#dfe3f2; border-radius:24px;">
                  <tr>
                    <td style="padding:30px 28px 10px 28px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:3px; text-transform:uppercase; color:#5d6478;">
                      Chair openings
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 14px 28px; font-family:Georgia, 'Times New Roman', Times, serif; font-size:28px; line-height:34px; font-weight:bold; color:#111111;">
                      Fill your empty chair.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 22px 28px; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:29px; color:#262a36;">
                      When you have a chair open, you can post it on LineUp:<br /><br />
                      &bull; <strong>Say who you&rsquo;re looking for</strong>, whether it&rsquo;s booth rent or commission, and when they can start<br />
                      &bull; <strong>Only pros in that trade</strong> see your post<br />
                      &bull; <strong>Look through each applicant&rsquo;s</strong> profile, work and reviews<br />
                      &bull; <strong>Invite the right one</strong> to join your shop<br /><br />
                      <span style="color:#5d6478;">Posting a chair is included with every Studio plan, so it doesn&rsquo;t cost anything extra. Looking for a chair yourself? Pros can browse openings for their trade and apply with their LineUp profile.</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 30px 28px;">
                      ${button("Post a chair", signup, false)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; letter-spacing:3px; text-transform:uppercase; color:#8a90a5;">
                Pricing
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 22px 0; font-family:Georgia, 'Times New Roman', Times, serif; font-size:30px; line-height:36px; font-weight:bold; color:#ffffff;">
                One flat price, however big your team is.
              </td>
            </tr>

            ${plan(STUDIO_PLANS.studio.label, STUDIO_PLANS.studio.priceLabel, "Everything above for your whole shop: the shared calendar, a login for every pro, client requests, memberships and chair openings.")}
            ${plan(STUDIO_PLANS.studio_plus.label, STUDIO_PLANS.studio_plus.priceLabel, "Everything in Studio, and LineUp collects your shop&rsquo;s commission or booth rent from each pro and pays it to you automatically.")}

            <tr>
              <td style="padding:4px 0 30px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#8a90a5;">
                Prices are in CAD.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 20px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                Not a shop owner? Forward this to the person who runs yours.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 12px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#d7dbe7;">
                See you on LineUp.
              </td>
            </tr>

            <tr>
              <td style="padding:0 0 30px 0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:32px; color:#ffffff;">
                Noah Kaminsky<br />
                <span style="color:#8a90a5; font-size:15px;">Co-founder &amp; CEO, LineUp</span>
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
