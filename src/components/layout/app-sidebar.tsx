"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageSettings, isWorker, ROLE_LABELS } from "@/lib/permissions";
import Image from "next/image";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { navSections, filterNav } from "./nav-config";

interface AppSidebarProps {
  business: Business;
  businesses: Business[];
  userRole: Role;
  /** Enabled-plugin map from the layout resolver (plugin id → enabled). */
  features?: Record<string, boolean>;
  /** Label overrides keyed by href (industry-preset vocabulary, e.g. Work Orders → Projects). */
  vocab?: Record<string, string> | null;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ business, businesses, userRole, features, vocab, open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const workerView = isWorker(userRole);
  const visibleSections = filterNav(navSections, { workerView, features });

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const content = (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header — business switcher (the brand/logo lives in the top bar) */}
      <div className="px-3 pt-3 pb-2 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <BusinessSwitcher
              business={business}
              businesses={businesses}
              onClose={onClose}
            />
          </div>
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
                      "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150",
                      active
                        ? "text-sidebar-foreground font-semibold"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 font-medium"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-lg"
                        style={{ backgroundColor: "hsl(var(--sidebar-primary) / 0.14)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <item.icon className={cn(
                      "relative z-10 w-4 h-4 flex-shrink-0 transition-colors",
                      active ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"
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
      <div className="px-3 pb-3 pt-2 border-t border-sidebar-border space-y-px">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150",
              pathname.startsWith("/settings")
                ? "text-sidebar-foreground font-semibold"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 font-medium"
            )}
          >
            {pathname.startsWith("/settings") && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: "hsl(var(--sidebar-primary) / 0.14)" }}
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
