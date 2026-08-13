"use client";

/**
 * The sidebar: every link, named, grouped by category.
 *
 * It scrolls. That is the whole design now, and it replaces two earlier
 * attempts that both failed the same way: an unlabelled icon rail (a memory
 * test), and a paged list behind chevrons (four pages of clicking to find
 * something, and a fixed slot budget that could never know the viewport).
 *
 * Paging was avoiding a scrollbar. The scrollbar was only ugly because it was
 * painted by the OS — a light grey slab on a near-black rail, the one element
 * ignoring the theme. `.ch-scroll` in globals.css fixes that with tokens, so
 * it follows every palette. Once it matches, scrolling is simply better:
 * everything is present, nothing is a click away, and the browser handles a
 * short viewport for free.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { Settings, X, ChevronUp, ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Business } from "@/types/database";
import type { Role } from "@/lib/permissions";
import { canManageSettings, isWorker, ROLE_LABELS } from "@/lib/permissions";
import { KireiMark } from "@/components/brand/kirei-logo";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { navSections, filterNav, type NavItem } from "./nav-config";
import type { NavConfig } from "@/lib/nav/config";

interface AppSidebarProps {
  business: Business;
  businesses: Business[];
  userRole: Role;
  /** Enabled-plugin map from the layout resolver (plugin id → enabled). */
  features?: Record<string, boolean>;
  /** Label overrides keyed by href (industry-preset vocabulary). */
  vocab?: Record<string, string> | null;
  /** The business's hide/reorder choices from Settings → Navigation. */
  navConfig?: NavConfig | null;
  open: boolean;
  onClose: () => void;
}

/** A nav row: icon + label, full width, rounded pill. */
const NAV_ROW =
  "relative flex h-10 w-full shrink-0 items-center gap-2.5 rounded-full px-3 text-sm transition-colors duration-200";

/** The filled square behind the current page — the reference's active state. */
function ActiveChip() {
  return (
    <motion.span
      layoutId="rail-active"
      className="absolute inset-0 rounded-full bg-primary"
      style={{ boxShadow: "0 10px 26px -6px hsl(var(--primary) / 0.55)" }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    />
  );
}

export function AppSidebar({
  business, businesses, userRole, features, vocab, navConfig, open, onClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const workerView = isWorker(userRole);
  // Memoised because filterNav returns a fresh array on every call, and this
  // feeds a list of ~40 rows. (It also used to feed a paging effect, where the
  // churning identity made the arrows appear dead — that whole mechanism is
  // gone now, but stable identity is still the right default here.)
  const sections = useMemo(
    () => filterNav(navSections, { workerView, features, nav: navConfig }),
    [workerView, features, navConfig],
  );

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const navRow = (item: NavItem) => {
    const active = isActive(item.href);
    const label = vocab?.[item.href] ?? item.label;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        className={cn(
          NAV_ROW,
          active ? "font-semibold text-primary-foreground"
                 : "text-muted-foreground hover:bg-background hover:text-foreground",
        )}
      >
        {active && <ActiveChip />}
        <item.icon className="relative z-10 h-4 w-4 shrink-0" />
        {/* truncate, not wrap: a two-line row breaks the 40px rhythm the
            group panels are built on. The full text is in the title. */}
        <span className="relative z-10 truncate" title={label}>{label}</span>
      </Link>
    );
  };

  /* ── Desktop sidebar ───────────────────────────────────────────────── */
  const rail = (
    // w-64 (256px). Wide enough that "Recurring billing" and "Client
    // accounts" read in full rather than truncating to nothing. A registered
    // scale step, not a bracket value: arbitrary widths compile in the
    // production build but NOT under this dev server.
    <div className="hidden h-full w-64 shrink-0 flex-col bg-background px-3 py-5 md:flex">
      {/* One list, scrolled. `.ch-scroll` themes the bar itself (globals.css)
          — the OS default was a light slab on a dark rail, which is the only
          reason the earlier versions went to such lengths to avoid one. */}
      <nav className="ch-scroll flex min-h-0 w-full flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {sections.map((group) => (
          // Each category on its own raised panel, with its name on it.
          <div
            key={group.section}
            className="flex w-full shrink-0 flex-col gap-0.5 rounded-3xl bg-secondary px-2 py-2.5"
          >
            <p className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {group.section}
            </p>
            {group.items.map((item) => navRow(item))}
          </div>
        ))}
      </nav>

      {/* Settings sits on its own panel, as one more category. */}
      <div className="mt-3 flex w-full flex-col gap-0.5 rounded-3xl bg-secondary px-2 py-2.5">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(
              NAV_ROW,
              pathname.startsWith("/settings")
                ? "font-semibold text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {pathname.startsWith("/settings") && <ActiveChip />}
            <Settings className="relative z-10 h-4 w-4 shrink-0" />
            <span className="relative z-10">Settings</span>
          </Link>
        )}
        <div className="flex items-center justify-center pb-0.5 pt-1.5">
          <KireiMark className="h-4 w-auto text-muted-foreground/60" />
        </div>
      </div>
    </div>
  );

  /* ── Mobile drawer: full width, with labels ────────────────────────── */
  const drawer = (
    <div className="flex h-full w-64 flex-col border-r border-border bg-background text-foreground">
      <div className="flex justify-end px-3 pt-3">
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {sections.map((group, gi) => (
          <div key={group.section} className={cn("flex flex-col gap-1", gi > 0 && "mt-4")}>
            <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {group.section}
            </p>
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-colors",
                    active ? "bg-primary font-semibold text-primary-foreground"
                           : "font-medium hover:bg-secondary",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{vocab?.[item.href] ?? item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border px-3 pb-3 pt-2">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-colors",
              pathname.startsWith("/settings") ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium hover:bg-secondary",
            )}
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span>Settings</span>
          </Link>
        )}
        <div className="pt-1">
          <BusinessSwitcher business={business} businesses={businesses} onClose={onClose} />
        </div>
        <div className="flex items-center justify-between px-1 pt-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {ROLE_LABELS[userRole]}
          </span>
          <KireiMark className="h-5 w-auto text-muted-foreground" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {rail}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {drawer}
      </div>
    </>
  );
}
