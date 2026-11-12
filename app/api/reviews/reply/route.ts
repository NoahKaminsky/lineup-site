import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase, isSameOriginRequest } from "@/app/lib/serverSupabase";
import { containsProfanity } from "@/app/lib/profanityFilter";

// POST { reviewId, reply }  The reviewed pro posts, changes or (empty reply)
// removes their public reply to a review. The client is told when a reply
// is first posted.
export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reply = String(body?.reply || "").trim().slice(0, 1000) || null;
  if (reply && containsProfanity(reply)) return NextResponse.json({ error: "Please keep replies professional." }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: review } = await supabase
    .from("professional_reviews")
    .select("id, professional_id, reviewer_id, pro_reply")
    .eq("id", body?.reviewId)
    .maybeSingle();
  if (!review || review.professional_id !== user.id) return NextResponse.json({ error: "You can only reply to your own reviews." }, { status: 403 });

  const { error } = await supabase
    .from("professional_reviews")
    .update({ pro_reply: reply, pro_replied_at: reply ? new Date().toISOString() : null })
    .eq("id", review.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (reply && !review.pro_reply) {
    const { data: pro } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    await supabase.from("notifications").insert([
      {
        user_id: review.reviewer_id,
        is_read: false,
        type: "review_reply",
        title: `${pro?.full_name || "Your pro"} replied to your review`,
      },
    ]);
  }

  return NextResponse.json({ ok: true, reply });
}
