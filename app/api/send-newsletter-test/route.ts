import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getNewsletterMarch27Html } from "@/lib/email/newsletterMarch27";
import { requireAdmin } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  // Sends real email on our Resend account — admins only.
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const resend = new Resend(process.env.RESEND_API_KEY!);

  try {
    const testEmail = "lineupmb@gmail.com";

    const { data, error } = await resend.emails.send({
      from: "LineUp <hello@lineup-aesthetics.ca>",
      to: [testEmail],
      subject: "LineUp Newsletter, 1st Edition",
      html: getNewsletterMarch27Html(testEmail),
      headers: {
        "List-Unsubscribe": `<https://lineup-aesthetics.ca/unsubscribe?email=${encodeURIComponent(testEmail)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send test newsletter",
      },
      { status: 500 }
    );
  }
}