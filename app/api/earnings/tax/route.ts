import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { localDate, proEarnings, shopEarnings, todayLocal } from "@/app/lib/earnings";
import { renderTaxStatementPdf } from "@/app/lib/earningsPdf";
import { DISCLAIMER, type BusinessType } from "@/app/lib/taxCategories";
import { gstTracker, lastFourQuarters, taxTransactions, taxYear, transactionsCsv, type BoostCharge } from "@/app/lib/taxYear";

// The tax year, for a pro (their own) or a shop (owner and managers only).
//   GET ?scope=me|shop&year=2026                the T2125 layout (or a neutral summary
//                                               for corporations), the GST/HST tracker
//                                               and saved settings
//   GET ...&format=csv | pdf                     the same year as a download
//   PUT { scope, legalName, gstNumber, businessType }   save settings (business type: shops)
// Members, other pros and customers get a 403. Nothing here changes checkout.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Who =
  | { error: NextResponse }
  | { error?: undefined; userId: string; supabase: ReturnType<typeof getServiceSupabase>; scope: "me" | "shop"; studio: Awaited<ReturnType<typeof getStudioForUser>> };

async function who(req: Request, scope: string): Promise<Who> {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  if (scope === "shop") {
    const studio = await getStudioForUser(supabase, user.id);
    if (!studio) return { error: NextResponse.json({ error: "You're not on a shop's team." }, { status: 404 }) };
    if (!studio.canManage) return { error: NextResponse.json({ error: "Only the owner and managers can see the shop's tax year." }, { status: 403 }) };
    return { userId: user.id, supabase, scope: "shop", studio };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role || "").toLowerCase();
  if (!role || role.includes("customer")) return { error: NextResponse.json({ error: "Earnings are for professionals." }, { status: 403 }) };
  return { userId: user.id, supabase, scope: "me", studio: null };
}

async function boostsFor(c: Exclude<Who, { error: NextResponse }>, from: string, to: string): Promise<BoostCharge[]> {
  let q = c.supabase.from("boosts").select("amount_cents, created_at, kind, target_id").gt("amount_cents", 0);
  if (c.scope === "shop" && c.studio) {
    const { data: openings } = await c.supabase.from("chair_openings").select("id").eq("studio_id", c.studio.studio.id);
    const ids = (openings || []).map((o) => o.id as string);
    if (!ids.length) return [];
    q = q.eq("kind", "chair_opening").in("target_id", ids);
  } else {
    q = q.eq("kind", "profile").eq("purchased_by", c.userId);
  }
  const { data } = await q.limit(2000);
  return (data || [])
    .map((b) => ({ date: localDate(new Date(b.created_at as string).getTime() / 1000), cents: Number(b.amount_cents) || 0 }))
    .filter((b) => b.date >= from && b.date <= to);
}

async function settingsFor(c: Exclude<Who, { error: NextResponse }>) {
  const q = c.supabase.from("tax_settings").select("legal_name, gst_number, business_type");
  const { data } = await (c.scope === "shop" && c.studio ? q.eq("studio_id", c.studio.studio.id) : q.eq("professional_id", c.userId)).maybeSingle();
  return {
    legalName: (data?.legal_name as string | null) || null,
    gstNumber: (data?.gst_number as string | null) || null,
    // Pros (studio members included) are independent: always sole proprietors here.
    businessType: (c.scope === "shop" ? (data?.business_type as BusinessType) || "sole_proprietor" : "sole_proprietor") as BusinessType,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const c = await who(req, url.searchParams.get("scope") || "me");
    if (c.error) return c.error;
    const today = todayLocal();
    const thisYear = Number(today.slice(0, 4));
    const year = Number(url.searchParams.get("year")) || thisYear;
    if (year < 2025 || year > thisYear) return NextResponse.json({ error: "Pick a year from 2025 on." }, { status: 400 });
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const load = (f: string, t: string) =>
      c.scope === "shop" && c.studio ? shopEarnings(c.supabase, c.studio.studio, f, t) : proEarnings(c.supabase, c.userId, f, t);

    const [result, boosts, settings] = await Promise.all([load(from, to), boostsFor(c, from, to), settingsFor(c)]);
    const tax = taxYear(result.rows, boosts, c.scope, settings.businessType);
    const format = url.searchParams.get("format");
    const name = settings.legalName || result.seller.businessName || result.seller.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lineup";

    if (format === "csv") {
      const csv = transactionsCsv(taxTransactions(result.rows, boosts, c.scope), { name, year, disclaimer: DISCLAIMER });
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lineup-${slug}-${year}-transactions.csv"`, "Cache-Control": "no-store" },
      });
    }
    if (format === "pdf") {
      const pdf = await renderTaxStatementPdf({
        year, scope: c.scope, seller: result.seller, legalName: settings.legalName, gstNumber: settings.gstNumber, tax,
        transactions: taxTransactions(result.rows, boosts, c.scope),
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="lineup-${slug}-${year}-tax-year.pdf"`, "Cache-Control": "no-store" },
      });
    }

    // GST/HST: the last four calendar quarters, whatever year is picked.
    const quarters = lastFourQuarters(today);
    const gstRows = (await load(quarters[0].from, quarters[3].to)).rows;
    return NextResponse.json({
      scope: c.scope, year, today, name, settings, tax,
      gst: gstTracker(gstRows, today, c.scope),
      transactions: taxTransactions(result.rows, boosts, c.scope).length,
    });
  } catch (error) {
    console.error("GET /api/earnings/tax failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not load your tax year.") }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const c = await who(req, body?.scope || "me");
    if (c.error) return c.error;
    const legalName = typeof body?.legalName === "string" ? body.legalName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) || null : null;
    const rawGst = typeof body?.gstNumber === "string" ? body.gstNumber.toUpperCase().replace(/\s+/g, " ").trim() : "";
    const gstNumber = rawGst ? rawGst.replace(/^(\d{9})\s*RT\s*(\d{4})$/, "$1 RT$2") : null;
    if (gstNumber && !/^[0-9]{9}( ?RT ?[0-9]{4})?$/.test(gstNumber)) {
      return NextResponse.json({ error: "A GST/HST number is 9 digits, often followed by RT0001." }, { status: 400 });
    }
    const types = ["sole_proprietor", "partnership", "corporation"];
    const businessType = c.scope === "shop" && types.includes(body?.businessType) ? body.businessType : "sole_proprietor";
    const owner = c.scope === "shop" && c.studio ? { studio_id: c.studio.studio.id } : { professional_id: c.userId };
    const { error } = await c.supabase
      .from("tax_settings")
      .upsert({ ...owner, legal_name: legalName, gst_number: gstNumber, business_type: businessType, updated_at: new Date().toISOString() }, { onConflict: c.scope === "shop" ? "studio_id" : "professional_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/earnings/tax failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save that.") }, { status: 500 });
  }
}
