import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getServiceSupabase, requireAdmin } from "@/app/lib/serverSupabase";
import { getNewsletterAudience } from "@/app/lib/newsletterAudience";
import { NEWSLETTER_LAUNCH_SUBJECT, getNewsletterLaunchHtml } from "@/lib/email/newsletterLaunch";

// Sending a few hundred emails in batches takes a little while.
export const maxDuration = 300;

const FROM = "LineUp <hello@lineup-aesthetics.ca>";
const REPLY_TO = "lineupmb@gmail.com";
const BATCH_SIZE = 100; // Resend's batch limit

function message(email: string) {
  return {
    from: FROM,
    to: [email],
    replyTo: REPLY_TO,
    subject: NEWSLETTER_LAUNCH_SUBJECT,
    html: getNewsletterLaunchHtml(email),
    headers: {
      "List-Unsubscribe": `<https://www.lineup-aesthetics.ca/unsubscribe?email=${encodeURIComponent(email)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

// Who would get it — counts only, never the list itself.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { counts } = await getNewsletterAudience(getServiceSupabase());
    return NextResponse.json({ subject: NEWSLETTER_LAUNCH_SUBJECT, counts, adminEmail: admin.email || null });
  } catch (error) {
    console.error("Newsletter audience failed:", error);
    return NextResponse.json({ error: "Could not load the mailing list." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY isn't set." }, { status: 500 });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const body = await req.json().catch(() => ({}));

  // 1. Test: just the signed-in admin.
  if (body.action === "test") {
    if (!admin.email) return NextResponse.json({ error: "Your account has no email." }, { status: 400 });
    const { error } = await resend.emails.send(message(admin.email));
    if (error) return NextResponse.json({ error: error.message || "Test send failed." }, { status: 502 });
    return NextResponse.json({ ok: true, sentTo: admin.email });
  }

  // 2. Everyone. The page must echo back the exact recipient count it showed,
  // so a stray tap (or a list that changed since) can't fire it by accident.
  if (body.action === "send") {
    const service = getServiceSupabase();
    const { recipients } = await getNewsletterAudience(service);

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No one on the list has opted in." }, { status: 400 });
    }
    if (body.confirmCount !== recipients.length) {
      return NextResponse.json(
        { error: "The list changed since you loaded it — refresh and check the count again." },
        { status: 409 }
      );
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE);
      const { error } = await resend.batch.send(chunk.map(message));
      if (error) {
        console.error(`Newsletter batch ${i / BATCH_SIZE + 1} failed:`, error);
        failed += chunk.length;
      } else {
        sent += chunk.length;
      }
    }

    console.log(`Launch newsletter sent by ${admin.id}: ${sent} sent, ${failed} failed`);
    return NextResponse.json({ ok: failed === 0, sent, failed, total: recipients.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
