// Stripe's "currently due" fields, said the way a pro would say them.
// Unknown fields fall back to a tidied version of Stripe's name.
const RULES: [RegExp, string][] = [
  [/^external_account$/, "your bank account"],
  [/verification\.proof_of_liveness$/, "a quick selfie to confirm it's you"],
  [/verification\.(additional_)?document/, "a photo of your ID"],
  [/\.(id_number|ssn_last_4)$/, "your Social Insurance Number"],
  [/\.dob\./, "your date of birth"],
  [/\.address\./, "your home address"],
  [/\.(first_name|last_name)$/, "your legal name"],
  [/\.phone$/, "your phone number"],
  [/\.email$/, "your email"],
  [/^tos_acceptance\./, "accepting Stripe's terms"],
  [/^business_profile\.(url|product_description|mcc)$/, "a short description of your work"],
  [/statement_descriptor/, "the name on clients' card statements"],
];

export function plainStripeRequirement(field: string): string {
  for (const [re, text] of RULES) if (re.test(field)) return text;
  return field.replace(/[._]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// One readable list, without repeats ("dob.day", "dob.month" → one item).
export function plainStripeRequirements(fields: string[]): string[] {
  return [...new Set(fields.map(plainStripeRequirement))];
}
