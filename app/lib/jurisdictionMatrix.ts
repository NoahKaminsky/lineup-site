// Canadian jurisdiction verification matrix — professional credential and
// student-eligibility requirements, per the structure:
//
//   Jurisdiction → Profession → (Account Type → Requirement) + (Service → Eligibility)
//
// THIS FILE IS THE SOURCE OF TRUTH FOR LEGAL REQUIREMENTS, and it is a DRAFT.
// Every cell below defaults to UNCONFIRMED / MANUAL_REVIEW_REQUIRED until a
// human has checked it against the cited primary source and updated the cell.
// Do not treat an "unconfirmed" cell as "not regulated" — it means nobody has
// checked yet. See app/lib/verificationRules.ts for the status enum and the
// runtime helpers that read this matrix; this file holds only data.
//
// NOT WIRED IN YET. This is the new, richer replacement for the simpler
// RULE_OVERRIDES map in verificationRules.ts. It is intentionally not used by
// any gating code yet — it's built ahead of the research so the matrix can be
// populated and reviewed on its own, per the explicit request to validate the
// matrix before it drives any verification rule. Once reviewed, the pieces
// that read RULE_OVERRIDES (getLicensedRule, the /verification form, the
// admin review queue) get one pass to read this instead.
//
// Professions use LineUp's existing professional_type values (what's stored
// in profiles.professional_types and shown throughout the app), not generic
// legal category names — a province's regulation of "Esthetician" is mapped
// onto whichever of LineUp's categories it actually covers (see the
// PROFESSION_LEGAL_NOTES per jurisdiction for how that mapping was made,
// since it's a judgment call in provinces that regulate "esthetics" as one
// umbrella rather than by individual service).

export type ProfessionKey =
  | "barber"
  | "hairstylist"
  | "nail_artist"
  | "lash_artist"
  | "brow_artist"
  | "makeup_artist"
  | "wax_technician"
  | "body_sugaring"
  | "other_beauty_professional";

export const PROFESSION_KEYS: ProfessionKey[] = [
  "barber",
  "hairstylist",
  "nail_artist",
  "lash_artist",
  "brow_artist",
  "makeup_artist",
  "wax_technician",
  "body_sugaring",
  "other_beauty_professional",
];

// The handful of higher-scrutiny procedures called out by name in the spec —
// these can carry stricter (or entirely separate) requirements than the
// profession's general credential, in provinces that regulate them
// specifically (e.g. laser/IPL often needs a distinct authorization from
// general esthetics). Keyed loosely — match against a service's name/tags at
// the call site, not intended as an exhaustive service taxonomy.
export type HighScrutinyService =
  | "laser_ipl"
  | "microneedling"
  | "chemical_peel"
  | "permanent_makeup";

export const HIGH_SCRUTINY_SERVICES: HighScrutinyService[] = [
  "laser_ipl",
  "microneedling",
  "chemical_peel",
  "permanent_makeup",
];

export type ServiceEligibility =
  | "eligible"
  | "eligible_with_conditions"
  | "supervision_required"
  | "not_eligible"
  | "manual_review_required";

export type Confidence = "high" | "medium" | "low" | "unconfirmed";

export type SourceRef = {
  url: string;
  title: string;
  dateChecked: string; // ISO date the source was actually read
};

// What a Verified Professional needs to submit/show for this profession in
// this jurisdiction.
export type ProfessionalRequirement = {
  regulated: boolean;
  compulsory: boolean; // false = voluntary certification / no legal requirement
  credentialName: string | null; // exact official name, e.g. "Certificate of Qualification"
  redSealApplies: boolean;
  issuingAuthority: string | null;
  issuingAuthorityUrl: string | null;
  registryExists: boolean;
  registryName: string | null;
  registryUrl: string | null;
  // Whether LineUp can programmatically or manually check the credential
  // number against the registry above, vs. only against the uploaded document.
  registryVerifiable: boolean;
  diplomaSufficientAlone: boolean; // school diploma alone, no separate provincial credential
  apprenticeAllowed: boolean;
  apprenticeProofDocument: string | null;
  notes: string;
};

// What a Student account can do for this profession in this jurisdiction —
// separate from whether they're approved to have a profile at all (they
// always can be, per the spec; this governs whether/how they can be booked).
export type StudentEligibility = {
  canPerformCommercially: boolean;
  conditions: string; // supervision, setting restrictions, etc. — free text since these vary a lot
  defaultServiceEligibility: ServiceEligibility;
};

export type ServiceOverride = {
  service: HighScrutinyService;
  professionalEligibility: ServiceEligibility;
  studentEligibility: ServiceEligibility;
  notes: string;
};

export type JurisdictionProfessionRule = {
  professional: ProfessionalRequirement;
  student: StudentEligibility;
  serviceOverrides: ServiceOverride[];
  sources: SourceRef[];
  confidence: Confidence;
  lastReviewedBy: string | null; // set once a human (ideally counsel) has signed off, not just an agent pass
};

function unconfirmedRule(): JurisdictionProfessionRule {
  return {
    professional: {
      regulated: false,
      compulsory: false,
      credentialName: null,
      redSealApplies: false,
      issuingAuthority: null,
      issuingAuthorityUrl: null,
      registryExists: false,
      registryName: null,
      registryUrl: null,
      registryVerifiable: false,
      diplomaSufficientAlone: false,
      apprenticeAllowed: false,
      apprenticeProofDocument: null,
      notes: "UNCONFIRMED — not yet researched. Treat as requiring manual review, not as unregulated.",
    },
    student: {
      canPerformCommercially: false,
      conditions: "UNCONFIRMED — not yet researched.",
      defaultServiceEligibility: "manual_review_required",
    },
    serviceOverrides: [],
    sources: [],
    confidence: "unconfirmed",
    lastReviewedBy: null,
  };
}

const CANADIAN_JURISDICTIONS = [
  "CA-AB", "CA-BC", "CA-MB", "CA-NB", "CA-NL", "CA-NS", "CA-NT",
  "CA-NU", "CA-ON", "CA-PE", "CA-QC", "CA-SK", "CA-YT",
] as const;

export type CanadianJurisdiction = (typeof CANADIAN_JURISDICTIONS)[number];

// Every jurisdiction × profession cell, defaulted to unconfirmed. Populate
// specific cells as research is validated — see fillRule() below for the
// pattern, and docs/verification-matrix-research.md (once generated) for the
// raw findings this should be filled in from.
function buildDefaultMatrix(): Record<CanadianJurisdiction, Record<ProfessionKey, JurisdictionProfessionRule>> {
  const matrix = {} as Record<CanadianJurisdiction, Record<ProfessionKey, JurisdictionProfessionRule>>;
  for (const jurisdiction of CANADIAN_JURISDICTIONS) {
    matrix[jurisdiction] = {} as Record<ProfessionKey, JurisdictionProfessionRule>;
    for (const profession of PROFESSION_KEYS) {
      matrix[jurisdiction][profession] = unconfirmedRule();
    }
  }
  return matrix;
}

export const JURISDICTION_MATRIX = buildDefaultMatrix();

