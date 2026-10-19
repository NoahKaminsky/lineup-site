import type { getServiceSupabase } from "@/app/lib/serverSupabase";

type Service = ReturnType<typeof getServiceSupabase>;

// Who gets the launch email, deduplicated (someone on both lists gets one copy):
// - Waitlist sign-ups (lineup_signups): everyone. They joined specifically
//   for "early access before launch"; the old form never had a separate
//   marketing checkbox, so their marketing_consent isn't a real answer.
// - Account holders (profiles): only those who ticked "yes" to marketing at
//   signup, since they were asked and some said no.
// Anyone who unsubscribed from either list is always left out.
export async function getNewsletterAudience(service: Service) {
  const [profilesAll, signupsAll] = await Promise.all([
    service.from("profiles").select("email, marketing_consent, unsubscribed_from_marketing").not("email", "is", null),
    service.from("lineup_signups").select("email, marketing_consent, unsubscribed_from_marketing").not("email", "is", null),
  ]);

  if (profilesAll.error) throw new Error(profilesAll.error.message);
  if (signupsAll.error) throw new Error(signupsAll.error.message);

  type Row = { email: string | null; marketing_consent: boolean | null; unsubscribed_from_marketing: boolean | null };
  const clean = (rows: Row[] | null) =>
    (rows || []).map((row) => ({ ...row, email: row.email?.trim().toLowerCase() || "" })).filter((row) => row.email.includes("@"));

  const profiles = clean(profilesAll.data as Row[]);
  const signups = clean(signupsAll.data as Row[]);

  // Anyone who unsubscribed on EITHER list is out, even if the other list
  // still says yes.
  const unsubscribed = new Set(
    [...profiles, ...signups].filter((row) => row.unsubscribed_from_marketing).map((row) => row.email)
  );

  // The waitlist form never asked about marketing, so a waitlist row's
  // marketing_consent is just the column default (often false) — not a real
  // answer. Every waitlist email is in unless it unsubscribed. Account holders
  // were actually asked, so they need a real "yes".
  const candidates = new Set([
    ...signups.map((row) => row.email),
    ...profiles.filter((row) => row.marketing_consent === true).map((row) => row.email),
  ]);

  const recipients = Array.from(candidates).filter((email) => !unsubscribed.has(email));

  const everyone = new Set([...profiles, ...signups].map((row) => row.email));

  return {
    recipients,
    counts: {
      recipients: recipients.length,
      profiles: new Set(profiles.map((row) => row.email)).size,
      signups: new Set(signups.map((row) => row.email)).size,
      everyone: everyone.size,
      unsubscribed: unsubscribed.size,
      noConsent: everyone.size - recipients.length - unsubscribed.size,
    },
  };
}
