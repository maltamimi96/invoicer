/**
 * Plugin registry — Kirei's module system (docs/SEO_AGENCY_PLAN.md, Phase 0).
 *
 * Every major module is a plugin a business can enable/disable. State lives in
 * `business_agent_installs` (one row per (business_id, plugin_id)) — the same
 * table the /agents store has always used, so nothing migrates.
 *
 * DATA-SAFETY SEMANTICS (the important part):
 *   enabled(plugin) = settingsTable.enabled   — when the plugin has a legacy
 *                                               settings table (authoritative)
 *                   ?? installRow.enabled     — explicit user choice
 *                   ?? defaultEnabled         — NO ROW = TODAY'S BEHAVIOR
 *
 * Legacy modules default to enabled, so existing businesses see zero change
 * until they (or a preset) explicitly toggle something. Disabling only hides
 * nav + gates routes — it NEVER deletes data; re-enabling restores everything.
 *
 * Plain module — safe to import from server components, actions, and MCP.
 */

export type PluginKind = "module" | "agent";
export type PluginCategory =
  | "core" | "sales" | "service" | "contacts" | "catalog"
  | "communication" | "insights" | "automation" | "seo";

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  kind: PluginKind;
  category: PluginCategory;
  /** Core plugins are always on and cannot be disabled. */
  core?: boolean;
  /** Behavior when a business has no install row (legacy = true). */
  defaultEnabled: boolean;
  /** Plugins that must be enabled for this one to work. */
  dependencies?: string[];
  /** Dashboard route prefixes owned by this plugin (route-level gating). */
  routePrefixes?: string[];
  /** Icon name for the Plugins store (mapped in the store's ICON_MAP). */
  icon?: string;
  /** Legacy per-feature settings table that stays authoritative for enabled. */
  settingsTable?: "quoting_agent_settings" | "onboarding_settings" | "form_builder_settings";
}

export const PLUGIN_REGISTRY: PluginDefinition[] = [
  // ── Core (always on) ───────────────────────────────────────────────────────
  { id: "dashboard", icon: "layout-dashboard",  name: "Dashboard",     description: "Business overview, KPIs and activity.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/dashboard"] },
  { id: "assistant", icon: "sparkles",  name: "AI Assistant",  description: "Run the business by chat or voice.",     kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/assistant"] },
  { id: "customers", icon: "users",  name: "Customers & Contacts", description: "Client records, sites, notes and portal links.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/customers", "/contacts", "/sites"] },
  { id: "tasks", icon: "columns",      name: "Tasks",         description: "Kanban board for the team's work.",      kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/tasks"] },
  { id: "team", icon: "users-2",       name: "Team",          description: "Members, roles and workforce profiles.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/team"] },
  { id: "settings", icon: "settings",   name: "Settings",      description: "Business profile, appearance, API keys.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/settings", "/agents"] },

  // ── Sales ──────────────────────────────────────────────────────────────────
  { id: "leads", icon: "user-plus",      name: "Leads",         description: "Capture and work the sales pipeline.",   kind: "module", category: "sales", defaultEnabled: true, routePrefixes: ["/leads"] },
  { id: "quotes", icon: "file-check",     name: "Quotes",        description: "Build and send quotes customers accept online.", kind: "module", category: "sales", defaultEnabled: true, routePrefixes: ["/quotes"] },
  { id: "invoicing", icon: "file-text",  name: "Invoices",      description: "Invoice, take payments, track balances.", kind: "module", category: "sales", defaultEnabled: true, routePrefixes: ["/invoices"] },
  { id: "recurring-billing", icon: "repeat", name: "Recurring billing", description: "Subscription invoices that bill (and auto-charge) on a schedule.", kind: "module", category: "sales", defaultEnabled: true, dependencies: ["invoicing"], routePrefixes: ["/recurring-invoices"] },
  { id: "contracts", icon: "file-stack",  name: "Contracts",     description: "Contracts with free in-app e-signature.", kind: "module", category: "sales", defaultEnabled: true, routePrefixes: ["/contracts"] },
  { id: "site-reports", icon: "clipboard-list", name: "Site Reports", description: "Client-facing inspection / scope-of-work PDFs.", kind: "module", category: "sales", defaultEnabled: true, routePrefixes: ["/reports"] },

  // ── Service / field ops ────────────────────────────────────────────────────
  { id: "jobs", icon: "wrench",       name: "Work Orders",   description: "Jobs with photos, time, materials and timelines.", kind: "module", category: "service", defaultEnabled: true, routePrefixes: ["/work-orders"] },
  { id: "scheduling", icon: "calendar-days", name: "Schedule",      description: "Calendar and dispatch board for the crew.", kind: "module", category: "service", defaultEnabled: true, dependencies: ["jobs"], routePrefixes: ["/schedule"] },
  { id: "recurring-jobs", icon: "repeat", name: "Recurring jobs", description: "Repeating jobs that generate work orders (and optionally invoices).", kind: "module", category: "service", defaultEnabled: true, dependencies: ["jobs"], routePrefixes: ["/recurring"] },
  { id: "booking", icon: "calendar-days",    name: "Online booking", description: "Public booking pages with reminders.",   kind: "module", category: "service", defaultEnabled: true, routePrefixes: ["/bookings"] },

  { id: "expenses", icon: "receipt", name: "Expenses", description: "Track job & business costs with receipts — true profit per job.", kind: "module", category: "service", defaultEnabled: false, routePrefixes: ["/expenses"] },

  // ── Catalog / comms / insights ────────────────────────────────────────────
  { id: "products", icon: "package",   name: "Products",      description: "Price list used across quotes and invoices.", kind: "module", category: "catalog", defaultEnabled: true, routePrefixes: ["/products"] },
  { id: "inventory", icon: "boxes", name: "Inventory", description: "Track stock on hand, reorder points and usage per job.", kind: "module", category: "catalog", defaultEnabled: false, dependencies: ["products"], routePrefixes: ["/inventory"] },
  { id: "messages", icon: "message-square",   name: "Messages",      description: "Customer conversations in one inbox.",   kind: "module", category: "communication", defaultEnabled: true, routePrefixes: ["/messages"] },
  { id: "analytics", icon: "trending-up",  name: "Analytics",     description: "Revenue and pipeline insight.",          kind: "module", category: "insights", defaultEnabled: true, routePrefixes: ["/analytics"] },

  // ── Feature-flagged verticals (existing plugins; settings table authoritative) ─
  { id: "quoting-agent", icon: "sparkles",     name: "Quoting Agent",     description: "AI that learns your pricing and writes quotes.", kind: "module", category: "automation", defaultEnabled: false, settingsTable: "quoting_agent_settings", routePrefixes: ["/quoting-agent"] },
  { id: "client-onboarding", icon: "clipboard-list", name: "Client Onboarding", description: "Custom intake forms customers fill in via the portal.", kind: "module", category: "contacts", defaultEnabled: false, settingsTable: "onboarding_settings", routePrefixes: ["/onboarding-forms"] },
  { id: "form-builder", icon: "list-checks",      name: "Form Builder",      description: "Public lead-capture forms to share or embed.", kind: "module", category: "sales", defaultEnabled: false, settingsTable: "form_builder_settings", routePrefixes: ["/forms"] },

  // ── SEO vertical (docs/SEO_AGENCY_PLAN.md, Phase 2) ─────────────────────────
  { id: "seo-production", icon: "trending-up", name: "SEO Production", description: "Manage client sites: connectors, opportunity queue, content pipeline and reporting.", kind: "module", category: "seo", defaultEnabled: false, routePrefixes: ["/seo"] },
];