// Deep-merges a partial rule into one matrix cell — used to populate cells
// from research without having to restate the whole unconfirmedRule() shape
// each time.
export function fillRule(
  jurisdiction: CanadianJurisdiction,
  profession: ProfessionKey,
  patch: {
    professional?: Partial<ProfessionalRequirement>;
    student?: Partial<StudentEligibility>;
    serviceOverrides?: ServiceOverride[];
    sources?: SourceRef[];
    confidence?: Confidence;
    lastReviewedBy?: string | null;
  }
) {
  const current = JURISDICTION_MATRIX[jurisdiction][profession];
  JURISDICTION_MATRIX[jurisdiction][profession] = {
    professional: { ...current.professional, ...patch.professional },
    student: { ...current.student, ...patch.student },
    serviceOverrides: patch.serviceOverrides ?? current.serviceOverrides,
    sources: patch.sources ?? current.sources,
    confidence: patch.confidence ?? current.confidence,
    lastReviewedBy: patch.lastReviewedBy ?? current.lastReviewedBy,
  };
}

export function getJurisdictionRule(
  jurisdiction: string,
  profession: ProfessionKey
): JurisdictionProfessionRule | null {
  if (!CANADIAN_JURISDICTIONS.includes(jurisdiction as CanadianJurisdiction)) return null;
  return JURISDICTION_MATRIX[jurisdiction as CanadianJurisdiction][profession];
}

// Applies the same patch to several professions in one jurisdiction — most
// jurisdictions share one rule across nails/lashes/brows/makeup/waxing/
// sugaring ("all unregulated", or "all part of one esthetics credential"),
// so this avoids repeating that object nine times per jurisdiction.
function fillMany(
  jurisdiction: CanadianJurisdiction,
  professions: ProfessionKey[],
  patch: Parameters<typeof fillRule>[2]
) {
  for (const profession of professions) fillRule(jurisdiction, profession, patch);
}

// ---- Research fill-in area ----
// Populated from a 4-way research pass (2026-09-30) across official
// government/regulator sources, done specifically for this matrix — not
// general web knowledge. Each cell's `sources` array is what that research
// actually cited; `confidence` reflects how directly a primary source was
// read vs. inferred. This is a validated DRAFT, not legal advice — the
// Quebec/high-scrutiny-service findings in particular flag genuinely
// unsettled law that needs its own legal review before being relied on.

function src(url: string, title: string): SourceRef {
  return { url, title, dateChecked: "2026-09-30" };
}

const ALL_NON_HAIR: ProfessionKey[] = [
  "nail_artist",
  "lash_artist",
  "brow_artist",
  "makeup_artist",
  "wax_technician",
  "body_sugaring",
  "other_beauty_professional",
];

// ===== Alberta — compulsory Hairstylist/Barber; nothing else regulated =====
fillRule("CA-AB", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Journeyperson Certificate (Hairstylist)",
    redSealApplies: true,
    issuingAuthority: "Skilled Trades Alberta",
    issuingAuthorityUrl: "https://tradesecrets.alberta.ca/",
    registryExists: true,
    registryName: "Tradesperson Lookup Tool",
    registryUrl: "https://tradesecrets.alberta.ca/trades-in-alberta/check-credentials/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Apprentice registration / AIT ID card issued by Skilled Trades Alberta",
    notes: "Compulsory certification trade — must be a certified journeyperson or registered apprentice to work for pay.",
  },
  student: {
    canPerformCommercially: false,
    conditions: "No distinct legal student category found — must register as an apprentice to legally work for pay, even while in a private diploma program.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: [
    src("https://tradesecrets.alberta.ca/trades-in-alberta/profiles/0424/", "Alberta Hairstylist trade profile"),
    src("https://tradesecrets.alberta.ca/trades-in-alberta/check-credentials/", "Tradesperson Lookup Tool"),
  ],
});
fillRule("CA-AB", "barber", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Achievement / Journeyperson Certificate (Barber)",
    redSealApplies: false,
    issuingAuthority: "Skilled Trades Alberta",
    issuingAuthorityUrl: "https://tradesecrets.alberta.ca/",
    registryExists: true,
    registryName: "Tradesperson Lookup Tool",
    registryUrl: "https://tradesecrets.alberta.ca/trades-in-alberta/check-credentials/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Apprentice registration via Skilled Trades Alberta",
    notes: "Compulsory, separate trade from Hairstylist; no Red Seal endorsement for Barber in Alberta.",
  },
  student: {
    canPerformCommercially: false,
    conditions: "Same as Hairstylist — must register as an apprentice to legally work for pay.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: [src("https://tradesecrets.alberta.ca/trades-in-alberta/profiles/0425/", "Alberta Barber trade profile")],
});
fillMany("CA-AB", ALL_NON_HAIR, {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "Not a designated trade in Alberta (compulsory or optional) — no provincial credential exists. LineUp may still request training evidence as its own verification standard, but must not claim a government licence is required.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No legal restriction found — the profession itself isn't regulated.",
    defaultServiceEligibility: "eligible",
  },
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "No dedicated Alberta statute found for laser/IPL specifically; informal 'under medical direction' convention only — unconfirmed.",
    },
  ],
  confidence: "high",
  sources: [
    src("https://tradesecrets.alberta.ca/trades-in-alberta/compulsory-certification-trades", "Alberta compulsory-certification trades list"),
    src("https://tradesecrets.alberta.ca/trades-in-alberta/optional-certification-trades/", "Alberta optional-certification trades list"),
  ],
});

// ===== British Columbia — Hairstylist voluntary; everything else unregulated since 2003 =====
fillRule("CA-BC", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Certificate of Qualification (Hairstylist)",
    redSealApplies: true,
    issuingAuthority: "SkilledTradesBC",
    issuingAuthorityUrl: "https://skilledtradesbc.ca/",
    registryExists: true,
    registryName: "Verify a Tradesperson's Certification",
    registryUrl: "https://skilledtradesbc.ca/forms-registration/verify-tradespersons-certification",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "SkilledTradesBC apprentice registration record",
    notes: "Voluntary — a person may legally cut/style hair for pay in BC with no certification at all. Certification is a recognized credential, not a legal requirement to practice.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Since certification itself isn't compulsory, no specific legal restriction on students/trainees performing paid hairstyling work was found.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [
    src("https://skilledtradesbc.ca/skilledtradescertification", "SkilledTradesBC certification"),
    src("https://www.jobbank.gc.ca/marketreport/requirements/16452/BC", "Job Bank BC Hairstylist requirements"),
  ],
});
fillRule("CA-BC", "barber", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Authorized via a Red Seal-qualified Hairstylist credential — no standalone Barber certificate confirmed",
    redSealApplies: true,
    issuingAuthority: "SkilledTradesBC",
    issuingAuthorityUrl: "https://skilledtradesbc.ca/",
    registryExists: true,
    registryName: "Verify a Tradesperson's Certification",
    registryUrl: "https://skilledtradesbc.ca/forms-registration/verify-tradespersons-certification",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "SkilledTradesBC apprentice registration record",
    notes: "No BC primary source confirms Barber as a standalone trade distinct from Hairstylist.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Same as Hairstylist.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "medium",
  sources: [src("https://www.jobbank.gc.ca/marketreport/requirements/16446/BC", "Job Bank BC Barber requirements")],
});
fillMany("CA-BC", ALL_NON_HAIR, {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "BC's Cosmetologists Act was repealed at the end of 2003 — no individual practitioner licence exists for esthetics, nails, makeup, lash or brow services. Only the premises is regulated, as a 'Personal Service Establishment' under the Public Health Act (sanitation/infection control), enforced by regional health authorities.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No individual licensing regime exists, so no legal restriction is tied to training status.",
    defaultServiceEligibility: "eligible",
  },
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "eligible_with_conditions",
      notes: "Facilities offering laser/IPL hair removal must appoint a 'laser safety officer' under BC public-health guidance — a facility, not individual-practitioner, requirement.",
    },
  ],
  confidence: "high",
  sources: [
    src("https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96178rep_01", "Cosmetologists Act repeal"),
    src("https://www.bclaws.gov.bc.ca/civix/document/id/loo71/loo71/18_202_83", "Regulated Activities Regulation, B.C. Reg. 161/2011"),
  ],
});

