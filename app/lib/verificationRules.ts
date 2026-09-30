// Professional credential verification — shared, client-safe rules and helpers.
//
// WHAT LINEUP REQUIRES IS DEFINED HERE, NOT IN THE DATABASE. Licensing law
// differs by profession and by province/state (and some trades aren't
// licensed at all in some places), so the requirement for a given
// profession + region lives in RULE_OVERRIDES below. Change it here as you
// learn what's actually required where you operate — no migration needed.
//
// This file does not encode any legal requirement as fact. The default is
// deliberately conservative (number + proof for everyone); relax it per region
// once you've confirmed with the relevant regulator or a lawyer.

export type VerificationTrack = "licensed" | "student";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected"
  | "expired";

export type Requirement = "required" | "optional" | "hidden";

export type CredentialRule = {
  licenseNumber: Requirement;
  issuingBody: Requirement;
  expiry: Requirement;
  document: Requirement;
  numberLabel: string;
  documentHelp: string;
};

export const DEFAULT_LICENSED_RULE: CredentialRule = {
  licenseNumber: "required",
  issuingBody: "optional",
  expiry: "optional",
  document: "required",
  numberLabel: "Licence, registration or certificate number",
  documentHelp:
    "A clear photo or PDF of your licence, registration or certificate. You can cover any personal details other than your name and the credential number.",
};

// Keyed by "<region>:<profession>", "<region>:*", or "*:<profession>" — the most
// specific match wins. Region codes are the ones in JURISDICTIONS below
// (e.g. "CA-MB", "US-NY"). Example of relaxing a rule where a trade isn't
// licensed:
//   "CA-MB:lash_artist": { licenseNumber: "optional" },
//
// Manitoba: per the user's own research (not independently confirmed here —
// get this checked against Manitoba's actual designated/compulsory trades
// list, or a lawyer, before launch), every profession on this platform
// requires certification there. That was already true of the conservative
// default above; what's added below is Manitoba-specific wording. Hairstylist
// and Barber use the Certificate of Qualification (Wall Certificate / Red
// Seal) by name, since that's the real document for that Red Seal trade. The
// wildcard below covers every other Manitoba profession with more general
// "certificate or licence" wording rather than implying a Red Seal
// certificate exists for trades that don't have one (nails, lashes, brows,
// makeup, waxing, sugaring) — narrow that wording per trade once confirmed.
export const RULE_OVERRIDES: Record<string, Partial<CredentialRule>> = {
  "CA-MB:*": {
    numberLabel: "Certificate of Qualification or professional certification number",
    documentHelp:
      "A clear photo of the certificate or licence that qualifies you to provide this service in Manitoba.",
  },
  "CA-MB:hairstylist": {
    numberLabel: "Certificate of Qualification number",
    documentHelp:
      "A clear photo of your Manitoba Certificate of Qualification (Wall Certificate or Red Seal Certificate).",
  },
  "CA-MB:barber": {
    numberLabel: "Certificate of Qualification number",
    documentHelp:
      "A clear photo of your Manitoba Certificate of Qualification (Wall Certificate or Red Seal Certificate).",
  },
};

export function getLicensedRule(region: string, profession: string): CredentialRule {
  const override =
    RULE_OVERRIDES[`${region}:${profession}`] ??
    RULE_OVERRIDES[`${region}:*`] ??
    RULE_OVERRIDES[`*:${profession}`] ??
    {};
  return { ...DEFAULT_LICENSED_RULE, ...override };
}

export const STUDENT_DOCUMENT_HELP =
  "Proof you're currently enrolled: an enrollment letter, a student ID showing the current term, or a current class schedule from your school.";

export const VERIFICATION_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
export const VERIFICATION_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const VERIFICATION_BUCKET = "verification-documents";
export const MAX_PENDING_SUBMISSIONS = 3;

const CA_PROVINCES: [string, string][] = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const JURISDICTIONS: { value: string; label: string }[] = [
  ...CA_PROVINCES.map(([code, name]) => ({ value: `CA-${code}`, label: `${name}, Canada` })),
  ...US_STATES.map(([code, name]) => ({ value: `US-${code}`, label: `${name}, USA` })),
  { value: "OTHER", label: "Other" },
];

export function jurisdictionLabel(value: string | null | undefined) {
  return JURISDICTIONS.find((j) => j.value === value)?.label || value || "";
}

// ---- status helpers (pure, safe to use in client components) ----

export type VerificationFields = {
  verification_status?: string | null;
  verified_until?: string | null;
};

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

// A professional counts as verified only while their approval hasn't lapsed —
// this is the single check every gate (Browse, offers, payments) should use.
export function isVerifiedNow(profile: VerificationFields | null | undefined) {
  if (!profile || profile.verification_status !== "verified") return false;
  if (!profile.verified_until) return true;
  return profile.verified_until >= todayDateString();
}
