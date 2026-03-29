import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getNewsletterMarch27Html } from "@/lib/email/newsletterMarch27";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resendApiKey = process.env.RESEND_API_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);
const resend = new Resend(resendApiKey);

export async function POST(req: NextRequest) {
  try {
    const adminKey = req.headers.get("x-admin-key");

    if (adminKey !== process.env.ADMIN_NEWSLETTER_KEY) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("marketing_consent", true)
      .eq("unsubscribed_from_marketing", false)
      .not("email", "is", null);

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message },
        { status: 500 }
      );
    }

    const { data: signupRows, error: signupError } = await supabase
      .from("lineup_signups")
      .select("email")
      .eq("marketing_consent", true)
      .eq("unsubscribed_from_marketing", false)
      .not("email", "is", null);

    if (signupError) {
      return NextResponse.json(
        { ok: false, error: signupError.message },
        { status: 500 }
      );
    }

    const emails = Array.from(
      new Set(
        [...(profileRows ?? []), ...(signupRows ?? [])]
          .map((row) => row.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email))
      )
    );

    if (emails.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No eligible recipients found." },
        { status: 400 }
      );
    }

    const results: Array<{
      email: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const email of emails) {
      const { error } = await resend.emails.send({
        from: "LineUp <hello@lineup-aesthetics.ca>",
        to: [email],
        subject: "LineUp Newsletter, 1st Edition",
        html: getNewsletterMarch27Html(email),
        headers: {
          "List-Unsubscribe": `<https://lineup-aesthetics.ca/unsubscribe?email=${encodeURIComponent(email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (error) {
        results.push({
          email,
          success: false,
          error: JSON.stringify(error),
        });
      } else {
        results.push({
          email,
          success: true,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: emails.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send newsletter",
      },
      { status: 500 }
    );
  }
}