// ===== Manitoba — compulsory Hairstylist; compulsory 2-part Esthetician (Nail Technician + Skin Care Technician, independently certifiable) =====
const MB_HAIR_NOTES =
  "Compulsory trade. Barbering tasks (cutting/shaving/trimming, shaping facial hair) are folded into this same trade — there is no separate Barber credential in Manitoba.";
const MB_HAIR_RULE: Partial<ProfessionalRequirement> = {
  regulated: true,
  compulsory: true,
  credentialName: "Certificate of Qualification (Hairstylist)",
  redSealApplies: true,
  issuingAuthority: "Apprenticeship Manitoba",
  issuingAuthorityUrl: "https://www.gov.mb.ca/apprenticeship/",
  registryExists: true,
  registryName: "Written verification request ('Disclosure of Client Credentials' form) — no self-serve online registry",
  registryUrl: null,
  registryVerifiable: true,
  diplomaSufficientAlone: false,
  apprenticeAllowed: true,
  apprenticeProofDocument: "Apprenticeship agreement / pocket card; Verification of Enrolment for Technical Training",
  notes: MB_HAIR_NOTES,
};
const MB_HAIR_SOURCES = [
  src("https://www.gov.mb.ca/apprenticeship/explore-trades/trade-profiles/hairstylist.html", "Manitoba Hairstylist trade profile"),
  src("https://web2.gov.mb.ca/laws/regs/archived/251-2014(2024-10-03).php", "Trade of Hairstylist Regulation, M.R. 251/2014"),
];
fillRule("CA-MB", "hairstylist", {
  professional: MB_HAIR_RULE,
  student: {
    canPerformCommercially: false,
    conditions: "Apprenticeship and Certification Act s.26(1): a student may perform the trade only where 'necessarily incidental' to obtaining academic credit — not general commercial work.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: MB_HAIR_SOURCES,
});
fillRule("CA-MB", "barber", {
  professional: { ...MB_HAIR_RULE, notes: "No separate Barber trade in Manitoba — barbering falls under the compulsory Hairstylist trade above." },
  student: {
    canPerformCommercially: false,
    conditions: "Same statutory exemption as Hairstylist (s.26(1)).",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: MB_HAIR_SOURCES,
});
const MB_ESTHETICS_SOURCES = [
  src("https://www.gov.mb.ca/apprenticeship/explore-trades/trade-profiles/esthetician.html", "Manitoba Esthetician trade profile"),
  src("https://web2.gov.mb.ca/laws/regs/current/146-2014.php", "Trade of Esthetician Regulation, M.R. 146/2014"),
];
const MB_ESTHETICS_STUDENT = {
  canPerformCommercially: false,
  conditions: "Same s.26(1) exemption as Hairstylist — commercial work only where necessarily incidental to academic credit.",
  defaultServiceEligibility: "supervision_required" as ServiceEligibility,
};
fillRule("CA-MB", "nail_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification — Nail Technician (Esthetician sub-trade)",
    redSealApplies: false,
    issuingAuthority: "Apprenticeship Manitoba",
    issuingAuthorityUrl: "https://www.gov.mb.ca/apprenticeship/",
    registryExists: true,
    registryName: "Written verification request — no self-serve online registry",
    registryUrl: null,
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Apprenticeship agreement; ~1,000 hrs on-the-job + 400 hrs technical training minimum",
    notes: "Manitoba's 'Esthetician' is a composite trade of two independently certifiable sub-trades — Nail Technician and Skin Care Technician. A person can hold this sub-trade certificate alone.",
  },
  student: MB_ESTHETICS_STUDENT,
  confidence: "high",
  sources: MB_ESTHETICS_SOURCES,
});
fillMany("CA-MB", ["wax_technician", "body_sugaring", "lash_artist", "brow_artist"], {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification — Skin Care Technician (Esthetician sub-trade)",
    redSealApplies: false,
    issuingAuthority: "Apprenticeship Manitoba",
    issuingAuthorityUrl: "https://www.gov.mb.ca/apprenticeship/",
    registryExists: true,
    registryName: "Written verification request — no self-serve online registry",
    registryUrl: null,
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Minimum 800 hrs approved/accredited training program",
    notes:
      "Regulation explicitly lists: body/skin treatments, advanced facials, hair removal, eyelash/eyebrow tinting, lifts, perms, lamination, eyelash/eyebrow extensions, and basic makeup. Brow shaping/waxing may also overlap with the Hairstylist trade's ancillary 'hair removal above the neck' allowance — this overlap is not explicitly resolved in the regulations.",
  },
  student: MB_ESTHETICS_STUDENT,
  confidence: "medium",
  sources: MB_ESTHETICS_SOURCES,
});
fillRule("CA-MB", "makeup_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification — Skin Care Technician (Esthetician sub-trade)",
    redSealApplies: false,
    issuingAuthority: "Apprenticeship Manitoba",
    issuingAuthorityUrl: "https://www.gov.mb.ca/apprenticeship/",
    registryExists: true,
    registryName: "Written verification request — no self-serve online registry",
    registryUrl: null,
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Minimum 800 hrs approved/accredited training program",
    notes: "'Basic makeup' is explicitly named within this sub-trade's scope; unclear how 'basic' is delineated from advanced/special-occasion makeup artistry.",
  },
  student: MB_ESTHETICS_STUDENT,
  serviceOverrides: [
    {
      service: "permanent_makeup",
      professionalEligibility: "manual_review_required",
      studentEligibility: "not_eligible",
      notes: "Not addressed anywhere in the Esthetician trade regulation — unconfirmed whether PMU requires this credential or falls under a different/no regime.",
    },
  ],
  confidence: "medium",
  sources: MB_ESTHETICS_SOURCES,
});
fillRule("CA-MB", "other_beauty_professional", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification — Esthetician (full: both Nail Technician + Skin Care Technician sub-trades)",
    redSealApplies: false,
    issuingAuthority: "Apprenticeship Manitoba",
    issuingAuthorityUrl: "https://www.gov.mb.ca/apprenticeship/",
    registryExists: true,
    registryName: "Written verification request — no self-serve online registry",
    registryUrl: null,
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Combined hours of both sub-trades",
    notes: "Full composite Esthetician designation covering both sub-trades.",
  },
  student: MB_ESTHETICS_STUDENT,
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not mentioned in the Esthetician trade regulation; may fall under Manitoba Health's Personal Service Facility Guidelines (facility hygiene, not a practitioner licence) — unconfirmed.",
    },
    {
      service: "microneedling",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not mentioned in the Esthetician trade regulation — unconfirmed.",
    },
    {
      service: "chemical_peel",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not mentioned in the Esthetician trade regulation — unconfirmed.",
    },
  ],
  confidence: "high",
  sources: MB_ESTHETICS_SOURCES,
});