export const PLUGINS_BY_ID: Record<string, PluginDefinition> =
  Object.fromEntries(PLUGIN_REGISTRY.map((p) => [p.id, p]));

/** Optional (non-core) plugins — the toggleable surface. */
export const OPTIONAL_PLUGINS = PLUGIN_REGISTRY.filter((p) => !p.core);

/** Route-prefix → plugin id, for route-level gating (optional plugins only). */
export const ROUTE_GATES: Array<{ prefix: string; pluginId: string }> =
  OPTIONAL_PLUGINS.flatMap((p) => (p.routePrefixes ?? []).map((prefix) => ({ prefix, pluginId: p.id })));

/** Enabled plugins that list `pluginId` as a dependency (blocks disabling it). */
export function dependentsOf(pluginId: string, enabled: Record<string, boolean>): PluginDefinition[] {
  return PLUGIN_REGISTRY.filter(
    (p) => p.dependencies?.includes(pluginId) && (enabled[p.id] ?? p.defaultEnabled)
  );
}

/**
 * Resolve the enabled map for a business from its install rows + legacy
 * settings flags. `installRows` = business_agent_installs; `settingsFlags` =
 * { quoting_agent_settings: bool|null, ... } (null = no row).
 */
export function resolveEnabledPlugins(
  installRows: Array<{ agent_id: string; enabled: boolean }>,
  settingsFlags: Partial<Record<NonNullable<PluginDefinition["settingsTable"]>, boolean | null>>
): Record<string, boolean> {
  const byId = new Map(installRows.map((r) => [r.agent_id, r.enabled]));
  const out: Record<string, boolean> = {};
  for (const p of PLUGIN_REGISTRY) {
    if (p.core) { out[p.id] = true; continue; }
    if (p.settingsTable) {
      const flag = settingsFlags[p.settingsTable];
      out[p.id] = flag ?? byId.get(p.id) ?? p.defaultEnabled;
      continue;
    }
    out[p.id] = byId.get(p.id) ?? p.defaultEnabled;
  }
  return out;
}
