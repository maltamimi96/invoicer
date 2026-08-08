"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Settings, X, Menu } from "@/components/ui/icons";
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

/** Where the rail remembers whether it was expanded. Per browser, not per
 *  business: it is a preference about this screen, not about the company. */
const RAIL_KEY = "kirei.rail-open";

export function AppSidebar({ business, businesses, userRole, features, vocab, navConfig, open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  // Starts collapsed to match the mock's default, then restores the saved
  // choice on mount. Reading localStorage during render would desync SSR.
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    try { setRailOpen(localStorage.getItem(RAIL_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const toggleRail = () => setRailOpen((v) => {
    try { localStorage.setItem(RAIL_KEY, v ? "0" : "1"); } catch { /* private mode */ }
    return !v;
  });

  // The drawer on mobile is always full width — a 84px icon rail you had to
  // open a drawer to see would be useless.
  const expanded = railOpen || open;

  /** Label that slides away rather than disappearing, as in the mock. */
  const labelCls = cn(
    "relative z-10 whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
    expanded ? "opacity-100 max-w-[160px]" : "opacity-0 max-w-0",
  );
  /** 48px row, 16px radius, centred when collapsed — the mock's railRow(). */
  const rowCls = (active: boolean) => cn(
    "relative flex items-center gap-3.5 h-12 rounded-2xl text-sm transition-[background,color,padding] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
    expanded ? "px-3.5 justify-start" : "px-0 justify-center",
    active ? "text-primary-foreground font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent/60 font-medium",
  );
  const workerView = isWorker(userRole);
  const visibleSections = filterNav(navSections, { workerView, features, nav: navConfig });

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const content = (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
        "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        expanded ? "w-[244px]" : "w-[84px]",
      )}
      // The mock lights the top of the rail with an accent wash that fades out
      // by 42%. Inline because the stop position is part of the design, not a
      // Tailwind scale value.
      style={{ backgroundImage: "linear-gradient(180deg, var(--accent-soft) 0%, transparent 42%)" }}
    >
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

      {/* Collapse toggle — the mock's "Menu" row. Hidden on mobile, where the
          drawer is opened and closed from the header instead. */}
      <div className={cn("hidden md:block", expanded ? "px-3.5 pt-3.5" : "px-4 pt-3.5")}>
        <button
          type="button"
          onClick={toggleRail}
          aria-expanded={railOpen}
          aria-label={railOpen ? "Collapse menu" : "Expand menu"}
          className={cn(rowCls(false), "w-full text-sidebar-foreground")}
        >
          <Menu className="relative z-10 w-[18px] h-[18px] flex-shrink-0" />
          <span className={labelCls}>Menu</span>
        </button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 py-3 overflow-y-auto overflow-x-hidden", expanded ? "px-3.5" : "px-4")}>
        {visibleSections.map((group, gi) => (
          <div key={group.section} className={cn("flex flex-col gap-1", gi > 0 && "mt-4")}>
            <p className={cn(
              "px-2.5 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/55",
              "overflow-hidden whitespace-nowrap transition-[opacity,height] duration-200",
              // Collapsed, a section heading sitting over centred icons reads
              // as noise; a hairline separates the groups instead.
              expanded ? "opacity-100 h-auto" : "opacity-0 h-0 pt-0 pb-0",
            )}>
              {group.section}
            </p>
            {!expanded && gi > 0 && <div className="mx-3 my-1.5 h-px bg-sidebar-border" aria-hidden />}
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
                    // Collapsed, the label is visually gone but still in the
                    // DOM for screen readers — so title= carries it for mouse
                    // users without duplicating it for assistive tech.
                    title={!expanded ? (vocab?.[item.href] ?? item.label) : undefined}
                    className={rowCls(active)}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-2xl bg-primary"
                        style={{ boxShadow: "0 8px 22px var(--accent-soft)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <item.icon className={cn(
                      "relative z-10 w-5 h-5 flex-shrink-0 transition-colors",
                      active ? "text-primary-foreground" : "text-sidebar-foreground/70"
                    )} />
                    <span className={labelCls}>{vocab?.[item.href] ?? item.label}</span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("pb-3 pt-2 border-t border-sidebar-border space-y-1", expanded ? "px-3.5" : "px-4")}>
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            title={!expanded ? "Settings" : undefined}
            className={rowCls(pathname.startsWith("/settings"))}
          >
            {pathname.startsWith("/settings") && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-2xl bg-primary"
                style={{ boxShadow: "0 8px 22px var(--accent-soft)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Settings className={cn(
              "w-5 h-5 relative z-10",
              pathname.startsWith("/settings") ? "text-primary-foreground" : "text-sidebar-foreground/70"
            )} />
            <span className={labelCls}>Settings</span>
          </Link>
        )}

        {/* Business switcher — anchored at the bottom. Collapsed, the rail is
            84px wide and the switcher's name + chevron cannot fit, so it is
            replaced by the mark: still a way to see which business you are in,
            and expanding the rail is one click away. */}
        {expanded ? (
          <>
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
          </>
        ) : (
          <div className="flex justify-center pt-2" title={business.name}>
            <KireiMark className="h-5 w-auto text-sidebar-foreground/60" />
          </div>
        )}
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