// ===== Ontario — compulsory Hairstylist/Barber (same trade); nothing else regulated =====
fillRule("CA-ON", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification (C of Q) or Provisional C of Q",
    redSealApplies: true,
    issuingAuthority: "Skilled Trades Ontario",
    issuingAuthorityUrl: "https://www.skilledtradesontario.ca/",
    registryExists: true,
    registryName: "Skilled Trades Ontario Public Register",
    registryUrl: "https://www.skilledtradesontario.ca/public-register/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Registered Training Agreement (RTA)",
    notes:
      "Compulsory trade under BOSTA (2021)/O. Reg. 876/21. Barbering is included in this trade's scope — no separate Barber credential. Although Hairstylist carries the Red Seal trade title nationally, Ontario does not issue the Red Seal endorsement itself — an Ontario C of Q is provincial-only.",
  },
  student: {
    canPerformCommercially: false,
    conditions: "OYAP/pre-apprenticeship program students may perform compulsory-trade work only at their specific placement site, during the dates/hours on their Work Education Agreement — not general independent commercial work.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: [
    src("https://www.skilledtradesontario.ca/trade-information/hairstylist/", "Skilled Trades Ontario — Hairstylist"),
    src("https://www.ontario.ca/page/compulsory-trades-and-enforcement", "Ontario compulsory trades and enforcement"),
  ],
});
fillRule("CA-ON", "barber", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Qualification (Hairstylist) — no separate Barber trade in Ontario",
    redSealApplies: true,
    issuingAuthority: "Skilled Trades Ontario",
    issuingAuthorityUrl: "https://www.skilledtradesontario.ca/",
    registryExists: true,
    registryName: "Skilled Trades Ontario Public Register",
    registryUrl: "https://www.skilledtradesontario.ca/public-register/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Registered Training Agreement (RTA)",
    notes: "Barbering is included within the compulsory Hairstylist trade's scope; no dedicated Skilled Trades Ontario Barber trade page exists.",
  },
  student: {
    canPerformCommercially: false,
    conditions: "Same as Hairstylist.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: [src("https://www.skilledtradesontario.ca/trade-information/hairstylist/", "Skilled Trades Ontario — Hairstylist")],
});
fillMany("CA-ON", ALL_NON_HAIR, {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "Not one of Ontario's 144 BOSTA-prescribed trades (compulsory or voluntary) — no provincial credential of any kind exists. A separate facility-level regime, O. Reg. 136/18 (Personal Service Settings, under the Health Protection and Promotion Act), subjects certain 'invasive procedures' (micropigmentation/microblading, microneedling, electrolysis, laser hair removal) to municipal public-health infection-control inspection — this is hygiene regulation of the premises, not a practitioner qualification. LineUp should not claim a government licence is required for this profession in Ontario.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No occupational licensing regime exists, so no legal restriction is tied to training status.",
    defaultServiceEligibility: "eligible",
  },
  serviceOverrides: [
    {
      service: "permanent_makeup",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "eligible_with_conditions",
      notes: "Likely captured under O. Reg. 136/18's facility infection-control inspection stream (premises-level, not a personal qualification) — exact classification unconfirmed.",
    },
    {
      service: "microneedling",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "eligible_with_conditions",
      notes: "Likely captured under O. Reg. 136/18's facility infection-control inspection stream — exact classification unconfirmed.",
    },
    {
      service: "laser_ipl",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "eligible_with_conditions",
      notes: "Likely captured under O. Reg. 136/18's facility infection-control inspection stream — exact classification unconfirmed.",
    },
  ],
  confidence: "high",
  sources: [
    src(
      "https://www.settlement.org/ontario/employment/find-a-job/work-in-regulated-and-unregulated-occupations/which-trades-are-unregulated-or-have-voluntary-certification-in-ontario/",
      "Ontario unregulated/voluntary trades listing"
    ),
    src("https://www.skilledtradesontario.ca/about-trades/trades-information/", "Skilled Trades Ontario trade list (search)"),
  ],
});

// ===== Saskatchewan — everything voluntary; nothing compulsory =====
fillRule("CA-SK", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Journeyperson Certificate of Qualification (Hairstylist)",
    redSealApplies: true,
    issuingAuthority: "Saskatchewan Apprenticeship and Trade Certification Commission (SATCC)",
    issuingAuthorityUrl: "https://saskapprenticeship.ca/",
    registryExists: true,
    registryName: "SATCC credential check",
    registryUrl: "https://saskapprenticeship.ca/check-credentials/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "SATCC apprenticeship registration",
    notes: "Voluntary — SATCC's own designated-trades list explicitly marks it voluntary, contradicting some generic aggregator sources that claim compulsory status.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No statutory restriction found, since the trade is voluntary.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "medium",
  sources: [src("https://saskapprenticeship.ca/designated_trades/hairstylist/", "SATCC Hairstylist trade profile")],
});
fillRule("CA-SK", "barber", {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "No Saskatchewan Barbers Act could be located. Absence of evidence is not proof of no regulation — recommend direct confirmation with SATCC before relying on this.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed — no source found either way.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "unconfirmed",
  sources: [],
});
fillRule("CA-SK", "nail_artist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Journeyperson Certificate — Esthetician-Nail Technician",
    redSealApplies: false,
    issuingAuthority: "SATCC",
    issuingAuthorityUrl: "https://saskapprenticeship.ca/",
    registryExists: true,
    registryName: "SATCC credential check",
    registryUrl: "https://saskapprenticeship.ca/check-credentials/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "SATCC apprenticeship registration",
    notes: "Voluntary designated trade covering manicures, pedicures, cosmetic limb massage, artificial nail applications/enhancements.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No statutory restriction found, since the trade is voluntary.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "medium",
  sources: [src("https://saskapprenticeship.ca/designated_trades/esthetician-nail-technician/", "SATCC Esthetician-Nail Technician trade profile")],
});
fillMany("CA-SK", ["wax_technician", "body_sugaring", "lash_artist", "brow_artist", "makeup_artist", "other_beauty_professional"], {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Journeyperson Certificate — Esthetician-Skin Care Technician",
    redSealApplies: false,
    issuingAuthority: "SATCC",
    issuingAuthorityUrl: "https://saskapprenticeship.ca/",
    registryExists: true,
    registryName: "SATCC credential check",
    registryUrl: "https://saskapprenticeship.ca/check-credentials/",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "SATCC apprenticeship registration",
    notes:
      "Voluntary designated trade; its own trade profile explicitly names facial/body treatments, hair removal (incl. laser/electric-current skin correction), lash/brow tinting and extensions, and basic makeup within scope.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No statutory restriction found, since the trade is voluntary.",
    defaultServiceEligibility: "eligible",
  },
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "eligible_with_conditions",
      notes: "'Correcting skin problems using electric current or laser technology' is explicitly named within this voluntary trade's own scope statement.",
    },
    {
      service: "microneedling",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not explicitly enumerated in the trade profile — unconfirmed.",
    },
    {
      service: "chemical_peel",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not explicitly enumerated in the trade profile — unconfirmed.",
    },
    {
      service: "permanent_makeup",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Not explicitly enumerated in the trade profile — unconfirmed.",
    },
  ],
  confidence: "medium",
  sources: [src("https://saskatchewan.ca/government/news-and-media/2009/february/18/two-esthetician-trades-designated", "Two esthetician trades designated — Government of Saskatchewan")],
});

