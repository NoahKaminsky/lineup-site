import type { getServiceSupabase } from "@/app/lib/serverSupabase";

type Service = ReturnType<typeof getServiceSupabase>;

// Everyone we may email marketing to: account holders (profiles) and
// waitlist sign-ups (lineup_signups) who said yes to marketing emails and
// haven't unsubscribed. Deduplicated, so someone on both lists gets one copy.
// Consent is required by Canadian anti-spam law (CASL), so people who never
// opted in are counted but not emailed.
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

  const recipients = Array.from(
    new Set(
      [...profiles, ...signups]
        .filter((row) => row.marketing_consent === true && !unsubscribed.has(row.email))
        .map((row) => row.email)
    )
  );

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
