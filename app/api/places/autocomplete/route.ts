import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { input, sessionToken } = await req.json();

    if (typeof input !== "string" || !input.trim() || input.length > 200) {
      return NextResponse.json({ suggestions: [] });
    }

    const res = await fetch(
      `https://places.googleapis.com/v1/places:autocomplete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
        },
        body: JSON.stringify({
          input,
          ...(typeof sessionToken === "string" && sessionToken ? { sessionToken } : {}),
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("Places autocomplete failed:", data?.error || data);
      return NextResponse.json(
        { suggestions: [], error: data?.error?.message || "Address lookup is temporarily unavailable." },
        { status: 502 }
      );
    }

    const suggestions =
      data.suggestions?.map((s: any) => ({
        placeId: s.placePrediction?.placeId,
        text: s.placePrediction?.text?.text,
      })) || [];

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { suggestions: [], error: "Address lookup is temporarily unavailable." },
      { status: 502 }
    );
  }
}