// ===== New Brunswick — compulsory across the board via CANB (and a separate compulsory Barber licence) =====
const NB_STUDENT = {
  canPerformCommercially: true,
  conditions: "Act s.7(2): a person enrolled and duly registered as a student at an approved cosmetology school may perform the tasks/duties/functions that are part of their course of study, subject to by-law conditions.",
  defaultServiceEligibility: "eligible_with_conditions" as ServiceEligibility,
};
fillRule("CA-NB", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Hairstylist licence (CANB)",
    redSealApplies: true,
    issuingAuthority: "Cosmetology Association of New Brunswick (CANB)",
    issuingAuthorityUrl: "https://canb.ca/",
    registryExists: true,
    registryName: "CANB member database",
    registryUrl: "https://canb.ca/en/database-access",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes:
      "Designated Red Seal occupation, but no formal employer-indentured apprenticeship route — a CANB Hairstylist licence-holder may directly challenge the Red Seal exam. A narrower 'Technical Cutting Stylist' licence also exists (cutting/styling only, explicitly excluding chemical services like colour/perms/straightening) — worth distinguishing as a lower service tier.",
  },
  student: NB_STUDENT,
  confidence: "high",
  sources: [src("https://www2.gnb.ca/content/dam/gnb/Departments/ag-pg/PDF/ActsLois/2014/Chap-10.pdf", "An Act to Amend An Act to Incorporate the Cosmetology Association of New Brunswick, 2014, c.10")],
});
fillRule("CA-NB", "barber", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "NB Barber's Licence",
    redSealApplies: false,
    issuingAuthority: "New Brunswick Registered Barbers' Association (NBRBA)",
    issuingAuthorityUrl: "https://www.nbrba.com/",
    registryExists: false,
    registryName: null,
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes:
      "Regulated separately from CANB under its own statute. CANB Hairstylist/Technical Cutting Stylist licensees are explicitly exempted from needing a separate NBRBA licence while practising cosmetology (2014 amendment s.8.2). The underlying NBRBA Act text could not be retrieved — apprentice/registry specifics are unconfirmed.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed — underlying statute not retrieved.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "medium",
  sources: [src("https://www.nbrba.com/licensingauthorities.htm", "NBRBA licensing authorities")],
});
fillRule("CA-NB", "nail_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Nail Technician licence (CANB)",
    redSealApplies: false,
    issuingAuthority: "CANB",
    issuingAuthorityUrl: "https://canb.ca/",
    registryExists: true,
    registryName: "CANB member database",
    registryUrl: "https://canb.ca/en/database-access",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes: "Own distinct CANB licence category (unlike Manitoba/Saskatchewan, where nails are a sub-trade of Esthetician).",
  },
  student: NB_STUDENT,
  confidence: "high",
  sources: [src("https://www2.gnb.ca/content/dam/gnb/Departments/ag-pg/PDF/ActsLois/2014/Chap-10.pdf", "2014 c.10 amendment, s.2 & s.6(e)")],
});
fillRule("CA-NB", "makeup_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Make-up Artist licence (CANB)",
    redSealApplies: false,
    issuingAuthority: "CANB",
    issuingAuthorityUrl: "https://canb.ca/",
    registryExists: true,
    registryName: "CANB member database",
    registryUrl: "https://canb.ca/en/database-access",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes: "Own distinct CANB licence category.",
  },
  student: NB_STUDENT,
  serviceOverrides: [
    {
      service: "permanent_makeup",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "No explicit permanent-makeup exclusion found in this category's own definition — unconfirmed whether the Aesthetician category's laser/needle exclusion applies analogously here.",
    },
  ],
  confidence: "high",
  sources: [src("https://www2.gnb.ca/content/dam/gnb/Departments/ag-pg/PDF/ActsLois/2014/Chap-10.pdf", "2014 c.10 amendment, s.2 & s.6(d)")],
});
fillMany("CA-NB", ["lash_artist", "brow_artist"], {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Aesthetician licence (CANB), with a specific eyelash/eyebrow enhancement authorization",
    redSealApplies: false,
    issuingAuthority: "CANB",
    issuingAuthorityUrl: "https://canb.ca/",
    registryExists: true,
    registryName: "CANB member database",
    registryUrl: "https://canb.ca/en/database-access",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes: "Per CANB's own FAQ, aestheticians offering eyelash/eyebrow enhancement services must separately apply for that authorization within the Aesthetician licence.",
  },
  student: NB_STUDENT,
  confidence: "medium",
  sources: [src("https://canb.ca/en/member-benefits/frequently-asked-questions-for-members", "CANB member FAQ")],
});
fillMany("CA-NB", ["wax_technician", "body_sugaring", "other_beauty_professional"], {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Aesthetician licence (CANB)",
    redSealApplies: false,
    issuingAuthority: "CANB",
    issuingAuthorityUrl: "https://canb.ca/",
    registryExists: true,
    registryName: "CANB member database",
    registryUrl: "https://canb.ca/en/database-access",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes: "The statute explicitly EXCLUDES 'the use of laser and needles' from the licensed Aesthetician scope — a hard carve-out, not an inference.",
  },
  student: NB_STUDENT,
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "not_eligible",
      studentEligibility: "not_eligible",
      notes: "Explicitly excluded from the CANB Aesthetician licensed scope by statute. No other New Brunswick regulator was identified for this service — a genuine compliance gap, not a permission.",
    },
  ],
  confidence: "high",
  sources: [src("https://www2.gnb.ca/content/dam/gnb/Departments/ag-pg/PDF/ActsLois/2014/Chap-10.pdf", "2014 c.10 amendment, definitions section")],
});

