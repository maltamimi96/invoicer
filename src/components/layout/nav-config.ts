import {
  Zap, Lock, Building2,
  LayoutDashboard, FileText, FileCheck, Users,
  Package, FileStack, ClipboardList, Wrench, Users2, UserPlus, CalendarDays, MessageSquare, Bot, Repeat, HelpCircle, Columns3, TrendingUp, Sparkles, ListChecks, Search, Receipt, Boxes, Clock, Hammer, Target, Megaphone, DollarSign, Send, Phone,
} from "@/components/ui/icons";
import { applyOrder, isHidden, type NavConfig } from "@/lib/nav/config";

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  worker?: boolean;
  /** Owning plugin id (src/lib/plugins/registry.ts). Untagged = core, always shown. */
  plugin?: string;
};
export type NavSection = {
  section: string;
  items: NavItem[];
  /** Folded away behind a "More" toggle until opened. */
  collapsed?: boolean;
};

export const navSections: NavSection[] = [
  // Five sections that follow the shape of the work — win it, deliver it, get
  // paid — plus the workspace you sit in and a drawer for everything else.
  //
  // This replaced eleven sections, four of which held a single row. Every href
  // below is unchanged: labels, hidden rows and ordering all persist keyed by
  // href (lib/nav/config.ts), so a business's own customisations survive the
  // regroup and its label overrides still win over these defaults.
  { section: "Workspace", items: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard, worker: true },
    { label: "Assistant",  href: "/assistant",  icon: Sparkles                      },
    { label: "Messages",   href: "/messages",   icon: MessageSquare,   plugin: "messages" },
    { label: "Calls",      href: "/calls",      icon: Phone,           plugin: "telephony" },
    { label: "Tasks",      href: "/tasks",      icon: Columns3                      },
  ]},
  { section: "Win work", items: [
    { label: "Leads",      href: "/leads",      icon: UserPlus,     plugin: "leads"        },
    { label: "Quotes",     href: "/quotes",     icon: FileCheck,    plugin: "quotes"       },
    { label: "Prospects",  href: "/prospects",  icon: Target,       plugin: "prospects"    },
    { label: "Outreach",   href: "/outreach",   icon: Send,         plugin: "outreach"     },
    { label: "Forms",      href: "/forms",      icon: ListChecks,   plugin: "form-builder" },
    { label: "Contracts",  href: "/contracts",  icon: FileStack,    plugin: "contracts"    },
  ]},
  { section: "Deliver", items: [
    { label: "Work Orders",     href: "/work-orders", icon: Wrench,        worker: true, plugin: "jobs" },
    { label: "Schedule",        href: "/schedule",    icon: CalendarDays,  worker: true, plugin: "scheduling" },
    { label: "Bookings",        href: "/bookings",    icon: CalendarDays,  plugin: "booking" },
    { label: "Site Reports",    href: "/reports",     icon: ClipboardList, plugin: "site-reports" },
    // "Recurring" three times over, in three sections, was unreadable — each
    // one now says what recurs. The hrefs are untouched.
    { label: "Recurring jobs",  href: "/recurring",   icon: Repeat,        plugin: "recurring-jobs" },
  ]},
  { section: "Money", items: [
    { label: "Invoices",           href: "/invoices",            icon: FileText,   plugin: "invoicing" },
    { label: "Recurring invoices", href: "/recurring-invoices",  icon: Repeat,     plugin: "recurring-billing" },
    { label: "Expenses",           href: "/expenses",            icon: Receipt,    plugin: "expenses" },
    { label: "Recurring expenses", href: "/expenses/recurring",  icon: Repeat,     plugin: "expenses" },
    { label: "Payroll",            href: "/payroll",             icon: DollarSign, plugin: "payroll" },
  ]},
  { section: "People", items: [
    { label: "Customers",       href: "/customers",        icon: Users                          },
    { label: "Contacts",        href: "/contacts",         icon: Users2                         },
    { label: "Client accounts", href: "/agency",           icon: Building2,     plugin: "agency-console" },
    { label: "Onboarding",      href: "/onboarding-forms", icon: ClipboardList, plugin: "client-onboarding" },
    { label: "Passwords",       href: "/vault",            icon: Lock,          plugin: "vault" },
    { label: "Team",            href: "/team",             icon: Users2                         },
  ]},
  // Collapsed by default. Everything stays one click away; it just stops
  // competing with the rows people open every day.
  { section: "More", collapsed: true, items: [
    { label: "Products",       href: "/products",      icon: Package,    plugin: "products" },
    { label: "Materials",      href: "/materials",     icon: Package,    plugin: "materials" },
    { label: "Inventory",      href: "/inventory",     icon: Boxes,      plugin: "inventory" },
    { label: "Assets",         href: "/assets",        icon: Hammer,     plugin: "assets" },
    { label: "Timesheets",     href: "/timesheets",    icon: Clock,      plugin: "timesheets" },
    { label: "Automations",    href: "/automations",   icon: Zap,        plugin: "automations" },
    { label: "Analytics",      href: "/analytics",     icon: TrendingUp, plugin: "analytics" },
    { label: "SEO Production", href: "/seo",           icon: Search,     plugin: "seo-production" },
    { label: "Content Studio", href: "/content",       icon: Megaphone,  plugin: "content-studio" },
    { label: "Quoting Agent",  href: "/quoting-agent", icon: Sparkles,   plugin: "quoting-agent" },
    { label: "Plugins",        href: "/agents",        icon: Bot                              },
    { label: "Help",           href: "/help",          icon: HelpCircle, worker: true          },
  ]},
];

/** Filter nav sections by worker role + enabled plugins, dropping empty sections. */
export function filterNav(
  sections: NavSection[],
  opts: {
    workerView: boolean;
    features?: Record<string, boolean>;
    /** The business's own hide/reorder choices. Ordering is within a section:
     *  sections keep their built-in order so an item can't be reordered out of
     *  the group that explains what it is. */
    nav?: NavConfig | null;
  },
): NavSection[] {
  return sections
    .map((s) => ({
      ...s,
      items: applyOrder(
        s.items.filter((i) => {
          if (opts.workerView && !i.worker) return false;
          if (i.plugin && !opts.features?.[i.plugin]) return false;
          // A worker's nav is not the owner's to prune — hiding is a
          // preference, and a worker hidden out of their own jobs list has no
          // way to get it back.
          if (!opts.workerView && isHidden(i.href, opts.nav)) return false;
          return true;
        }),
        opts.nav,
      ),
    }))
    .filter((s) => s.items.length > 0);
}
