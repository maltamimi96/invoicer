"use client";

/**
 * The icon rail.
 *
 * Modelled on the reference dashboard: a narrow floating strip of icons with
 * real space between them — no labels, no right-hand border, no collapse
 * toggle, and **no scrollbar**.
 *
 * The overflow problem is the interesting part. The reference has six icons
 * and this app has twenty-odd across seven sections, so on a short viewport
 * they cannot all fit. A scrollbar is out — it is the thing the design is
 * avoiding — and shrinking the icons defeats the point. So the rail measures
 * itself, shows as many icons as genuinely fit, and pages the rest behind a
 * chevron: the spacing never compresses, and nothing is hidden without a way
 * to reach it.
 *
 * Mobile is deliberately different: the drawer is full width with labels,
 * because an 80px strip of unlabelled icons is not navigable on a phone.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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

/** Icon button: 48px, generously rounded, with air around it. */
const ICON_BTN =
  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-200";

/**
 * How many icons a page of the rail may hold. Groups are never split, so a
 * page can overshoot slightly rather than break a category in half — that is
 * the point of grouping them.
 */
export const SLOTS_PER_PAGE = 9;

/**
 * Pack sections into pages without ever splitting one.
 *
 * Pure and exported so it can be tested directly: the previous version
 * measured the DOM, which made it untestable and its behaviour dependent on
 * when layout happened to settle.
 */
export function packSections<T extends { items: unknown[] }>(
  sections: T[], budget: number,
): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let used = 0;
  for (const sec of sections) {
    const cost = Math.max(1, sec.items.length);
    // A single oversized group still gets its own page rather than being cut.
    if (cur.length && used + cost > budget) { out.push(cur); cur = []; used = 0; }
    cur.push(sec); used += cost;
  }
  if (cur.length) out.push(cur);
  return out.length ? out : [sections];
}

const TOOLTIP =
  "pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg border border-border bg-popover "
  + "px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 "
  + "group-hover:opacity-100 group-focus-visible:opacity-100";

/** The filled square behind the current page — the reference's active state. */
function ActiveChip() {
  return (
    <motion.span
      layoutId="rail-active"
      className="absolute inset-0 rounded-2xl bg-primary"
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
  const sections = filterNav(navSections, { workerView, features, nav: navConfig });

  // The rail groups by section, and pages by WHOLE groups: a category that
  // straddled a page boundary would defeat the point of grouping them.
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  /* ── Paging, so the rail never scrolls ─────────────────────────────── */
  //
  // A FIXED budget, not a measured one. This started out measuring the rail
  // and packing groups to fit, which is smarter and was not worth it: the
  // result depended on layout timing, could not be unit-tested, and cost an
  // hour of chasing stale state. A fixed budget is dumber, always behaves the
  // same, and is provable without a browser. Tune the number, not the logic.
  const [page, setPage] = useState(0);

  const pagesOfSections = useMemo(
    () => packSections(sections, SLOTS_PER_PAGE),
    [sections],
  );

  const pages = pagesOfSections.length;
  const safePage = Math.min(page, pages - 1);
  const visibleSections = pagesOfSections[safePage] ?? [];
  const hasOverflow = pages > 1;

  // Never strand someone on a page that doesn't hold where they are.
  useEffect(() => {
    const idx = pagesOfSections.findIndex((secs) =>
      secs.some((sec) => sec.items.some((i) => isActive(i.href))));
    if (idx >= 0) setPage(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, pagesOfSections]);

  const railLink = (item: NavItem) => {
    const active = isActive(item.href);
    const label = vocab?.[item.href] ?? item.label;
    return (
      <div key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            ICON_BTN, "group",
            active ? "text-primary-foreground"
                   : "text-muted-foreground hover:bg-background hover:text-foreground",
          )}
        >
          {active && <ActiveChip />}
          <item.icon className="relative z-10 h-5 w-5" />
          {/* The only way to learn what an unlabelled icon is. */}
          <span role="tooltip" className={TOOLTIP}>{label}</span>
        </Link>
      </div>
    );
  };

  const chevron = (dir: "up" | "down", disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setPage((p) => Math.min(pages - 1, Math.max(0, p + (dir === "up" ? -1 : 1))))}
      aria-label={dir === "up" ? "Previous menu items" : "More menu items"}
      className={cn(
        "flex h-7 w-12 shrink-0 items-center justify-center rounded-lg transition-colors",
        disabled ? "text-muted-foreground/40"
                 : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      {dir === "up" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );

  /* ── Desktop rail ──────────────────────────────────────────────────── */
  const rail = (
    // Wider, with real padding: the reference gives the icons room rather
    // than packing them against the edge.
    <div className="hidden h-full w-[92px] shrink-0 flex-col items-center bg-background px-3 py-6 md:flex">
      {hasOverflow && chevron("up", safePage === 0)}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3.5 overflow-hidden">
        {visibleSections.map((group) => (
          // Each category sits on its own slightly raised panel, as in the
          // reference — the grouping is what makes twenty icons legible
          // without labels.
          <div
            key={group.section}
            title={group.section}
            className="flex w-full flex-col items-center gap-3 rounded-3xl bg-secondary px-2.5 py-3"
          >
            {group.items.map((item) => railLink(item))}
          </div>
        ))}
      </div>

      {hasOverflow && chevron("down", safePage >= pages - 1)}

      {/* Bottom group — settings, then the account, on the same raised panel
          so it reads as one more category rather than a loose pair. */}
      <div className="mt-4 flex w-full flex-col items-center gap-3 rounded-3xl bg-secondary px-2.5 py-3">
        {canManageSettings(userRole) && (
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(
              ICON_BTN, "group",
              pathname.startsWith("/settings") ? "text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {pathname.startsWith("/settings") && <ActiveChip />}
            <Settings className="relative z-10 h-5 w-5" />
            <span role="tooltip" className={TOOLTIP}>Settings</span>
          </Link>
        )}
        <KireiMark className="h-5 w-auto text-muted-foreground" />
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
