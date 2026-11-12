import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/lib/serverSupabase";
import { calendarFeedPath } from "@/app/lib/calendarFeed";
import { getSiteUrl } from "@/app/lib/siteUrl";

// GET: the signed-in pro's private calendar feed link, in the forms each
// calendar app wants.
export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const https = `${getSiteUrl("https://www.lineup-aesthetics.ca")}${calendarFeedPath(user.id)}`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return NextResponse.json({
    url: https,
    apple: webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent("LineUp bookings")}`,
  });
}