// ===== Nova Scotia — compulsory Cosmetology Act (hair/esthetics both), separate compulsory Barber Act, permanent makeup carved out to Safe Body Art Act =====
const NS_COSMETOLOGY_SOURCES = [src("https://nslegislature.ca/sites/default/files/legc/statutes/cosmetology.pdf", "Cosmetology Act, Chapter 39 of the Acts of 2012")];
const NS_STUDENT = {
  canPerformCommercially: true,
  conditions: "Cosmetology Act s.26: every student must hold a Student Permit issued by CANS (applied for within 30 days of starting), and must display it visibly at the worksite. Students may legally perform services under this permit.",
  defaultServiceEligibility: "eligible_with_conditions" as ServiceEligibility,
};
fillRule("CA-NS", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Cosmetologist (Hairdressing) licence, or Master Cosmetologist (Hairdressing)",
    redSealApplies: true,
    issuingAuthority: "Cosmetology Association of Nova Scotia (CANS)",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Apprenticeship Agency registration (a separate, optional Red Seal track) or CANS work-experience-in-lieu-of-hours (Act s.24(2)(b))",
    notes:
      "Compulsory under the Cosmetology Act (s.3(2)). A second, entirely separate and voluntary Red Seal apprenticeship pathway also exists via the NS Apprenticeship Agency — Esthetics has no equivalent second pathway (see notes on Esthetician below).",
  },
  student: NS_STUDENT,
  confidence: "high",
  sources: NS_COSMETOLOGY_SOURCES,
});
fillRule("CA-NS", "barber", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Certificate of Registration (Registered Barber)",
    redSealApplies: false,
    issuingAuthority: "Nova Scotia Registered Barbers Association (NSRBA)",
    issuingAuthorityUrl: "https://nsbarbers.ca/",
    registryExists: true,
    registryName: "Statutory register (no confirmed public online search tool)",
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "NSRBA Certificate of Registration as Registered Apprentice; must work under immediate supervision of a registered barber",
    notes: "Regulated under its own statute (Registered Barbers Act), explicitly excluded from the Cosmetology Act. No automatic cross-recognition between a CANS hairdressing licence and NSRBA registration.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed in detail — apprentices work under immediate supervision.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "medium",
  sources: [src("https://nslegislature.ca/sites/default/files/legc/statutes/registered%20barbers.pdf", "Registered Barbers Act, R.S.N.S. 1989, c.390")],
});
fillRule("CA-NS", "nail_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Esthetics licence, or a nail-care-specific licence (CANS)",
    redSealApplies: false,
    issuingAuthority: "CANS",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Same Cosmetology Act framework as Hairdressing",
    notes: "Act s.25(1)(d) allows a narrower 'specific licence' limited to nail care, in addition to the full Esthetics licence.",
  },
  student: NS_STUDENT,
  confidence: "medium",
  sources: NS_COSMETOLOGY_SOURCES,
});
fillMany("CA-NS", ["wax_technician", "body_sugaring", "lash_artist"], {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Esthetics licence, or a specific licence (CANS)",
    redSealApplies: false,
    issuingAuthority: "CANS",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Same Cosmetology Act framework as Hairdressing",
    notes: "Hair removal (waxing/sugaring/etc.) and eyelash affixing/extensions are both explicitly named in the Act's cosmetology definition.",
  },
  student: NS_STUDENT,
  confidence: "high",
  sources: NS_COSMETOLOGY_SOURCES,
});
fillRule("CA-NS", "brow_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Esthetics licence, or a specific licence (CANS)",
    redSealApplies: false,
    issuingAuthority: "CANS",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Same Cosmetology Act framework as Hairdressing",
    notes: "Brow shaping/waxing confirmed under the Act's 'removal of hair' language; brow tinting specifically is not directly confirmed against the regulation text.",
  },
  student: NS_STUDENT,
  confidence: "medium",
  sources: NS_COSMETOLOGY_SOURCES,
});
fillRule("CA-NS", "makeup_artist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Esthetics licence, or a specific licence (CANS) — non-permanent makeup only",
    redSealApplies: false,
    issuingAuthority: "CANS",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Same Cosmetology Act framework as Hairdressing",
    notes: "Non-permanent makeup is explicitly in the Act's cosmetology definition. Permanent makeup/micropigmentation is explicitly EXCLUDED and instead regulated as tattooing under the Safe Body Art Act — a facility-permit regime via NS Environment, not a CANS practice licence.",
  },
  student: NS_STUDENT,
  serviceOverrides: [
    {
      service: "permanent_makeup",
      professionalEligibility: "eligible_with_conditions",
      studentEligibility: "manual_review_required",
      notes: "Governed by the Safe Body Art Act / NS Environment (facility permit), not CANS — a materially different compliance path from the rest of this profession's services.",
    },
  ],
  confidence: "high",
  sources: [...NS_COSMETOLOGY_SOURCES, src("https://novascotia.ca/just/regulations/regs/sbasafe.htm", "Safe Body Art Regulations")],
});
fillRule("CA-NS", "other_beauty_professional", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Esthetics licence (CANS)",
    redSealApplies: false,
    issuingAuthority: "CANS",
    issuingAuthorityUrl: "https://nscosmetology.ca/",
    registryExists: true,
    registryName: "CANS membership search",
    registryUrl: "https://nscosmetology.ca/search-membership",
    registryVerifiable: true,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Same Cosmetology Act framework as Hairdressing",
    notes: "Esthetics has no parallel voluntary apprenticeship trade the way Hairdressing does — the CANS licence is its only legal route to practice.",
  },
  student: NS_STUDENT,
  confidence: "high",
  sources: NS_COSMETOLOGY_SOURCES,
});

// ===== Quebec — explicitly non-regulated across the board; DEP/CQP are training/voluntary credentials, not legal requirements =====
const QC_NON_REGULATED_NOTE =
  "Quebec explicitly classifies this as a 'métier non réglementé' (non-regulated trade) — no credential is legally required to practice for pay. The DEP (Diplôme d'études professionnelles) is a Ministry-of-Education school diploma (training evidence, not a work permit); the CQP (Certificat de qualification professionnelle), via the voluntary RCMO process through the CPMT/Qualifications Québec, is a voluntary skills-recognition credential with no legal force. A LineUp 'verified' tier for Quebec should be built around DEP completion or CQP, not a government mandate — none exists.";
