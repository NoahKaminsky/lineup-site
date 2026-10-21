import { NextResponse } from "next/server";
import { getBookingWindows, getBusyTimes } from "@/app/lib/busyTimes";

// GET /api/professional/busy-times?ids=<id,id>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Public: returns only booked/time-off ranges (nothing about the bookings)
// and how many days ahead each pro takes bookings.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const MAX_RANGE_DAYS = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID.test(id))
    .slice(0, MAX_IDS);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  if (ids.length === 0 || !DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: "Pass ids, from and to (YYYY-MM-DD)." }, { status: 400 });
  }
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Date range too long." }, { status: 400 });
  }

  try {
    const [busy, windows] = await Promise.all([getBusyTimes(ids, from, to), getBookingWindows(ids)]);
    return NextResponse.json({ busy, windows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load times." }, { status: 500 });
  }
}
