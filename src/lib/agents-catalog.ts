export type AgentCategory = "productivity" | "leads" | "integrations" | "billing" | "communication";
export type AgentBadge = "new" | "beta" | "coming-soon";

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

export const AGENT_CATALOG: AgentDefinition[] = [
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
  {
    id: "invoice-reminders",
    name: "Invoice Reminder Agent",
    description: "Automatically send payment reminders for overdue invoices.",
    longDescription:
      "Set reminder schedules and let the agent email your customers before and after invoice due dates. Reduces chasing and improves cash flow.",
    icon: "bell-ring",
    category: "billing",
    configType: "inline",
    badge: "coming-soon",
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    description: "Receive lead notifications and manage your business via Telegram.",
    longDescription:
      "Connect a Telegram bot to get instant lead alerts and send commands to your business AI directly from the Telegram app.",
    icon: "send",
    category: "communication",
    configType: "inline",
    badge: "coming-soon",
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
  "coming-soon": "Coming Soon",
};
