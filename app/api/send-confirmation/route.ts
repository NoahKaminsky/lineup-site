import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, role, firstName } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const name = firstName || "there";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const logoUrl = `${siteUrl}/favicon.png`;

    const { error } = await resend.emails.send({
      from: "LineUp <hello@lineup-aesthetics.ca>",
      to: email,
      subject: "You're officially on the LineUp prelaunch list",
      html: `
<div style="background:#f6f7f9;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial">

<div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:36px 32px;box-shadow:0 20px 60px rgba(0,0,0,0.08)">

<div style="text-align:center;margin-bottom:18px">
<img src="${logoUrl}" style="width:90px"/>
</div>

<h2 style="margin:0 0 18px 0;font-size:22px;color:#111">
Greetings ${name},
</h2>

<p style="color:#444;line-height:1.6;margin-bottom:18px">
We just wanted to reach out and say thank you for signing up for <strong>LineUp</strong>, the future of On-Demand Aesthetics.
</p>

<p style="color:#444;line-height:1.6;margin-bottom:18px">
We really appreciate your support and are offering you a discount on any service once the site goes live.
</p>

<div style="background:#111;color:white;padding:16px;border-radius:10px;text-align:center;font-weight:600;margin:20px 0">
Promo Code: FOUNDER
</div>

<p style="color:#444;line-height:1.6;margin-bottom:18px">
Once launched, you will receive a link for the live marketplace to this same email address.
</p>

<p style="color:#444;line-height:1.6;margin-bottom:20px">
Please contact us at
<a href="mailto:lineupmb@gmail.com" style="color:#111;font-weight:600">
lineupmb@gmail.com
</a>
for any questions, concerns, or business inquiries.
</p>

<p style="color:#444;line-height:1.6;margin-bottom:24px">
We sincerely look forward to your continued support as we change the aesthetic marketplace.
</p>

<div style="border-top:1px solid #eee;padding-top:16px;color:#555;font-size:14px">
<strong>Best wishes,</strong><br/><br/>
Noah Kaminsky (Co-Founder & COO)<br/>
Dan Latimer (Co-Founder & CFO)<br/>
Max Kochan (Co-Founder & CEO)
</div>

${
  role
    ? `<p style="margin-top:18px;font-size:12px;color:#999">Signed up as: ${role}</p>`
    : ""
}

</div>

<div style="text-align:center;font-size:12px;color:#aaa;margin-top:14px">
© LineUp
</div>

</div>
`,
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Email failed" });
  }
}