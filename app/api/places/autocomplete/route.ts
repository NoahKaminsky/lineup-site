import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { input } = await req.json();

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
        }),
      }
    );

    const data = await res.json();

    const suggestions =
      data.suggestions?.map((s: any) => ({
        placeId: s.placePrediction?.placeId,
        text: s.placePrediction?.text?.text,
      })) || [];

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ suggestions: [] });
  }
}