import {
  LayoutDashboard, FileText, FileCheck, Users,
  Package, FileStack, ClipboardList, Wrench, Users2, UserPlus, CalendarDays, MessageSquare, Bot, Repeat, HelpCircle, Columns3, TrendingUp, Sparkles, ListChecks, Search, Receipt, Boxes, Clock, Hammer, Target, Megaphone, DollarSign, Send,
} from "@/components/ui/icons";

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
    { label: "Tasks",      href: "/tasks",      icon: Columns3                      },
  ]},
  { section: "Sales", items: [
    { label: "Leads",         href: "/leads",         icon: UserPlus,     plugin: "leads"             },
    { label: "Forms",         href: "/forms",         icon: ListChecks,   plugin: "form-builder"      },
    { label: "Quoting Agent", href: "/quoting-agent", icon: Sparkles,     plugin: "quoting-agent"     },
    { label: "Quotes",        href: "/quotes",        icon: FileCheck,    plugin: "quotes"            },
    { label: "Invoices",      href: "/invoices",      icon: FileText,     plugin: "invoicing"         },
    { label: "Contracts",     href: "/contracts",     icon: FileStack,    plugin: "contracts"         },
    { label: "Site Reports",  href: "/reports",       icon: ClipboardList, plugin: "site-reports"     },
    { label: "Recurring",     href: "/recurring",     icon: Repeat,       plugin: "recurring-jobs"    },
    { label: "Recurring billing", href: "/recurring-invoices", icon: Repeat, plugin: "recurring-billing" },
    { label: "Expenses",      href: "/expenses",      icon: Receipt,      plugin: "expenses"          },
  ]},
  { section: "Service", items: [
    { label: "Work Orders",    href: "/work-orders",     icon: Wrench,        worker: true, plugin: "jobs" },
    { label: "Schedule",       href: "/schedule",        icon: CalendarDays,  worker: true, plugin: "scheduling" },
    { label: "Bookings",       href: "/bookings",        icon: CalendarDays,  plugin: "booking" },
    { label: "Online Booking", href: "/settings/booking", icon: CalendarDays,  plugin: "booking" },
    { label: "Assets",         href: "/assets",          icon: Hammer,        plugin: "assets" },
  ]},
  { section: "Contacts", items: [
    { label: "Prospects",  href: "/prospects",  icon: Target,        plugin: "prospects" },
    { label: "Outreach",   href: "/outreach",   icon: Send,          plugin: "outreach" },
    { label: "Customers",  href: "/customers",  icon: Users                         },
    { label: "Contacts",   href: "/contacts",   icon: Users2                        },
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
    { label: "Payroll",    href: "/payroll",    icon: DollarSign,   plugin: "payroll" },
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
  opts: { workerView: boolean; features?: Record<string, boolean> },
): NavSection[] {
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (opts.workerView && !i.worker) return false;
        if (i.plugin && !opts.features?.[i.plugin]) return false;
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);
}
