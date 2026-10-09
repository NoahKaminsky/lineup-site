import twilio from "twilio";
import { isLikelyValidPhoneNumber } from "@/app/lib/phoneValidation";

// Twilio is an installed dependency but was never wired up or configured —
// no TWILIO_* env vars exist yet. Unlike stripe.ts (which throws at import
// time if unconfigured, because the app genuinely can't function without
// payments), SMS is additive on top of email: every call site here should
// work fine whether or not a Twilio account has been set up yet. Once real
// credentials are added to the environment, sends start working with no
// code change — until then this just logs and no-ops.

let client: ReturnType<typeof twilio> | null = null;
let clientInitAttempted = false;

function getClient() {
  if (clientInitAttempted) return client;
  clientInitAttempted = true;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;

  client = twilio(accountSid, authToken);
  return client;
}

export function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms({ to, body }: { to: string; body: string }): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const smsClient = getClient();

  if (!smsClient || !fromNumber) {
    console.warn(`SMS not sent (Twilio not configured yet): would have sent to ${to}: "${body}"`);
    return { ok: false, skipped: true };
  }

  if (!isLikelyValidPhoneNumber(to)) {
    return { ok: false, error: "Invalid phone number format" };
  }

  try {
    await smsClient.messages.create({ to, from: fromNumber, body });
    return { ok: true };
  } catch (error) {
    console.error(`Failed to send SMS to ${to}:`, error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Shared guard for every call site below: only send if the profile has a
// phone number on file AND has explicitly opted in. Never sends based on
// phone_number presence alone -- SMS consent has to be its own explicit
// choice, separate from just having entered a number (e.g. for display or
// a professional's booking contact info).
export async function sendSmsToProfileIfOptedIn(
  profile: { phone_number?: string | null; sms_notifications_enabled?: boolean | null } | null | undefined,
  body: string
) {
  if (!profile?.phone_number || !profile.sms_notifications_enabled) {
    return { ok: false, skipped: true };
  }
  return sendSms({ to: profile.phone_number, body });
}
