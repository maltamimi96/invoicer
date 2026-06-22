"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, FileCheck, Users,
  Package, Settings, FileStack, X, ClipboardList, Wrench, Users2, UserPlus, CalendarDays, MessageSquare, Bot, Repeat, HelpCircle, Columns3, TrendingUp, Sparkles,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageSettings, isWorker, ROLE_LABELS } from "@/lib/permissions";
import Image from "next/image";
import { BusinessSwitcher } from "@/components/business/business-switcher";

type FeatureFlag = "quotingAgent";
type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  worker?: boolean;
  /** Only show when this feature is enabled for the business. */
  feature?: FeatureFlag;
};
type NavSection = { section: string; items: NavItem[] };

const navSections: NavSection[] = [
  { section: "Workspace", items: [
    { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard, worker: true },
    { label: "Assistant",  href: "/assistant",  icon: Sparkles                      },
    { label: "Messages",   href: "/messages",   icon: MessageSquare                 },
    { label: "Tasks",      href: "/tasks",      icon: Columns3                      },
  ]},
  { section: "Sales", items: [
    { label: "Leads",         href: "/leads",         icon: UserPlus                                       },
    { label: "Quoting Agent", href: "/quoting-agent", icon: Sparkles,    feature: "quotingAgent"          },
    { label: "Quotes",        href: "/quotes",        icon: FileCheck                                      },
    { label: "Invoices",      href: "/invoices",      icon: FileText                                       },
    { label: "Site Reports",  href: "/reports",       icon: ClipboardList                                  },
    { label: "Recurring",     href: "/recurring",     icon: Repeat                                         },
    { label: "Recurring billing", href: "/recurring-invoices", icon: Repeat                                 },
  ]},
  { section: "Service", items: [
    { label: "Work Orders",    href: "/work-orders",     icon: Wrench,        worker: true },
    { label: "Schedule",       href: "/schedule",        icon: CalendarDays,  worker: true },
    { label: "Bookings",       href: "/bookings",        icon: CalendarDays                 },
    { label: "Online Booking", href: "/settings/booking", icon: CalendarDays                 },
  ]},
  { section: "Contacts", items: [
    { label: "Customers",  href: "/customers",  icon: Users                         },
    { label: "Contacts",   href: "/contacts",   icon: Users2                        },
  ]},
  { section: "Catalog", items: [
    { label: "Products",   href: "/products",   icon: Package                       },
  ]},
  { section: "Workforce", items: [
    { label: "Team",       href: "/team",       icon: Users2                        },
    { label: "Agents",     href: "/agents",     icon: Bot                           },
  ]},
  { section: "Insights", items: [
    { label: "Analytics",  href: "/analytics",  icon: TrendingUp                    },
  ]},
  { section: "Account", items: [
    { label: "Help",       href: "/help",       icon: HelpCircle,    worker: true   },
  ]},
];

interface AppSidebarProps {
  business: Business;
  businesses: Business[];
  userRole: Role;
  /** Server-fetched flags driving conditional nav items. */
  features?: { quotingAgent?: boolean };
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ business, businesses, userRole, features, open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const workerView = isWorker(userRole);
  const visibleSections = navSections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (workerView && !i.worker) return false;
        if (i.feature === "quotingAgent" && !features?.quotingAgent) return false;
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const content = (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative flex-shrink-0"
          >
            {business.logo_url ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-sidebar-primary/30 shadow-lg shadow-sidebar-primary/10">
                <Image src={business.logo_url} alt={business.name} width={40} height={40} className="object-contain w-full h-full" />
              </div>
            ) : (
              <Image src="/kirei-logo.png" alt="Kirei" width={48} height={48} className="object-contain w-12 h-12" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-sidebar" />
          </motion.div>

          {/* Business switcher */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
            className="flex-1 min-w-0"
          >
            <BusinessSwitcher
              business={business}
              businesses={businesses}
              onClose={onClose}
            />
          </motion.div>

          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="md:hidden flex-shrink-0 p-1 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {visibleSections.map((group, gi) => (
          <div key={group.section} className={cn("flex flex-col gap-px", gi > 0 && "mt-2")}>
            <p className="px-2 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
              {group.section}
            </p>
            {group.items.map((item, i) => {
              const active = isActive(item.href);
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18, delay: (gi * 4 + i) * 0.02, ease: "easeOut" }}
                >
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-sm"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 font-medium"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-rail"
                        className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-full"
                        style={{ backgroundImage: "linear-gradient(180deg, hsl(var(--sidebar-primary)) 0%, hsl(var(--sidebar-primary) / 0.6) 100%)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <item.icon className={cn(
                      "w-4 h-4 flex-shrink-0 transition-colors",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"
                    )} />
                    <span>{item.label}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 pt-2 border-t border-sidebar-border space-y-px">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150",
              pathname.startsWith("/settings")
                ? "bg-sidebar-accent text-sidebar-foreground font-semibold shadow-sm"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 font-medium"
            )}
          >
            {pathname.startsWith("/settings") && (
              <motion.span
                layoutId="sidebar-active-rail"
                className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-full"
                style={{ backgroundImage: "linear-gradient(180deg, hsl(var(--sidebar-primary)) 0%, hsl(var(--sidebar-primary) / 0.6) 100%)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Settings className={cn(
              "w-4 h-4 relative z-10",
              pathname.startsWith("/settings") ? "text-sidebar-primary" : "text-sidebar-foreground/50"
            )} />
            <span className="relative z-10">Settings</span>
          </Link>
        )}

        <div className="flex items-center justify-between px-3 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            {ROLE_LABELS[userRole]}
          </span>
          {/* Kirei platform attribution — logo only, no text, no border */}
          <Image src="/kirei-logo.png" alt="Kirei" width={28} height={28} className="object-contain opacity-70" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop — always visible, part of the flex flow */}
      <aside className="hidden md:flex flex-shrink-0">
        {content}
      </aside>

      {/* Mobile — slide-in overlay */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-30 flex md:hidden"
          >
            {content}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
