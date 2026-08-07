import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { placeId } = await req.json();

    if (!placeId || typeof placeId !== "string") {
      return NextResponse.json({ error: "Missing placeId" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_MAPS_API_KEY" },
        { status: 500 }
      );
    }

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,formattedAddress,location,displayName,addressComponents",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Places details error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Place details error" },
        { status: res.status }
      );
    }

    const lat = data.location?.latitude;
    const lng = data.location?.longitude;

    if (typeof lat !== "number" || typeof lng !== "number") {
      console.error("Places details missing coordinates:", data);
      return NextResponse.json(
        {
          error: "Google returned the place, but no coordinates.",
          placeId: data.id || placeId,
          formattedAddress: data.formattedAddress || null,
          lat: null,
          lng: null,
          name: data.displayName?.text || null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      placeId: data.id || placeId,
      formattedAddress: data.formattedAddress || null,
      lat,
      lng,
      name: data.displayName?.text || null,
    });
  } catch (error) {
    console.error("Places details failed:", error);
    return NextResponse.json({ error: "Place details failed" }, { status: 500 });
  }
}