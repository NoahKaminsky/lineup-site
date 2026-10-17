import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    // Browse is public, so this can't require a login — but it can refuse
    // calls from other websites trying to use our Google quota.
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ label: null }, { status: 403 });
    }

    const { lat, lng } = await req.json();

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    const result = data.results?.[0];
    const components = result?.address_components || [];

    const locality = components.find((c: any) => c.types.includes("locality"))?.long_name;
    const region = components.find((c: any) =>
      c.types.includes("administrative_area_level_1")
    )?.short_name;

    const label = [locality, region].filter(Boolean).join(", ") || null;

    return NextResponse.json({ label });
  } catch (error: any) {
    console.error("reverse-geocode failed:", error);
    return NextResponse.json({ label: null });
  }
}
