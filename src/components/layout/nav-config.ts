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
export type NavSection = { section: string; items: NavItem[] };

export const navSections: NavSection[] = [
  { section: "Workspace", items: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard, worker: true },
    { label: "Assistant",  href: "/assistant",  icon: Sparkles                      },
    { label: "Messages",   href: "/messages",   icon: MessageSquare,   plugin: "messages" },
    { label: "Calls",      href: "/calls",      icon: Phone,           plugin: "telephony" },
    { label: "Tasks",      href: "/tasks",      icon: Columns3                      },
    { label: "Automations",href: "/automations",icon: Zap,             plugin: "automations" },
  ]},
  // Sections follow the same needs the Plugins store groups by: win the work,
  // do the work, get paid. Expenses used to sit under "Sales", which is the
  // one place money going OUT does not belong.
  { section: "Sales", items: [
    { label: "Leads",         href: "/leads",         icon: UserPlus,     plugin: "leads"             },
    { label: "Forms",         href: "/forms",         icon: ListChecks,   plugin: "form-builder"      },
    { label: "Quoting Agent", href: "/quoting-agent", icon: Sparkles,     plugin: "quoting-agent"     },
    { label: "Quotes",        href: "/quotes",        icon: FileCheck,    plugin: "quotes"            },
    { label: "Contracts",     href: "/contracts",     icon: FileStack,    plugin: "contracts"         },
  ]},
  { section: "Service", items: [
    { label: "Work Orders",    href: "/work-orders",     icon: Wrench,        worker: true, plugin: "jobs" },
    { label: "Schedule",       href: "/schedule",        icon: CalendarDays,  worker: true, plugin: "scheduling" },
    { label: "Recurring",      href: "/recurring",       icon: Repeat,        plugin: "recurring-jobs" },
    { label: "Site Reports",   href: "/reports",         icon: ClipboardList, plugin: "site-reports" },
    { label: "Bookings",       href: "/bookings",        icon: CalendarDays,  plugin: "booking" },
    { label: "Online Booking", href: "/settings/booking", icon: CalendarDays,  plugin: "booking" },
    { label: "Assets",         href: "/assets",          icon: Hammer,        plugin: "assets" },
  ]},
  { section: "Money", items: [
    { label: "Invoices",      href: "/invoices",      icon: FileText,     plugin: "invoicing"         },
    { label: "Recurring billing", href: "/recurring-invoices", icon: Repeat, plugin: "recurring-billing" },
    { label: "Expenses",      href: "/expenses",      icon: Receipt,      plugin: "expenses"          },
    { label: "Recurring costs", href: "/expenses/recurring", icon: Repeat, plugin: "expenses"        },
    { label: "Payroll",       href: "/payroll",       icon: DollarSign,   plugin: "payroll"           },
  ]},
  { section: "Contacts", items: [
    { label: "Prospects",  href: "/prospects",  icon: Target,        plugin: "prospects" },
    { label: "Outreach",   href: "/outreach",   icon: Send,          plugin: "outreach" },
    { label: "Client accounts", href: "/agency", icon: Building2, plugin: "agency-console" },
    { label: "Customers",  href: "/customers",  icon: Users                         },
    { label: "Contacts",   href: "/contacts",   icon: Users2                        },
    { label: "Passwords",  href: "/vault",      icon: Lock,          plugin: "vault" },
    { label: "Onboarding", href: "/onboarding-forms", icon: ClipboardList, plugin: "client-onboarding" },
  ]},
  { section: "Catalog", items: [
    { label: "Products",   href: "/products",   icon: Package,       plugin: "products" },
    { label: "Materials",  href: "/materials",  icon: Package,       plugin: "materials" },
    { label: "Inventory",  href: "/inventory",  icon: Boxes,         plugin: "inventory" },
  ]},
  { section: "Workforce", items: [
    { label: "Team",       href: "/team",       icon: Users2                        },
    { label: "Timesheets", href: "/timesheets", icon: Clock,        plugin: "timesheets" },
    { label: "Plugins",    href: "/agents",     icon: Bot                           },
  ]},
  { section: "SEO", items: [
    { label: "SEO Production", href: "/seo", icon: Search, plugin: "seo-production" },
  ]},
  { section: "Content", items: [
    { label: "Content Studio", href: "/content", icon: Megaphone, plugin: "content-studio" },
  ]},
  { section: "Insights", items: [
    { label: "Analytics",  href: "/analytics",  icon: TrendingUp,    plugin: "analytics" },
  ]},
  { section: "Account", items: [
    { label: "Help",       href: "/help",       icon: HelpCircle,    worker: true   },
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
