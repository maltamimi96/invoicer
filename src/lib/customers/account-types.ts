/**
 * What kind of client this is — per industry.
 *
 * "Customer type" used to be a fixed trades list: Residential, Strata,
 * Builder, Property manager. An agency was asked to classify a client as a
 * strata company. Same problem as the client fields, so the same answer: the
 * industry preset supplies defaults, the business can override them.
 *
 * Plain module — server actions, MCP tools and the form all read it.
 */
import type { OnboardingField } from "@/types/database";

export interface AccountTypeOption {
  value: string;
  label: string;
  hint?: string;
}

export const PRESET_ACCOUNT_TYPES: Record<string, AccountTypeOption[]> = {
  trades: [
    { value: "residential",   label: "Residential",          hint: "Homeowner / private individual" },
    { value: "commercial",    label: "Commercial",           hint: "Business client" },
    { value: "developer",     label: "Developer",            hint: "Property developer / builder-developer" },
    { value: "agent",         label: "Real estate agent",    hint: "Sales / leasing agent" },
    { value: "builder",       label: "Builder",              hint: "Construction company" },
    { value: "strata",        label: "Strata company",       hint: "Body corporate / owners corp" },
    { value: "property_mgmt", label: "Property manager",     hint: "Manages rental properties" },
    { value: "government",    label: "Government",           hint: "Council / public sector" },
    { value: "non_profit",    label: "Non-profit / charity" },
    { value: "other",         label: "Other" },
  ],

  agency: [
    { value: "retainer_client", label: "Retainer client",  hint: "Ongoing monthly engagement" },
    { value: "project_client",  label: "Project client",   hint: "Fixed scope, defined end" },
    { value: "startup",         label: "Startup" },
    { value: "smb",             label: "Small business" },
    { value: "ecommerce",       label: "E-commerce" },
    { value: "enterprise",      label: "Enterprise" },
    { value: "agency_partner",  label: "Agency partner",   hint: "White-label / subcontracted work" },
    { value: "non_profit",      label: "Non-profit / charity" },
    { value: "other",           label: "Other" },
  ],

  "seo-agency-local": [
    { value: "local_business",        label: "Local business",       hint: "Single location" },
    { value: "multi_location",        label: "Multi-location",       hint: "Several branches or service areas" },
    { value: "franchise",             label: "Franchise" },
    { value: "ecommerce",             label: "E-commerce" },
    { value: "professional_services", label: "Professional services", hint: "Legal, medical, accounting" },
    { value: "agency_partner",        label: "Agency partner",       hint: "White-label / subcontracted work" },
    { value: "non_profit",            label: "Non-profit / charity" },
    { value: "other",                 label: "Other" },
  ],
};

/** Businesses with no preset get something that fits anyone. */
export const GENERIC_ACCOUNT_TYPES: AccountTypeOption[] = [
  { value: "individual",  label: "Individual" },
  { value: "commercial",  label: "Business" },
  { value: "government",  label: "Government" },
  { value: "non_profit",  label: "Non-profit / charity" },
  { value: "other",       label: "Other" },
];

/**
 * Options for a business. A stored array always wins — including an empty
 * one, same rule as the client fields.
 */
export function resolveAccountTypes(
  stored: AccountTypeOption[] | null | undefined,
  industryPreset: string | null | undefined,
): AccountTypeOption[] {
  if (Array.isArray(stored)) return stored;
  return PRESET_ACCOUNT_TYPES[industryPreset ?? ""] ?? GENERIC_ACCOUNT_TYPES;
}

export function isUsingPresetAccountTypes(stored: AccountTypeOption[] | null | undefined): boolean {
  return !Array.isArray(stored);
}

/** `property_mgmt` → `Property manager`-ish. For values no list explains. */
export function humaniseAccountType(value: string): string {
  const known = Object.values(PRESET_ACCOUNT_TYPES).flat().concat(GENERIC_ACCOUNT_TYPES)
    .find((o) => o.value === value);
  if (known) return known.label;
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Guarantee the value a customer already has is selectable.
 *
 * A business that switches preset (or edits its list) still has customers
 * classified under the old vocabulary. Without this, opening one of those
 * would show an empty dropdown and quietly rewrite their type on the next
 * save — data loss disguised as an edit.
 */
export function withCurrentValue(
  options: AccountTypeOption[],
  current: string | null | undefined,
): AccountTypeOption[] {
  if (!current || options.some((o) => o.value === current)) return options;
  return [...options, { value: current, label: humaniseAccountType(current), hint: "Existing value" }];
}

/** The value a brand-new client should start on. */
export function defaultAccountType(options: AccountTypeOption[]): string {
  return options[0]?.value ?? "other";
}

/** Shared with the client-field editor so both reject the same junk. */
export function validateAccountTypes(options: AccountTypeOption[]): string | null {
  if (!Array.isArray(options)) return "Invalid options";
  if (options.length === 0) return "Keep at least one client type — every client is saved with one.";
  if (options.length > 40) return "That's more than 40 client types. Use client fields for finer detail.";
  const seen = new Set<string>();
  for (const o of options) {
    if (!o?.value?.trim()) return "Every client type needs a value";
    if (!o?.label?.trim()) return `The type "${o.value}" needs a label`;
    if (seen.has(o.value)) return `Two client types share the value "${o.value}"`;
    seen.add(o.value);
  }
  return null;
}

/** Kept here so the settings editor and the form agree on what a field is. */
export type { OnboardingField };
