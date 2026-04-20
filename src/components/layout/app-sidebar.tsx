"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, FileCheck, Users,
  Package, Settings, ChevronRight, FileStack, X, ClipboardList, Wrench, Users2, UserPlus, CalendarDays, MessageSquare, Bot, Repeat, HelpCircle
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageSettings, ROLE_LABELS } from "@/lib/permissions";
import Image from "next/image";
import { BusinessSwitcher } from "@/components/business/business-switcher";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Invoices",  href: "/invoices",  icon: FileText },
  { label: "Quotes",    href: "/quotes",    icon: FileCheck },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Products",  href: "/products",  icon: Package },
  { label: "Schedule",    href: "/schedule",    icon: CalendarDays },
  { label: "Recurring",   href: "/recurring",   icon: Repeat },
  { label: "Leads",       href: "/leads",       icon: UserPlus },
  { label: "Reports",     href: "/reports",     icon: ClipboardList },
  { label: "Work Orders", href: "/work-orders", icon: Wrench },
  { label: "Messages",    href: "/messages",    icon: MessageSquare },
  { label: "Team",        href: "/team",        icon: Users2 },
  { label: "Agents",      href: "/agents",      icon: Bot },
  { label: "Help",        href: "/help",        icon: HelpCircle },
];

interface AppSidebarProps {
  business: Business;
  businesses: Business[];
  userRole: Role;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ business, businesses, userRole, open, onClose }: AppSidebarProps) {
  const pathname = usePathname();

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
              <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 ring-2 ring-sidebar-primary/30 flex items-center justify-center">
                <FileStack className="w-5 h-5 text-sidebar-primary" />
              </div>
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
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Menu
        </p>
        <ul className="space-y-0.5">
          {navItems.map((item, i) => (
            <li key={item.href}>
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: i * 0.04, ease: "easeOut" }}
              >
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150",
                    isActive(item.href)
                      ? "text-sidebar-primary font-semibold"
                      : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  {isActive(item.href) && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-sidebar-accent rounded-lg"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <item.icon className={cn(
                    "w-4 h-4 relative z-10 flex-shrink-0",
                    isActive(item.href) ? "text-sidebar-primary" : "text-sidebar-foreground/50"
                  )} />
                  <span className="relative z-10">{item.label}</span>
                  {isActive(item.href) && (
                    <ChevronRight className="w-3.5 h-3.5 ml-auto relative z-10 text-sidebar-primary/50" />
                  )}
                </Link>
              </motion.div>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-2 pb-4 pt-3 border-t border-sidebar-border space-y-0.5">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150",
              pathname.startsWith("/settings")
                ? "text-sidebar-primary font-semibold"
                : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            {pathname.startsWith("/settings") && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 bg-sidebar-accent rounded-lg"
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
        <div className="px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            {ROLE_LABELS[userRole]}
          </span>
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
