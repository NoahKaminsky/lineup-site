import { NextResponse } from "next/server";

// Short booking link: lineup-aesthetics.ca/book/<username or id> opens the
// professional's profile at their booking calendar.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = encodeURIComponent(decodeURIComponent(slug).trim());
  return NextResponse.redirect(new URL(`/profile/${safe}#availability`, req.url));
}
