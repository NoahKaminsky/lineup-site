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

// ---- Research fill-in area ----
// Populated below as each jurisdiction's research is validated. Until a row
// appears here for a given jurisdiction+profession, it stays at the
// unconfirmed default above.
