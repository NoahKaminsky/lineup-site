import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

// "Osborne Village, Winnipeg": neighbourhood (if any) and city, never the
// street address. This is what a professional sees about where a request is.
function buildAreaLabel(components: AddressComponent[] | undefined): string | null {
  if (!Array.isArray(components)) return null;
  const find = (...types: string[]) =>
    components.find((c) => types.some((t) => c.types?.includes(t)))?.longText || null;
  const neighbourhood = find("neighborhood", "sublocality_level_1", "sublocality");
  const city = find("locality", "postal_town", "administrative_area_level_3");
  const region = find("administrative_area_level_1");
  const parts = [neighbourhood, city || region].filter(Boolean) as string[];
  return parts.length ? Array.from(new Set(parts)).join(", ") : null;
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { placeId, sessionToken } = await req.json();

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

    const detailsUrl = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    if (typeof sessionToken === "string" && sessionToken) {
      detailsUrl.searchParams.set("sessionToken", sessionToken);
    }

    const res = await fetch(detailsUrl.toString(), {
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
      areaLabel: buildAreaLabel(data.addressComponents),
    });
  } catch (error) {
    console.error("Places details failed:", error);
    return NextResponse.json({ error: "Place details failed" }, { status: 500 });
  }
}