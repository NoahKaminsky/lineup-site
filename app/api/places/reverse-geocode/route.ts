import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { lat, lng } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
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