const QC_STUDENT = {
  canPerformCommercially: true,
  conditions: "No compulsory credential exists, so students/trainees (even with no diploma at all) may legally work and be paid.",
  defaultServiceEligibility: "eligible" as ServiceEligibility,
};
fillMany("CA-QC", ["hairstylist", "barber"], {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: "DEP in Coiffure (training diploma) / voluntary CQP via RCMO",
    redSealApplies: false,
    issuingAuthority: "CPMT / Qualifications Québec (voluntary CQP); Ministère de l'Éducation (DEP)",
    issuingAuthorityUrl: "https://qualificationsquebec.com/profession/coiffeurs-coiffeuses-et-barbiers/",
    registryExists: false,
    registryName: null,
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: true,
    apprenticeAllowed: true,
    apprenticeProofDocument: "PAMT (Programme d'apprentissage en milieu de travail) — a voluntary workplace-mentoring pathway toward the CQP, not a legal work-authorization requirement",
    notes:
      QC_NON_REGULATED_NOTE +
      " Quebec does not separate Hairstylist and Barber (both are 'Coiffeur-euse et barbier-ère'). The Red Seal Secretariat lists this as Red Seal-designated 'in all provinces/territories including QC' — this is difficult to reconcile with Quebec's own non-regulated classification and should be verified directly against a Quebec trade-designation order before being relied on.",
  },
  student: QC_STUDENT,
  confidence: "medium",
  sources: [
    src(
      "https://www.quebec.ca/en/employment/learn-trade-occupation/practising-regulated-trade-occupation/compulsory-certificates-qualification/obtain-compulsory-qualification-certificate",
      "Quebec compulsory qualification certificates (confirms beauty trades are absent from the compulsory list)"
    ),
    src("https://www.red-seal.ca/eng/trades/hairstylists/description.shtml", "Red Seal — Hairstylist trade description"),
  ],
});
fillMany("CA-QC", ALL_NON_HAIR, {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: "DEP in Esthétique (training diploma) / voluntary CQP via RCMO",
    redSealApplies: false,
    issuingAuthority: "CPMT / Qualifications Québec (voluntary CQP); Ministère de l'Éducation (DEP)",
    issuingAuthorityUrl: "https://qualificationsquebec.com/profession/estheticiens-estheticiennes-electrolystes-et-personnel-assimile/",
    registryExists: false,
    registryName: null,
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: true,
    apprenticeAllowed: true,
    apprenticeProofDocument: "PAMT — voluntary workplace mentoring, not a legal requirement",
    notes:
      QC_NON_REGULATED_NOTE +
      " The base voluntary esthetics norm covers skin care, hand/foot (nail) care and waxing; electric epilation/photo-epilation is a separate 60-hour add-on module within the same voluntary standard (also not legally mandatory). No standalone nail/makeup/lash/brow-specific DEP or CQP exists — these fall under the general Esthéticienne norm.",
  },
  student: QC_STUDENT,
  serviceOverrides: [
    {
      service: "laser_ipl",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes:
        "Genuinely unsettled in Quebec: the Ordre des infirmières et infirmiers du Québec (OIIQ) and Collège des médecins du Québec (CMQ) treat some energy-based procedures as reserved medical/nursing acts, but a 2022 Court of Québec ruling (Collège des médecins du Québec v. Piuze, upheld on appeal) held that laser hair/tattoo removal by a non-physician is not automatically illegal practice of medicine. Treat as High-risk/Low-confidence — needs its own legal review, not an assumption either way.",
    },
    {
      service: "microneedling",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Same unsettled medical-esthetics boundary as laser/IPL — see that note.",
    },
    {
      service: "chemical_peel",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Same unsettled medical-esthetics boundary as laser/IPL — see that note.",
    },
    {
      service: "permanent_makeup",
      professionalEligibility: "manual_review_required",
      studentEligibility: "manual_review_required",
      notes: "Same unsettled medical-esthetics boundary as laser/IPL — see that note.",
    },
  ],
  confidence: "high",
  sources: [
    src(
      "https://www.quebec.ca/en/employment/learn-trade-occupation/practising-regulated-trade-occupation/compulsory-certificates-qualification/obtain-compulsory-qualification-certificate",
      "Quebec compulsory qualification certificates (confirms non-regulated status)"
    ),
    src("https://qualificationsquebec.com/profession/estheticiens-estheticiennes-electrolystes-et-personnel-assimile/", "Qualifications Québec — Estheticians and Electrologists"),
  ],
});

// ===== Prince Edward Island — Hairdressers Act is compulsory only "at a salon"; a new (2026) facility-registration regime for esthetics/nails =====
fillRule("CA-PE", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: true,
    credentialName: "Hairdresser's Licence (PEIHDA) for salon practice; separately, a voluntary Certificate of Qualification exists under the Apprenticeship and Trades Qualification Act",
    redSealApplies: true,
    issuingAuthority: "PEI Hairdressers' Association (PEIHDA)",
    issuingAuthorityUrl: "https://peihda.com/",
    registryExists: true,
    registryName: "Register kept by the PEIHDA Registrar — no confirmed public online search tool",
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Certified apprenticeship contract under the Apprenticeship Act — explicitly exempt from needing the Hairdresser's Licence while apprenticing",
    notes:
      "IMPORTANT: hairdressing services provided at a location OTHER than a 'salon' are expressly exempted from licensing (Hairdressers Act s.1(2)(d)) — potentially very relevant for LineUp's mobile/in-home bookings. Needs legal review on whether a booked home visit counts as a 'salon' under the Act's definition before relying on this for gating.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "s.12(6): a 'Student Licence' is valid only at a salon and under the supervision of a licensed hairdresser; also exempt while in a school/occupational-training program.",
    defaultServiceEligibility: "supervision_required",
  },
  confidence: "high",
  sources: [
    src("https://www.princeedwardisland.ca/sites/default/files/legislation/h-01-01-hairdressers_act.pdf", "PEI Hairdressers Act"),
    src("https://peihda.com/licensing/", "PEIHDA licensing"),
  ],
});
fillRule("CA-PE", "barber", {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "Barbering services performed at a 'barbershop' are explicitly exempted from the Hairdressers Act (s.1(2)(e)); not a separate designated trade.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No restriction — not regulated.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [src("https://www.princeedwardisland.ca/sites/default/files/legislation/h-01-01-hairdressers_act.pdf", "PEI Hairdressers Act, ss.1(1)(b)-(c), 1(2)(e)")],
});
fillRule("CA-PE", "lash_artist", {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "Explicitly confirmed unregulated: 'Licenses are NOT required to become a lash stylist in PEI' (CBC reporting on PEIHDA's own advocacy for regulation, which hasn't happened).",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No restriction — not regulated.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [src("https://www.cbc.ca/news/canada/prince-edward-island/p-e-i-hairdressers-want-regulation-of-nail-eyelash-services-1.6436632", "CBC — PEI hairdressers want regulation of nail, eyelash services")],
});
fillMany("CA-PE", ["nail_artist", "wax_technician", "body_sugaring", "brow_artist", "makeup_artist", "other_beauty_professional"], {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "No individual practitioner licence. As of February 1, 2026, PEI requires BUSINESSES/FACILITIES offering esthetics/nail services to register under new Personal Service Regulations (Public Health Act) — a business registration, not a personal credential. The full regulation text could not be retrieved (blocked from automated fetch) — recommend independent verification before relying on details.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No individual licensing regime exists.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "medium",
  sources: [src("https://www.ctvnews.ca/atlantic/prince-edward-island/article/prince-edward-island-standardizes-health-and-safety-for-personal-services/", "CTV — PEI standardizes health and safety for personal services (Feb 2026)")],
});

