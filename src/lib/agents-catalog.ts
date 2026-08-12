export type AgentCategory = "productivity" | "leads" | "integrations" | "billing" | "communication";
export type AgentBadge = "new" | "beta";

/**
 * configType controls what happens when a user clicks "Configure":
 *   none       — no extra config needed
 *   email-config — links to Settings > Email tab
 *   api-key    — links to Settings > API Keys tab
 *   inline     — future: opens an inline config panel
 */
export type AgentConfigType = "none" | "email-config" | "api-key" | "inline";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  /** Lucide icon component name (lowercase-kebab) */
  icon: string;
  category: AgentCategory;
  configType: AgentConfigType;
  /** Deep-link into settings if configType requires navigation */
  configPath?: string;
  badge?: AgentBadge;
}

/**
 * What belongs in here: things that DO WORK ON THEIR OWN — on a schedule, or off
 * a trigger, without anyone opening a page. A cron that emails overdue invoices
 * is an agent. A form builder is not; that's a module you use, and it lives in
 * the plugin registry.
 *
 * Two rules learned the hard way:
 *   - Nothing ships here without an implementation. Four entries once sat in
 *     production badged "coming soon" with not one line of code behind them.
 *   - Nothing appears here AND in src/lib/plugins/registry.ts. Client
 *     Onboarding and Form Builder were in both, so the same feature showed up
 *     twice with two different mental models attached.
 */
export const AGENT_CATALOG: AgentDefinition[] = [
  // ── Productivity ────────────────────────────────────────────────────────────
  {
    id: "ai-chat",
    name: "AI Assistant",
    description: "Natural language assistant for managing your entire business.",
    longDescription:
      "Chat with an AI that can create invoices, quotes, customers, work orders, reports and more — all in plain English. The assistant lives in the floating panel on every page.",
    icon: "bot",
    category: "productivity",
    configType: "none",
    badge: "new",
  },
  {
    id: "daily-digest",
    name: "Daily Business Digest",
    description: "Receive a morning email summary of revenue, leads, overdue invoices, and today's jobs.",
    longDescription:
      "Every morning, get a clean email digest with your key business metrics: payments collected today, monthly revenue, overdue invoices, pending quotes, new leads, and the day's scheduled jobs.",
    icon: "newspaper",
    category: "productivity",
    configType: "none",
  },

  // ── Leads ───────────────────────────────────────────────────────────────────
  {
    id: "email-lead-scanner",
    name: "Email Lead Scanner",
    description: "Automatically scan your inbox and extract new leads with AI.",
    longDescription:
      "Connect your email inbox and let AI classify every incoming message. Genuine customer enquiries are automatically turned into leads — complete with name, phone, service type, and suburb.",
    icon: "mail-search",
    category: "leads",
    configType: "email-config",
    configPath: "/settings?tab=email",
  },
  {
    id: "invoice-reminders",
    name: "Invoice Reminder Agent",
    description: "Automatically email customers when their invoice becomes overdue.",
    longDescription:
      "Every day, the agent finds overdue invoices and sends polite payment reminders to customers. Each invoice is reminded at most once every 3 days to avoid spamming.",
    icon: "bell-ring",
    category: "billing",
    configType: "none",
  },
  {
    id: "quote-followup",
    name: "Quote Follow-up Agent",
    description: "Chase up sent quotes that are about to expire or just expired.",
    longDescription:
      "Automatically follows up with customers on quotes that are expiring within 3 days or recently expired. Keeps your pipeline moving without manual chasing.",
    icon: "file-clock",
    category: "billing",
    configType: "none",
  },

  // ── Communication ───────────────────────────────────────────────────────────
  {
    id: "workorder-complete-notifier",
    name: "Job Completion Notifier",
    description: "Email customers automatically when a work order is marked complete.",
    longDescription:
      "As soon as a work order is completed, the agent sends the customer a professional completion summary — great for closing the loop and prompting reviews.",
    icon: "check-circle",
    category: "communication",
    configType: "none",
  },
  {
    id: "api-agent",
    name: "External API Agent",
    description: "Expose your business AI via API for Telegram, SMS, and third-party apps.",
    longDescription:
      "Create scoped API keys and connect external services — Telegram bots, SMS autoresponders, website widgets — directly to your business AI. Supports natural language queries and all core actions.",
    icon: "plug-zap",
    category: "integrations",
    configType: "api-key",
    configPath: "/settings?tab=api-keys",
  },
];

export const CATEGORY_LABELS: Record<AgentCategory, string> = {
  productivity: "Productivity",
  leads: "Leads",
  integrations: "Integrations",
  billing: "Billing",
  communication: "Communication",
};

export const BADGE_LABELS: Record<AgentBadge, string> = {
  new: "New",
  beta: "Beta",
};
