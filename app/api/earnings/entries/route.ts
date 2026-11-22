import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";
import { getStudioForUser, errorMessage } from "@/app/lib/studios";
import { todayLocal } from "@/app/lib/earnings";
import { EXPENSE_CATEGORIES } from "@/app/lib/expenseCategories";

// Things logged by hand on the Earnings page, so the statement is complete:
//   sale:    a cash or walk-in client, for a pro working on their own
//            (shops log walk-ins in the Calendar)
//   product: something sold over the counter
//   expense: a business cost (supplies, rent, tools…)
// POST   { scope: "me" | "shop", kind, date, … }
// DELETE ?scope=&kind=&id=

const PAID_WITH = ["cash", "card", "etransfer", "other"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const cents = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : null;
};

async function who(req: Request, scope: string) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const supabase = getServiceSupabase();
  if (scope === "shop") {
    const ctx = await getStudioForUser(supabase, user.id);
    if (!ctx?.canManage) return { error: NextResponse.json({ error: "Only the owner and managers can change the shop's records." }, { status: 403 }) };
    return { user, supabase, studioId: ctx.studio.id as string };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role || "").toLowerCase();
  if (!role || role.includes("customer")) return { error: NextResponse.json({ error: "Earnings are for professionals." }, { status: 403 }) };
  return { user, supabase, studioId: null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await who(req, body?.scope);
    if (ctx.error) return ctx.error;
    const { user, supabase, studioId } = ctx;

    const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
    if (!date || date > todayLocal() || date < "2025-01-01") return NextResponse.json({ error: "Pick a date up to today." }, { status: 400 });
    const paidWith = PAID_WITH.includes(body?.paidWith) ? body.paidWith : null;

    if (body?.kind === "sale") {
      if (studioId) return NextResponse.json({ error: "Log shop walk-ins in the Calendar so they go to the right pro." }, { status: 400 });
      const price = cents(body?.priceCents);
      const tip = cents(body?.tipCents ?? 0);
      const service = text(body?.service, 120);
      if (!service) return NextResponse.json({ error: "What was the service?" }, { status: 400 });
      if (!price || tip === null) return NextResponse.json({ error: "Enter what they paid." }, { status: 400 });
      const { error } = await supabase.from("shop_appointments").insert({
        studio_id: null,
        professional_id: user.id,
        created_by: user.id,
        kind: "walk_in",
        client_name: text(body?.clientName, 80) || "Walk-in",
        client_phone: text(body?.clientPhone, 30) || null,
        service_name: service,
        appointment_date: date,
        start_time: "12:00",
        end_time: "12:30",
        price_cents: price,
        shop_cut_cents: 0,
        status: "completed",
        paid_with: paidWith,
        tip_cents: tip,
        note: "Logged on the Earnings page",
      });
      if (error) throw error;
    } else if (body?.kind === "product") {
      const amount = cents(body?.amountCents);
      const item = text(body?.item, 120);
      if (!item || !amount) return NextResponse.json({ error: "Enter the product and what it sold for." }, { status: 400 });
      const { error } = await supabase.from("product_sales").insert({ professional_id: user.id, studio_id: studioId, sale_date: date, item, amount_cents: amount, paid_with: paidWith });
      if (error) throw error;
    } else if (body?.kind === "expense") {
      const amount = cents(body?.amountCents);
      const gst = cents(body?.gstCents ?? 0);
      if (!(body?.category in EXPENSE_CATEGORIES)) return NextResponse.json({ error: "Pick a category." }, { status: 400 });
      if (!amount || gst === null || gst > amount) return NextResponse.json({ error: "Enter the amount (and GST no bigger than it)." }, { status: 400 });
      const { error } = await supabase.from("business_expenses").insert({
        owner_id: user.id,
        studio_id: studioId,
        expense_date: date,
        category: body.category,
        amount_cents: amount,
        gst_cents: gst,
        note: text(body?.note, 200) || null,
      });
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Unknown entry." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/earnings/entries failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not save that.") }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const ctx = await who(req, url.searchParams.get("scope") || "me");
    if (ctx.error) return ctx.error;
    const { user, supabase, studioId } = ctx;
    const kind = url.searchParams.get("kind");
    const id = (url.searchParams.get("id") || "").replace(/^(prod|exp)-/, "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    let removed = 0;
    if (kind === "sale") {
      const { data, error } = await supabase.from("shop_appointments").delete().eq("id", id).eq("professional_id", user.id).eq("created_by", user.id).is("studio_id", null).select("id");
      if (error) throw error;
      removed = data?.length || 0;
    } else if (kind === "product" || kind === "expense") {
      const table = kind === "product" ? "product_sales" : "business_expenses";
      const ownerCol = kind === "product" ? "professional_id" : "owner_id";
      const q = supabase.from(table).delete().eq("id", id);
      const { data, error } = await (studioId ? q.eq("studio_id", studioId) : q.eq(ownerCol, user.id).is("studio_id", null)).select("id");
      if (error) throw error;
      removed = data?.length || 0;
    }
    if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/earnings/entries failed:", error);
    return NextResponse.json({ error: errorMessage(error, "Could not remove that.") }, { status: 500 });
  }
}