// ===== Newfoundland and Labrador — Hairstylist voluntary; nothing else regulated =====
fillRule("CA-NL", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Certificate of Qualification (Hairstylist), voluntary",
    redSealApplies: true,
    issuingAuthority: "Apprenticeship and Trades Certification Division (ATCD)",
    issuingAuthorityUrl: "https://www.gov.nl.ca/atcd/",
    registryExists: false,
    registryName: "No public searchable database located",
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Registered apprenticeship agreement with ATCD",
    notes: "NL's compulsory list has only 5 trades (Boom Truck Operator, Construction/Residential Electrician, Mobile/Tower Crane Operator) — Hairstylist isn't among them.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No distinct student-practice framework found beyond the Pre-Employment program structure.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [
    src("https://www.gov.nl.ca/atcd/designated-trades/trade-profiles/hairstylist-trade-profile/", "NL Hairstylist trade profile"),
    src("https://www.gov.nl.ca/atcd/designated-trades/list-of-designated-trades/", "NL list of designated trades"),
  ],
});
fillMany("CA-NL", ["barber", ...ALL_NON_HAIR], {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "Absent from NL's full designated-trades list (80+ items) and its 5-item compulsory list — no credential or regulator exists for this profession.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No regulation exists.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [src("https://www.gov.nl.ca/atcd/designated-trades/list-of-designated-trades/", "NL list of designated trades")],
});

// ===== Yukon — Hairstylist voluntary; Barber unconfirmed; everything else unconfirmed (complete trades schedule unavailable) =====
fillRule("CA-YT", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Yukon Certificate of Qualification, voluntary",
    redSealApplies: true,
    issuingAuthority: "Yukon Apprenticeship Office",
    issuingAuthorityUrl: "https://yukon.ca/en/education-and-schools/apprentices-and-trades",
    registryExists: false,
    registryName: "No public searchable registry found",
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Registered apprenticeship contract, Yukon Apprenticeship Office",
    notes: "Yukon's compulsorily-licensed occupations are a distinct safety-critical set (Electrician, Gasfitter, Oil-burner Mechanic, Power Engineer, Elevator Technician) that doesn't include Hairstylist.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No distinct legal student-licence regime identified.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [src("https://yukon.ca/en/get-trades-certification-qualification-yukon", "Get a Yukon Certificate of Qualification")],
});
fillRule("CA-YT", "barber", {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "Reported as a separately-recognized, voluntary trade per a Government of Canada Job Bank secondary source, but Yukon's own designated-trades list PDF could not be retrieved to confirm independently.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "unconfirmed",
  sources: [src("https://www.jobbank.gc.ca/marketreport/requirements/16446/ca", "Job Bank — Barber requirements (secondary source, not Yukon primary law)")],
});
fillMany("CA-YT", ALL_NON_HAIR, {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes: "No evidence of designation found, but Yukon's complete current trades schedule could not be obtained from a primary source — reporting absence as unconfirmed rather than definitively regulated/unregulated.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "unconfirmed",
  sources: [],
});

// ===== Northwest Territories — Hairstylist voluntary; everything else confirmed fully unregulated (both full schedules read directly) =====
fillRule("CA-NT", "hairstylist", {
  professional: {
    regulated: true,
    compulsory: false,
    credentialName: "Certificate of Qualification (Hairstylist), voluntary",
    redSealApplies: true,
    issuingAuthority: "Apprenticeship, Trade and Occupation Certification Board / Director, GNWT Education, Culture and Employment",
    issuingAuthorityUrl: "https://www.ece.gov.nt.ca/en/services/apprenticeship-trade-and-occupation-certification/designated-trades-nwt",
    registryExists: false,
    registryName: null,
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: true,
    apprenticeProofDocument: "Certified apprenticeship contract (min. age 16)",
    notes: "Item #16 of 43 in the current Designated Trades Order (R-016-2024, read in full directly) — a 'designated trade' (apprenticeship model), not a 'designated occupation' (lighter trainee model).",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No separate student-commercial-practice pathway found.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [src("https://www.justice.gov.nt.ca/en/files/legislation/apprenticeship-trade-occupation-cert/apprenticeship-trade-occupation-cert.r3.pdf", "NWT Designated Trades Order, R-016-2024 (full text)")],
});
fillMany("CA-NT", ["barber", ...ALL_NON_HAIR], {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "Confirmed by reading NWT's full, current Designated Trades Order (R-016-2024, 43 items) and Designated Occupations Order (R-015-2024, 17 items) directly — neither contains any beauty-related entry other than Hairstylist. Genuinely and completely unregulated, not merely unconfirmed.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "No regulation exists.",
    defaultServiceEligibility: "eligible",
  },
  confidence: "high",
  sources: [
    src("https://www.justice.gov.nt.ca/en/files/legislation/apprenticeship-trade-occupation-cert/apprenticeship-trade-occupation-cert.r3.pdf", "NWT Designated Trades Order, R-016-2024"),
    src("https://www.justice.gov.nt.ca/en/files/legislation/apprenticeship-trade-occupation-cert/apprenticeship-trade-occupation-cert.r2.pdf", "NWT Designated Occupations Order, R-015-2024"),
  ],
});

// ===== Nunavut — weakest-sourced jurisdiction; primary legislation could not be retrieved (CanLII/gov.nu.ca blocked automated access) =====
fillRule("CA-NU", "hairstylist", {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: 'Presumed "Certificate of Qualification" (exact current name unconfirmed)',
    redSealApplies: false,
    issuingAuthority: "Nunavut Apprenticeship, Trade and Occupations Certification Board / Apprenticeship Unit, Dept. of Family Services (presumed)",
    issuingAuthorityUrl: "https://www.gov.nu.ca/en/employment-training-and-career-development/apprenticeship-trade-and-occupations-certification",
    registryExists: false,
    registryName: null,
    registryUrl: null,
    registryVerifiable: false,
    diplomaSufficientAlone: false,
    apprenticeAllowed: false,
    apprenticeProofDocument: null,
    notes:
      "Nunavut runs under an inherited, pre-division statute (Apprenticeship, Trade and Occupations Certification Act, R.S.N.W.T. (Nu) 1988, c.A-4) that could not be retrieved (CanLII returned 403 on every attempt, gov.nu.ca pages did not load). Secondary sources (ESDC Job Bank) describe this as a voluntary Red Seal-applicable trade, but that is NOT independently verified against Nunavut's own law. Nunavut Arctic College's current apprenticeship offerings do not include Hairstylist or any beauty trade — suggesting little or no active apprenticeship infrastructure even if nominally designated. Recommend direct outreach to the Nunavut Apprenticeship, Trade and Occupations Certification Board before relying on any row for this jurisdiction.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "unconfirmed",
  sources: [src("https://www.jobbank.gc.ca/marketreport/requirements/16452/ca", "Job Bank — Hairstylist requirements (secondary source only; Nunavut primary law not retrieved)")],
});
fillMany("CA-NU", ["barber", ...ALL_NON_HAIR], {
  professional: {
    regulated: false,
    compulsory: false,
    credentialName: null,
    notes:
      "No evidence found either way — Nunavut's primary legislation could not be retrieved. Reported as genuinely unconfirmed, not assumed to mirror NWT's confirmed-unregulated finding. Recommend direct outreach to the Nunavut Apprenticeship, Trade and Occupations Certification Board.",
  },
  student: {
    canPerformCommercially: true,
    conditions: "Unconfirmed.",
    defaultServiceEligibility: "manual_review_required",
  },
  confidence: "unconfirmed",
  sources: [],
});
