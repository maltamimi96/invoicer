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
    /**
     * The trades hub: what one trade business needs to run its own work, and
     * nothing else.
     *
     * This used to be ALL_OPTIONAL minus three, so a tradie signed up and was
     * handed SEO production, a content studio, an outreach agent, prospecting,
     * payroll, inventory and a phone system on day one. That is the "too
     * complicated" problem, and it was the default.
     *
     * Deliberately OUT (all reachable from the Plugins store if wanted):
     *   seo-production, content-studio, outreach, prospects  - agency work
     *   client-onboarding, form-builder, contracts           - agency workflow
     *   payroll, inventory, assets, telephony, vault         - bigger-operation
     *                                                          tools, opt in
     *                                                          when you need them
     */
    plugins: [
      // Winning work
      "leads", "quotes", "quoting-agent",
      // Doing the work
      "jobs", "scheduling", "recurring-jobs", "site-reports", "booking",
      // Getting paid
      "invoicing", "recurring-billing", "expenses",
      // The catalogue behind a quote
      "products", "materials",
      // Keeping in touch, and knowing how it's going
      "messages", "analytics",
      // Hours on a job feed both job costing and a wage
      "timesheets",
    ],
  },
  {
    id: "agency",
    label: "Agency (running Kirei for trade clients)",
    description: "Operate several trade businesses from one login — plus the SEO, content, outreach and retainer tools you sell them.",
    /**
     * The agency hub: everything the trades hub has, plus everything an agency
     * needs on top. A genuine superset, computed rather than listed, so a new
     * module cannot be added to trades and silently missed here.
     *
     * The agency's own clients are trade BUSINESSES, not rows in `customers`
     * — see the console work. Vocabulary keeps those two senses apart.
     */
    plugins: ALL_OPTIONAL,
    /**
     * The agency's OWN workspace speaks agency. A trade business it operates
     * keeps the trades preset and so keeps saying Work Orders and Quotes -
     * which is right: that business really is a trade business.
     */
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
