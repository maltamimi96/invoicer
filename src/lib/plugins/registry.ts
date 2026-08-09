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

/**
 * Categories are grouped by the JOB a module does, not by the part of the
 * codebase it lives in. Someone opening the Plugins store is asking "what do I
 * need?", not "which table does this write to" — so Expenses sits with getting
 * paid, and Timesheets sits with delivering the work, even though both are
 * "service" code.
 */
export type PluginCategory =
  | "core"       // always on
  | "win-work"   // finding and closing work
  | "deliver"    // doing the work once it's won
  | "money"      // money in and money out
  | "clients"    // looking after the people you work for
  | "catalog"    // what you sell and what it costs you
  | "grow"       // making the business bigger
  | "automate";  // making the busywork happen by itself

/** Display order + the one line that says what the group is for. */
export const PLUGIN_CATEGORIES: Array<{
  id: PluginCategory; label: string; blurb: string;
}> = [
  { id: "core",     label: "Foundations",   blurb: "Always on — the parts every business uses." },
  { id: "win-work", label: "Winning work",  blurb: "Finding leads, quoting them, and getting a yes." },
  { id: "deliver",  label: "Doing the work", blurb: "Scheduling crews, running jobs, proving what was done." },
  { id: "money",    label: "Money in & out", blurb: "Invoicing, getting paid, and knowing what it cost." },
  { id: "clients",  label: "Your clients",  blurb: "Onboarding, conversations, and what you hold for them." },
  { id: "catalog",  label: "What you sell", blurb: "Prices, materials and stock." },
  { id: "grow",     label: "Growing",       blurb: "Marketing, search and the numbers behind them." },
  { id: "automate", label: "Automation",    blurb: "Work that happens without anyone doing it." },
];

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
  settingsTable?: "quoting_agent_settings" | "onboarding_settings" | "form_builder_settings" | "automations_settings" | "vault_settings";
}

