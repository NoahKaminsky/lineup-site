// Pure, dependency-free — safe to import from both client components (the
// account settings form) and server code (app/lib/sms.ts). Keeping this
// separate from sms.ts specifically so a client component never pulls in
// the Twilio SDK (which needs Node built-ins) just to validate a phone
// number on a form.

// E.164-ish sanity check (e.g. +12045551234) — not a full validator, just
// enough to reject obviously-wrong input before it's saved or sent to Twilio.
export function isLikelyValidPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}
