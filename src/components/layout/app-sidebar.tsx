"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageSettings, isWorker, ROLE_LABELS } from "@/lib/permissions";
import { KireiMark } from "@/components/brand/kirei-logo";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { navSections, filterNav } from "./nav-config";
import type { NavConfig } from "@/lib/nav/config";

interface AppSidebarProps {
  business: Business;
  businesses: Business[];
  userRole: Role;
  /** Enabled-plugin map from the layout resolver (plugin id → enabled). */
  features?: Record<string, boolean>;
  /** Label overrides keyed by href (industry-preset vocabulary, e.g. Work Orders → Projects). */
  vocab?: Record<string, string> | null;
  /** The business's hide/reorder choices from Settings → Navigation. */
  navConfig?: NavConfig | null;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ business, businesses, userRole, features, vocab, navConfig, open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const workerView = isWorker(userRole);
  const visibleSections = filterNav(navSections, { workerView, features, nav: navConfig });

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const content = (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Mobile-only close (desktop brand lives in the top bar) */}
      <div className="md:hidden flex justify-end px-3 pt-3">
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {visibleSections.map((group, gi) => (
          <div key={group.section} className={cn("flex flex-col gap-1", gi > 0 && "mt-4")}>
            <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/55">
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
                      "relative flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm transition-colors duration-150",
                      active
                        ? "text-primary-foreground font-semibold"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 font-medium"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <item.icon className={cn(
                      "relative z-10 w-[18px] h-[18px] flex-shrink-0 transition-colors",
                      active ? "text-primary-foreground" : "text-sidebar-foreground/70"
                    )} />
                    <span className="relative z-10">{vocab?.[item.href] ?? item.label}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 pt-2 border-t border-sidebar-border space-y-1">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "relative flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm transition-colors duration-150",
              pathname.startsWith("/settings")
                ? "text-primary-foreground font-semibold"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 font-medium"
            )}
          >
            {pathname.startsWith("/settings") && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Settings className={cn(
              "w-[18px] h-[18px] relative z-10",
              pathname.startsWith("/settings") ? "text-primary-foreground" : "text-sidebar-foreground/70"
            )} />
            <span className="relative z-10">Settings</span>
          </Link>
        )}

        {/* Business switcher — anchored at the bottom */}
        <div className="pt-1">
          <BusinessSwitcher
            business={business}
            businesses={businesses}
            onClose={onClose}
          />
        </div>

        <div className="flex items-center justify-between px-1 pt-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
            {ROLE_LABELS[userRole]}
          </span>
          {/* Kirei platform attribution — mark only, no text, no border */}
          <KireiMark className="h-5 w-auto text-sidebar-foreground/60" />
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
