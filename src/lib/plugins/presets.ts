/**
 * Industry presets — plugin bundles + vocabulary per business type
 * (docs/SEO_AGENCY_PLAN.md P0.4/0.5). Applying a preset writes explicit
 * install rows for every optional module (enable AND disable) so the bundle
 * is stable even if registry defaults change later. Applying is always an
 * explicit user action (signup step or Plugins page) — existing businesses
 * are untouched until they opt in. Disabled modules only hide; data stays.
 */
import { OPTIONAL_PLUGINS } from "./registry";

export interface IndustryPreset {
  id: string;
  label: string;
  description: string;
  /** Optional-module ids enabled by this preset (everything else optional is disabled). */
  plugins: string[];
  /** What this industry calls each page, keyed by nav href.
   *  Read by the sidebar AND by the pages themselves (via the vocab context in
   *  src/components/layout/vocab-provider.tsx), so an agency's "Projects" tab
   *  opens a screen that also says Projects. A business can override any of it
   *  in Settings → Navigation. */
  vocab?: Record<string, string>;
}

const ALL_OPTIONAL = OPTIONAL_PLUGINS.map((p) => p.id);

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: "trades",
    label: "Trades & field services",
    description: "Roofing, electrical, plumbing, cleaning — jobs, scheduling, quoting and invoicing.",
    // Everything on except the opt-in verticals (mirrors today's default app).
    plugins: ALL_OPTIONAL.filter((id) => !["quoting-agent", "client-onboarding", "form-builder"].includes(id)),
  },
  {
    id: "agency",
    label: "Agency & creative services",
    description: "Web, marketing, design and studio work — proposals, retainers, contracts and client onboarding.",
    plugins: [
      "prospects", "leads", "quotes", "invoicing", "recurring-billing", "contracts",
      "jobs", "messages", "analytics",
      "client-onboarding", "form-builder",
    ],
    vocab: {
      "/work-orders": "Projects",
      "/quotes": "Proposals",
      "/customers": "Clients",
    },
  },
  {
    id: "seo-agency-local",
    label: "SEO agency (local services)",
    description: "Local-business SEO: client sites, GSC connector, opportunity queue, content pipeline and white-label reporting.",
    // Agency operating layer + the SEO production engine. Field-ops modules off.
    plugins: [
      "prospects", "leads", "quotes", "invoicing", "recurring-billing", "contracts",
      "messages", "analytics", "client-onboarding", "form-builder",
      "seo-production",
    ],
    vocab: {
      "/customers": "Clients",
      "/quotes": "Proposals",
    },
  },
];

export const PRESETS_BY_ID: Record<string, IndustryPreset> =
  Object.fromEntries(INDUSTRY_PRESETS.map((p) => [p.id, p]));

/** Rows to upsert into business_agent_installs when applying a preset. */
export function presetInstallRows(businessId: string, preset: IndustryPreset) {
  return OPTIONAL_PLUGINS.map((p) => ({
    business_id: businessId,
    agent_id: p.id,
    enabled: preset.plugins.includes(p.id),
    updated_at: new Date().toISOString(),
  }));
}
