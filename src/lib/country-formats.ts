/**
 * Per-country address layouts.
 *
 * The active business's `country` determines which template is used across
 * every address form (customer, property, site, business profile). For
 * countries without an explicit template we fall back to GENERIC.
 *
 * To add a country: drop a new entry into FORMATS keyed by ISO-2 code or
 * the natural-language country name (lowercased). Also list a label for
 * each field so the form copy reads naturally for that country.
 */

export type AddressFieldKey = "address" | "city" | "state" | "postcode" | "country";

export interface AddressFormat {
  /** Order the fields render in. Always includes 'address' first. */
  fields: AddressFieldKey[];
  /** Per-field label override. Keys not present use the generic fallback. */
  labels: Partial<Record<AddressFieldKey, string>>;
  /** Per-field placeholder hint. */
  placeholders: Partial<Record<AddressFieldKey, string>>;
  /** Optional preset list for the state dropdown. Empty = free text input. */
  states?: { value: string; label: string }[];
  /** ISO-2 code for biasing autocomplete (passed to /api/places/search). */
  countryCode: string;
}

const GENERIC: AddressFormat = {
  fields: ["address", "city", "postcode", "country"],
  labels: {
    address: "Street address",
    city:    "City",
    postcode:"Postcode",
    country: "Country",
  },
  placeholders: {
    address: "123 Main Street",
    city:    "City",
    postcode:"Postcode",
    country: "Country",
  },
  countryCode: "",
};

const AU: AddressFormat = {
  fields: ["address", "city", "state", "postcode", "country"],
  labels: {
    address: "Street address",
    city:    "Suburb",
    state:   "State",
    postcode:"Postcode",
    country: "Country",
  },
  placeholders: {
    address: "12 Smith Street",
    city:    "Bondi",
    state:   "NSW",
    postcode:"2026",
    country: "Australia",
  },
  states: [
    { value: "ACT", label: "ACT" },
    { value: "NSW", label: "NSW" },
    { value: "NT",  label: "NT"  },
    { value: "QLD", label: "QLD" },
    { value: "SA",  label: "SA"  },
    { value: "TAS", label: "TAS" },
    { value: "VIC", label: "VIC" },
    { value: "WA",  label: "WA"  },
  ],
  countryCode: "au",
};

const US: AddressFormat = {
  fields: ["address", "city", "state", "postcode", "country"],
  labels: {
    address: "Street address",
    city:    "City",
    state:   "State",
    postcode:"ZIP code",
    country: "Country",
  },
  placeholders: {
    address: "123 Main Street",
    city:    "City",
    state:   "CA",
    postcode:"94103",
    country: "United States",
  },
  countryCode: "us",
};

const UK: AddressFormat = {
  fields: ["address", "city", "state", "postcode", "country"],
  labels: {
    address: "Street address",
    city:    "Town / city",
    state:   "County",
    postcode:"Postcode",
    country: "Country",
  },
  placeholders: {
    address: "10 Downing Street",
    city:    "London",
    state:   "Greater London",
    postcode:"SW1A 2AA",
    country: "United Kingdom",
  },
  countryCode: "gb",
};

const FORMATS: Record<string, AddressFormat> = {
  // ISO-2 codes
  au: AU, us: US, gb: UK,
  // Common spellings
  australia:        AU,
  "united states":  US,
  usa:              US,
  "united kingdom": UK,
  uk:               UK,
  britain:          UK,
};

/** Resolve the format for a given country string (free-text or ISO-2). */
export function getAddressFormat(country?: string | null): AddressFormat {
  if (!country) return GENERIC;
  const key = country.trim().toLowerCase();
  return FORMATS[key] ?? GENERIC;
}

export const DEFAULT_AU_FORMAT = AU;
