// One place for "what does this professional do" and "which professionals is
// this request for". Before this, the Work tab compared request categories
// ("haircut") straight against profession keys ("hairstylist") — which never
// match — the Requests tab didn't filter by profession at all, and the alert
// emails used a third rule. Everything now goes through these helpers, so a
// pro who is, say, both a Hairstylist and a Brow Artist sees (and is alerted
// to) exactly the hair requests and the brow requests, nothing else.

import { PROFESSION_LABELS } from "@/app/lib/verificationRules";

// Request categories (what a customer picks on "Post a request") → the
// professions that do that work.
export const CATEGORY_PROFESSIONS: Record<string, string[]> = {
  haircut: ["barber", "hairstylist"],
  nails: ["nail_artist"],
  lashes: ["lash_artist"],
  brows: ["brow_artist"],
  brow_artist: ["brow_artist"], // older requests stored this key
  makeup: ["makeup_artist"],
  waxing: ["wax_technician"],
  body_sugaring: ["body_sugaring"],
};

export function professionsForCategories(categories: (string | null | undefined)[]) {
  return Array.from(
    new Set(categories.flatMap((category) => (category ? CATEGORY_PROFESSIONS[category] || [] : [])))
  );
}

type ProfessionalLike = {
  professional_type?: string | null;
  professional_types?: string[] | null;
  service_modes?: string[] | null;
};

// Every profession a pro has, primary first. professional_types is the real
// list; professional_type is the older single column (kept as the primary).
export function getProfessionalTypes(profile: ProfessionalLike | null | undefined): string[] {
  if (!profile) return [];
  const list = Array.isArray(profile.professional_types) ? profile.professional_types.filter(Boolean) : [];
  const primary = profile.professional_type ? [profile.professional_type] : [];
  return Array.from(new Set([...list, ...primary]));
}

export function professionLabel(type: string) {
  return (
    PROFESSION_LABELS[type] ||
    type.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

// "Hairstylist • Brow Artist"
export function formatProfessions(profile: ProfessionalLike | null | undefined, fallback = "Professional") {
  const labels = getProfessionalTypes(profile).map(professionLabel);
  return labels.length > 0 ? labels.join(" • ") : fallback;
}

type RequestLike = {
  category?: string | null;
  categories?: string[] | null;
  target_professions?: string[] | null;
  service_mode?: string | null;
  service_modes?: string[] | null;
  is_direct_rebook?: boolean | null;
  preferred_professional_id?: string | null;
};

// Which professions a request is for: the saved target list, or (for older
// rows) worked out from its categories.
export function getRequestProfessions(request: RequestLike): string[] {
  if (Array.isArray(request.target_professions) && request.target_professions.length > 0) {
    return request.target_professions;
  }
  const categories = request.categories?.length ? request.categories : request.category ? [request.category] : [];
  return professionsForCategories(categories);
}

// Should this professional see / be alerted to this request?
export function requestMatchesProfessional(
  request: RequestLike,
  professional: ProfessionalLike & { id?: string | null }
) {
  // Sent to one specific pro: only they see it.
  if (request.is_direct_rebook || request.preferred_professional_id) {
    return !!professional.id && request.preferred_professional_id === professional.id;
  }

  // Compare loosely ("Brow Artist" == "brow_artist") in case older rows
  // stored a label instead of the key.
  const norm = (value: string) => value.trim().toLowerCase().replaceAll(" ", "_");
  const proTypes = getProfessionalTypes(professional).map(norm);
  const requestTypes = getRequestProfessions(request).map(norm);

  // Missing data on either side: don't hide anything.
  if (proTypes.length > 0 && requestTypes.length > 0) {
    if (!requestTypes.some((type) => proTypes.includes(type))) return false;
  }

  // If both sides set how the appointment happens, at least one must overlap.
  const proModes = Array.isArray(professional.service_modes) ? professional.service_modes : [];
  const requestModes = request.service_modes?.length
    ? request.service_modes
    : request.service_mode
    ? [request.service_mode]
    : [];
  if (proModes.length > 0 && requestModes.length > 0) {
    if (!requestModes.some((mode) => proModes.includes(mode))) return false;
  }

  return true;
}
