import { Resend } from "resend";

// Every email LineUp sends goes through here (sendEmail and the routes that
// batch-send), so one switch can stop them all:
//   EMAIL_DISABLED=1  sends nothing (local dev, previews, test runs)
// and messages to reserved test domains (example.com, *.test, …: RFC 2606) are
// always dropped, so TEST accounts never reach Resend. Resend reports failures
// as { error } instead of throwing; those are logged here so none go silent.

type SendOptions = Parameters<Resend["emails"]["send"]>[0];
type BatchOptions = Parameters<Resend["batch"]["send"]>[0];
type Recipients = string | string[] | undefined;

const TEST_DOMAIN = /@(?:[^@\s>]+\.)?(?:example\.(?:com|org|net)|[^@\s>]+\.(?:test|example|invalid|localhost))>?\s*$/i;

export function emailDisabled(env: Record<string, string | undefined> = process.env) {
  return /^(1|true|yes)$/i.test(String(env.EMAIL_DISABLED || "").trim());
}

export function isTestAddress(address: string) {
  return TEST_DOMAIN.test(address.trim());
}

function keep(list: Recipients): string[] {
  if (!list) return [];
  return (Array.isArray(list) ? list : [list]).filter((a) => !isTestAddress(a));
}

// The message with test addresses removed, or null if nobody real is left.
export function guardMessage<T extends { to: Recipients; cc?: Recipients; bcc?: Recipients }>(
  message: T,
  env: Record<string, string | undefined> = process.env,
): T | null {
  if (emailDisabled(env)) return null;
  const to = keep(message.to);
  if (to.length === 0) return null;
  const out = { ...message, to: Array.isArray(message.to) ? to : to[0] };
  if (message.cc) out.cc = keep(message.cc);
  if (message.bcc) out.bcc = keep(message.bcc);
  return out;
}

let client: Resend | null = null;
const resend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

// Same shape as `new Resend(key)` for the two calls the app uses.
export function getMailer() {
  return {
    emails: {
      async send(message: SendOptions) {
        const guarded = guardMessage(message as SendOptions & { to: Recipients });
        if (!guarded) {
          console.info(`[email] skipped "${message.subject}" (${emailDisabled() ? "EMAIL_DISABLED" : "test address"})`);
          return { data: null, error: null };
        }
        const result = await resend().emails.send(guarded);
        if (result.error) console.error(`[email] "${message.subject}" failed:`, result.error);
        return result;
      },
    },
    batch: {
      async send(messages: BatchOptions) {
        const guarded = messages.map((m) => guardMessage(m as (typeof messages)[number] & { to: Recipients })).filter((m) => m !== null);
        const skipped = messages.length - guarded.length;
        if (skipped) console.info(`[email] skipped ${skipped} of ${messages.length} in a batch (${emailDisabled() ? "EMAIL_DISABLED" : "test addresses"})`);
        if (guarded.length === 0) return { data: null, error: null };
        const result = await resend().batch.send(guarded as BatchOptions);
        if (result.error) console.error(`[email] batch of ${guarded.length} failed:`, result.error);
        return result;
      },
    },
  };
}
