/**
 * What a "client" looks like, per industry.
 *
 * The core customer columns (name, email, phone, address, company) are
 * universal and stay as columns. Everything ABOVE that is industry-specific:
 * a roofer needs roof type and access notes, an agency needs the retainer and
 * the socials. Hardcoding either makes the app wrong for the other.
 *
 * So the industry preset supplies a DEFAULT set of extra fields, and a business
 * can override it entirely from Settings. A NULL stored schema means "use the
 * preset default" — that's what keeps every existing business unchanged rather
 * than waking up to a different customer form.
 *
 * Fields reuse OnboardingField, the same model the onboarding and public-form
 * builders already use. That's deliberate: 25 field types, validation and a
 * drag-to-reorder editor already exist, so a client profile is a new
 * application of a proven engine rather than a second one to maintain.
 *
 * Plain module — imported by server actions, the MCP tools and the UI.
 */
import type { OnboardingField } from "@/types/database";

/** Extra client fields shipped with each industry preset. */
export const PRESET_CUSTOMER_FIELDS: Record<string, OnboardingField[]> = {
  trades: [
    { id: "property_type", type: "dropdown", label: "Property type",
      options: ["Residential", "Commercial", "Strata", "Industrial", "Rural"] },
    { id: "access_notes", type: "long_text", label: "Site access notes",
      help_text: "Gate codes, parking, dogs, where to find the key" },
    { id: "preferred_times", type: "short_text", label: "Preferred visit times" },
    { id: "referred_by", type: "short_text", label: "How did they find you?" },
  ],

  agency: [
    { id: "client_industry", type: "short_text", label: "Their industry" },
    { id: "engagement", type: "dropdown", label: "Engagement type",
      options: ["Retainer", "Project", "Ad hoc"] },
    { id: "monthly_retainer", type: "currency", label: "Monthly retainer" },
    { id: "billing_day", type: "number", label: "Billing day of month" },
    { id: "primary_goal", type: "long_text", label: "What does success look like?",
      help_text: "The outcome they're paying for — leads, launches, brand awareness" },
    { id: "website_url", type: "url", label: "Website" },
    { id: "instagram", type: "short_text", label: "Instagram" },
    { id: "facebook", type: "short_text", label: "Facebook" },
    { id: "linkedin", type: "short_text", label: "LinkedIn" },
    { id: "brand_assets", type: "url", label: "Brand assets / drive link" },
  ],

  "seo-agency-local": [
    { id: "client_industry", type: "short_text", label: "Their industry" },
    { id: "engagement", type: "dropdown", label: "Engagement type",
      options: ["Retainer", "Project", "Ad hoc"] },
    { id: "monthly_retainer", type: "currency", label: "Monthly retainer" },
    { id: "website_url", type: "url", label: "Website" },
    { id: "target_locations", type: "long_text", label: "Target locations",
      help_text: "Suburbs or regions they want to rank in" },
    { id: "gbp_url", type: "url", label: "Google Business Profile" },
    { id: "main_competitors", type: "long_text", label: "Main competitors" },
  ],
};

/** Businesses with no preset still get something sensible. */
export const GENERIC_CUSTOMER_FIELDS: OnboardingField[] = [
  { id: "referred_by", type: "short_text", label: "How did they find you?" },
  { id: "account_notes", type: "long_text", label: "Account notes" },
];

/**
 * The fields to show for a business.
 *
 * An explicitly stored schema always wins — including an empty array, which
 * means "I don't want any extra fields". Distinguishing empty from unset is the
 * whole point: falling back to the preset when someone deliberately cleared
 * their fields would make the setting impossible to turn off.
 */
export function resolveCustomerFields(
  storedSchema: OnboardingField[] | null | undefined,
  industryPreset: string | null | undefined,
): OnboardingField[] {
  if (Array.isArray(storedSchema)) return storedSchema;
  return PRESET_CUSTOMER_FIELDS[industryPreset ?? ""] ?? GENERIC_CUSTOMER_FIELDS;
}

/** True when the business is running on its preset's defaults. */
export function isUsingPresetDefaults(storedSchema: OnboardingField[] | null | undefined): boolean {
  return !Array.isArray(storedSchema);
}

/**
 * Drop answers whose field no longer exists in the schema.
 *
 * Without this, removing a field would orphan its answers — invisible in the
 * UI but still in the row, resurfacing if the field id were ever reused.
 */
export function pruneAnswers(
  answers: Record<string, unknown> | null | undefined,
  fields: OnboardingField[],
): Record<string, unknown> {
  const ids = new Set(fields.map((f) => f.id));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (ids.has(k)) out[k] = v;
  }
  return out;
}
