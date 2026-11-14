import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { proEarnings, shopEarnings, todayLocal } from "@/app/lib/earnings";
import { renderStatementPdf } from "@/app/lib/earningsPdf";

// GET /api/earnings/statement?scope=me|shop&year=2026[&month=0-11][&name=…][&gst=…]
// The earnings statement as a PDF. name and gst are what the person typed for
// the header (their legal name and GST/HST number); they aren't stored.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function clean(value: string | null, max: number) {
  return (value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) || null;
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "shop" ? "shop" : "me";
    const thisYear = Number(todayLocal().slice(0, 4));
    const year = Number(url.searchParams.get("year")) || thisYear;
    if (year < 2025 || year > thisYear) return NextResponse.json({ error: "Pick a year from 2025 on." }, { status: 400 });
    const monthParam = url.searchParams.get("month");
    const month = monthParam === null || monthParam === "" || monthParam === "all" ? null : Number(monthParam);
    if (month !== null && !(Number.isInteger(month) && month >= 0 && month <= 11)) {
      return NextResponse.json({ error: "Pick a month." }, { status: 400 });
    }
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const supabase = getServiceSupabase();
    let result;
    if (scope === "shop") {
      const ctx = await getStudioForUser(supabase, user.id);
      if (!ctx) return NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 });
      if (!ctx.canManage) return NextResponse.json({ error: "Only the owner and managers can see the shop's earnings." }, { status: 403 });
      result = await shopEarnings(supabase, ctx.studio, from, to);
    } else {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const role = String(profile?.role || "").toLowerCase();
      if (!role || role.includes("customer")) return NextResponse.json({ error: "Earnings are for professionals." }, { status: 403 });
      result = await proEarnings(supabase, user.id, from, to);
    }

    const pdf = await renderStatementPdf({
      scope,
      year,
      month,
      seller: result.seller,
      rows: result.rows,
      attention: result.attention,
      legalName: clean(url.searchParams.get("name"), 100),
      gstNumber: clean(url.searchParams.get("gst"), 30),
    });

    const slug = result.seller.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "earnings";
    const when = month === null ? String(year) : `${year}-${String(month + 1).padStart(2, "0")}`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lineup-earnings-${slug}-${when}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/earnings/statement failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not make the statement.") }, { status: 500 });
  }
}
