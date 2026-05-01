import { NextResponse } from "next/server";
import { sendEmail } from "@/app/lib/email";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

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

    const { data: customer } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", requestData.client_id)
      .single();

    const { data: professional } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", offer.professional_id)
      .single();

    if (!customer?.email) {
      return NextResponse.json({ ok: true, skipped: "customer has no email" });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const requestUrl = `${siteUrl}/requests/${requestData.id}`;
    const professionalName = professional?.full_name || "A professional";

    const html = `
      <h2>New offer received</h2>
      <p>${professionalName} sent you a new offer on LineUp.</p>
      <p><a href="${requestUrl}">View offer</a></p>
    `;

    await sendEmail({
      to: customer.email,
      subject: "New offer on LineUp",
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Offer notification failed:", err);
    return NextResponse.json(
      { error: err?.message || "Notification failed" },
      { status: 500 }
    );
  }
}