export const PLUGIN_REGISTRY: PluginDefinition[] = [
  // ── Core (always on) ───────────────────────────────────────────────────────
  { id: "dashboard", icon: "layout-dashboard",  name: "Dashboard",     description: "Business overview, KPIs and activity.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/dashboard"] },
  { id: "assistant", icon: "sparkles",  name: "AI Assistant",  description: "Run the business by chat or voice.",     kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/assistant"] },
  { id: "customers", icon: "users",  name: "Customers & Contacts", description: "Client records, sites, notes and portal links.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/customers", "/contacts", "/sites"] },
  { id: "tasks", icon: "columns",      name: "Tasks",         description: "Kanban board for the team's work.",      kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/tasks"] },
  { id: "team", icon: "users-2",       name: "Team",          description: "Members, roles and workforce profiles.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/team"] },
  { id: "settings", icon: "settings",   name: "Settings",      description: "Business profile, appearance, API keys.", kind: "module", category: "core", core: true, defaultEnabled: true, routePrefixes: ["/settings", "/agents"] },

  // ── Winning work ───────────────────────────────────────────────────────────
  { id: "prospects", icon: "target", name: "Prospects", description: "Cold-list of prospects — import, bulk-reach-out and convert to leads.", kind: "module", category: "win-work", defaultEnabled: false, routePrefixes: ["/prospects"] },
  { id: "outreach", icon: "send", name: "Outreach Agent", description: "Automated multi-step cold-email sequences over your prospect list, with full open/click/bounce tracking.", kind: "module", category: "win-work", defaultEnabled: false, dependencies: ["prospects"], routePrefixes: ["/outreach"] },
  { id: "leads", icon: "user-plus",      name: "Leads",         description: "Capture and work the sales pipeline.",   kind: "module", category: "win-work", defaultEnabled: true, routePrefixes: ["/leads"] },
  { id: "quotes", icon: "file-check",     name: "Quotes",        description: "Build and send quotes customers accept online.", kind: "module", category: "win-work", defaultEnabled: true, routePrefixes: ["/quotes"] },
  { id: "invoicing", icon: "file-text",  name: "Invoices",      description: "Invoice, take payments, track balances.", kind: "module", category: "money", defaultEnabled: true, routePrefixes: ["/invoices"] },
  { id: "recurring-billing", icon: "repeat", name: "Recurring billing", description: "Subscription invoices that bill (and auto-charge) on a schedule.", kind: "module", category: "money", defaultEnabled: true, dependencies: ["invoicing"], routePrefixes: ["/recurring-invoices"] },
  { id: "contracts", icon: "file-stack",  name: "Contracts",     description: "Contracts with free in-app e-signature.", kind: "module", category: "win-work", defaultEnabled: true, routePrefixes: ["/contracts"] },
  { id: "site-reports", icon: "clipboard-list", name: "Site Reports", description: "Client-facing inspection / scope-of-work PDFs.", kind: "module", category: "deliver", defaultEnabled: true, routePrefixes: ["/reports"] },

  // ── Doing the work, and what it costs ──────────────────────────────────────
  { id: "jobs", icon: "wrench",       name: "Work Orders",   description: "Jobs with photos, time, materials and timelines.", kind: "module", category: "deliver", defaultEnabled: true, routePrefixes: ["/work-orders"] },
  { id: "scheduling", icon: "calendar-days", name: "Schedule",      description: "Calendar and dispatch board for the crew.", kind: "module", category: "deliver", defaultEnabled: true, dependencies: ["jobs"], routePrefixes: ["/schedule"] },
  { id: "recurring-jobs", icon: "repeat", name: "Recurring jobs", description: "Repeating jobs that generate work orders (and optionally invoices).", kind: "module", category: "deliver", defaultEnabled: true, dependencies: ["jobs"], routePrefixes: ["/recurring"] },
  { id: "timesheets", icon: "clock", name: "Timesheets", description: "Weekly hours per worker from job time, with pay + CSV export.", kind: "module", category: "deliver", defaultEnabled: false, routePrefixes: ["/timesheets"] },
  { id: "assets", icon: "hammer", name: "Assets & equipment", description: "Track tools, vehicles and equipment with service schedules.", kind: "module", category: "deliver", defaultEnabled: false, routePrefixes: ["/assets"] },
  { id: "booking", icon: "calendar-days",    name: "Online booking", description: "Public booking pages with reminders.",   kind: "module", category: "win-work", defaultEnabled: true, routePrefixes: ["/bookings"] },

  { id: "expenses", icon: "receipt", name: "Expenses", description: "Track job & business costs with receipts — true profit per job.", kind: "module", category: "money", defaultEnabled: false, routePrefixes: ["/expenses"] },
  { id: "payroll", icon: "dollar-sign", name: "Payroll", description: "Pay runs from timesheet hours — payslips, super, and wages posted to expenses.", kind: "module", category: "money", defaultEnabled: false, routePrefixes: ["/payroll"] },

  // ── What you sell · client comms · the numbers ─────────────────────────────
  { id: "products", icon: "package",   name: "Products",      description: "Price list used across quotes and invoices.", kind: "module", category: "catalog", defaultEnabled: true, routePrefixes: ["/products"] },
  { id: "materials", icon: "package",  name: "Materials",     description: "Cost-price catalog of materials, used as an internal reference when pricing jobs.", kind: "module", category: "catalog", defaultEnabled: false, routePrefixes: ["/materials"] },
  { id: "inventory", icon: "boxes", name: "Inventory", description: "Track stock on hand, reorder points and usage per job.", kind: "module", category: "catalog", defaultEnabled: false, dependencies: ["products"], routePrefixes: ["/inventory"] },
  { id: "telephony", icon: "phone", name: "Phone system (VoIPcloud)", description: "Log every call against the customer, turn missed calls and voicemail into follow-ups.", kind: "module", category: "clients", defaultEnabled: false, routePrefixes: ["/calls"] },
  { id: "messages", icon: "message-square",   name: "Messages",      description: "Customer conversations in one inbox.",   kind: "module", category: "clients", defaultEnabled: true, routePrefixes: ["/messages"] },
  { id: "analytics", icon: "trending-up",  name: "Analytics",     description: "Revenue and pipeline insight.",          kind: "module", category: "grow", defaultEnabled: true, routePrefixes: ["/analytics"] },

  // ── Feature-flagged verticals (existing plugins; settings table authoritative) ─
  { id: "quoting-agent", icon: "sparkles",     name: "Quoting Agent",     description: "AI that learns your pricing and writes quotes.", kind: "module", category: "automate", defaultEnabled: false, settingsTable: "quoting_agent_settings", routePrefixes: ["/quoting-agent"] },
  { id: "client-onboarding", icon: "clipboard-list", name: "Client Onboarding", description: "Custom intake forms customers fill in via the portal.", kind: "module", category: "clients", defaultEnabled: false, settingsTable: "onboarding_settings", routePrefixes: ["/onboarding-forms"] },
  { id: "form-builder", icon: "list-checks",      name: "Form Builder",      description: "Public lead-capture forms to share or embed.", kind: "module", category: "win-work", defaultEnabled: false, settingsTable: "form_builder_settings", routePrefixes: ["/forms"] },

  { id: "agency-console", icon: "building-2", name: "Client accounts", description: "Every business you run on one screen — who is overdue, what is booked, who has gone quiet.", kind: "module", category: "clients", defaultEnabled: false, routePrefixes: ["/agency"] },
  { id: "vault", icon: "lock", name: "Password vault", description: "Store the account logins you hold for clients — encrypted, owner/admin only, every reveal logged.", kind: "module", category: "clients", defaultEnabled: false, settingsTable: "vault_settings", routePrefixes: ["/vault"] },
  { id: "automations", icon: "zap", name: "Automations", description: "When something happens, do something: email a new client their onboarding form, text a customer when a job is done.", kind: "module", category: "automate", defaultEnabled: false, settingsTable: "automations_settings", routePrefixes: ["/automations"] },

  // ── SEO vertical (docs/SEO_AGENCY_PLAN.md, Phase 2) ─────────────────────────
  { id: "seo-production", icon: "trending-up", name: "SEO Production", description: "Manage client sites: connectors, opportunity queue, content pipeline and reporting.", kind: "module", category: "grow", defaultEnabled: false, routePrefixes: ["/seo"] },

  // ── Content Studio — social/marketing content for clients ───────────────────
  { id: "content-studio", icon: "megaphone", name: "Content Studio", description: "Research a client's niche, then generate video scripts, posts, hooks and campaigns — multiple angles, rendered per platform.", kind: "module", category: "grow", defaultEnabled: false, routePrefixes: ["/content"] },
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
