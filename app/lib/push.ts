import webpush from "web-push";
import { getServiceSupabase } from "@/app/lib/serverSupabase";

// Unlike sms.ts, there's no external account to set up here -- VAPID keys
// are a self-generated key pair (see the comment in .env.local), not
// something that requires a Twilio-style signup. This is genuinely free:
// no per-message cost, no phone number to rent.

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// Sends to every device a user has granted notification permission on (a
// browser's subscription can go stale -- uninstalled, data cleared, another
// device took over -- so a 404/410 from the push service means "this
// subscription is dead," not "something went wrong"; those get cleaned up
// here rather than retried forever).
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureVapidConfigured()) {
    console.warn(`Push not sent (VAPID not configured yet): would have sent to user ${userId}: "${payload.title}"`);
    return { ok: false, skipped: true, sent: 0 };
  }

  const supabase = getServiceSupabase();
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { ok: false, skipped: true, sent: 0 };
  }

  let sent = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadIds.push(sub.id);
        } else {
          console.error(`Push send failed for subscription ${sub.id}:`, error);
        }
      }
    })
  );

  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }

  return { ok: sent > 0, skipped: false, sent };
}
