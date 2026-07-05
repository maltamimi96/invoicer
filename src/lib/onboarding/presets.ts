/**
 * Preset field library for the onboarding form builder — one-click fields with
 * correct labels, placeholders, and format validation baked in. Plain module
 * (used by the builder UI and the response viewer).
 */
import type { OnboardingField, OnboardingFieldType } from "@/types/database";

export interface PresetDef {
  key: string;                 // stable preset id stored on the field
  group: string;
  type: OnboardingFieldType;
  label: string;
  placeholder?: string;
  help_text?: string;
  options?: string[];
  validation?: { pattern: string; message: string };
}

export const PRESET_LIBRARY: PresetDef[] = [
  // ── Business details ────────────────────────────────────────────────────
  { key: "company", group: "Business", type: "company", label: "Business / trading name", placeholder: "Acme Pty Ltd" },
  {
    key: "abn", group: "Business", type: "abn", label: "ABN",
    placeholder: "51 824 753 556",
    help_text: "11-digit Australian Business Number",
  },
  {
    key: "acn", group: "Business", type: "short_text", label: "ACN",
    placeholder: "123 456 789",
    help_text: "9-digit Australian Company Number",
    validation: { pattern: "^\\s*\\d[\\d ]{7,12}\\d\\s*$", message: "Enter a 9-digit ACN" },
  },
  { key: "gst_registered", group: "Business", type: "yes_no", label: "Registered for GST?" },
  { key: "industry", group: "Business", type: "short_text", label: "Industry / what you do", placeholder: "e.g. Cafe, hair salon, roofing" },
  { key: "business_address", group: "Business", type: "address", label: "Business address", placeholder: "Street, suburb, state, postcode" },
  { key: "postal_address", group: "Business", type: "address", label: "Postal address (if different)" },
  { key: "opening_hours", group: "Business", type: "opening_hours", label: "Opening hours" },
  {
    key: "website", group: "Business", type: "url", label: "Website",
    placeholder: "https://yourbusiness.com.au",
  },

  // ── Social media ────────────────────────────────────────────────────────
  {
    key: "instagram", group: "Socials", type: "short_text", label: "Instagram handle",
    placeholder: "@yourbusiness",
    validation: { pattern: "^@?[A-Za-z0-9._]{1,30}$", message: "Handles are letters, numbers, dots and underscores (no spaces)" },
  },
  {
    key: "tiktok", group: "Socials", type: "short_text", label: "TikTok handle",
    placeholder: "@yourbusiness",
    validation: { pattern: "^@?[A-Za-z0-9._]{1,24}$", message: "Handles are letters, numbers, dots and underscores (no spaces)" },
  },
  {
    key: "x_handle", group: "Socials", type: "short_text", label: "X (Twitter) handle",
    placeholder: "@yourbusiness",
    validation: { pattern: "^@?[A-Za-z0-9_]{1,15}$", message: "Handles are letters, numbers and underscores, up to 15 characters" },
  },
  { key: "facebook", group: "Socials", type: "url", label: "Facebook page", placeholder: "https://facebook.com/yourbusiness" },
  { key: "linkedin", group: "Socials", type: "url", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourbusiness" },
  { key: "youtube", group: "Socials", type: "url", label: "YouTube channel", placeholder: "https://youtube.com/@yourbusiness" },
  { key: "google_business", group: "Socials", type: "url", label: "Google Business Profile link", placeholder: "https://g.page/yourbusiness" },

  // ── Contact ─────────────────────────────────────────────────────────────
  { key: "contact_name", group: "Contact", type: "short_text", label: "Main contact name", placeholder: "Full name" },
  { key: "contact_email", group: "Contact", type: "email", label: "Best email", placeholder: "you@example.com" },
  { key: "contact_phone", group: "Contact", type: "phone", label: "Best phone number", placeholder: "0400 000 000" },
  {
    key: "preferred_contact", group: "Contact", type: "dropdown", label: "Preferred contact method",
    options: ["Email", "Phone call", "SMS", "WhatsApp"],
  },
  {
    key: "best_time", group: "Contact", type: "dropdown", label: "Best time to reach you",
    options: ["Morning", "Afternoon", "Evening", "Any time"],
  },
  { key: "emergency_name", group: "Contact", type: "short_text", label: "Emergency / after-hours contact name" },
  { key: "emergency_phone", group: "Contact", type: "phone", label: "Emergency / after-hours phone" },

  // ── Branding & assets ───────────────────────────────────────────────────
  { key: "logo", group: "Branding", type: "image", label: "Logo upload", help_text: "PNG with transparent background works best" },
  { key: "brand_images", group: "Branding", type: "image", label: "Brand photo / hero image" },
  { key: "brand_colors", group: "Branding", type: "short_text", label: "Brand colours", placeholder: "#0e7490, #2dd4bf …", help_text: "Hex codes or a description" },
  { key: "brand_guidelines", group: "Branding", type: "file", label: "Brand guidelines / style guide (PDF)" },
  { key: "tagline", group: "Branding", type: "short_text", label: "Tagline / slogan" },
  { key: "about_business", group: "Branding", type: "long_text", label: "About your business", placeholder: "A short paragraph about who you are and what you do" },

  // ── Engagement / operations ─────────────────────────────────────────────
  {
    key: "services_needed", group: "Engagement", type: "multi_select", label: "What do you need from us?",
    options: ["Social media management", "Content creation", "Website", "Advertising", "Photography", "Other"],
    help_text: "Edit these options to match your services",
  },
  { key: "goals", group: "Engagement", type: "long_text", label: "Goals — what does success look like?" },
  { key: "budget", group: "Engagement", type: "currency", label: "Monthly budget" },
  { key: "start_date", group: "Engagement", type: "date", label: "Ideal start date" },
  {
    key: "referral_source", group: "Engagement", type: "dropdown", label: "How did you hear about us?",
    options: ["Google", "Instagram", "Facebook", "Word of mouth", "Existing client", "Other"],
  },
  { key: "target_audience", group: "Engagement", type: "long_text", label: "Who are your customers / target audience?" },
  { key: "competitors", group: "Engagement", type: "long_text", label: "Main competitors (names or links)" },
  { key: "extra_notes", group: "Engagement", type: "long_text", label: "Anything else we should know?" },
  { key: "terms_consent", group: "Engagement", type: "consent", label: "I agree to the terms of service" },

  // ── Secure credentials ──────────────────────────────────────────────────
  { key: "account_password", group: "Secure", type: "secure", label: "Account password", help_text: "Stored encrypted — only the business owner can view it" },
  { key: "account_username", group: "Secure", type: "short_text", label: "Account username / login email" },
];

export const PRESET_GROUPS = [...new Set(PRESET_LIBRARY.map((p) => p.group))];

export function presetByKey(key: string | undefined): PresetDef | undefined {
  return key ? PRESET_LIBRARY.find((p) => p.key === key) : undefined;
}

/** Build a ready-to-insert field from a preset (id supplied by the caller). */
export function fieldFromPreset(p: PresetDef, id: string): OnboardingField {
  return {
    id, type: p.type, label: p.label, preset: p.key,
    ...(p.placeholder ? { placeholder: p.placeholder } : {}),
    ...(p.help_text ? { help_text: p.help_text } : {}),
    ...(p.options ? { options: [...p.options] } : {}),
    ...(p.validation ? { validation: { ...p.validation } } : {}),
  };
}

/** Social presets the response viewer can turn into profile links. */
export function socialProfileUrl(preset: string | undefined, raw: string): string | null {
  if (!preset) return null;
  const handle = raw.trim().replace(/^@/, "");
  switch (preset) {
    case "instagram": return `https://instagram.com/${handle}`;
    case "tiktok": return `https://tiktok.com/@${handle}`;
    case "x_handle": return `https://x.com/${handle}`;
    default: return null;
  }
}
