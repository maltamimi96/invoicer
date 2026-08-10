"use client";

/**
 * The sidebar: named links, grouped by category.
 *
 * This was an unlabelled 112px icon rail for a while. Twenty-five icons with
 * no words, distinguishable only by hovering for a tooltip, is a memory test —
 * so the labels are back. What stays from that pass is the *look*: raised
 * rounded group panels, the spring-animated active pill, and paging behind a
 * chevron instead of a scrollbar.
 *
 * Everything cannot fit at once — twenty-five rows plus headings runs past a
 * thousand pixels — so paging stays, and each group carries its heading so a
 * page is always self-explaining.
 *
 * Desktop and mobile now render the same list; mobile just gets it in a
 * drawer.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * How many icons a page of the rail may hold. Groups are never split, so a
 * page can overshoot slightly rather than break a category in half — that is
 * the point of grouping them.
 *
 * Raised to 14 with the return of labels: a row is 40px instead of a 56px
 * icon tile, so noticeably more fits per page. Still a fixed budget rather
 * than a measured one — see the note at the call site for why.
 *
 * Groups are never split, so the real page count is coarser than this number
 * suggests: with every plugin enabled it lands on four pages, fewer once a
 * business's disabled modules drop out.
 */
export const SLOTS_PER_PAGE = 14;

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
  // Memoised for IDENTITY, not for speed. filterNav returns a fresh array
  // every call; feeding that to useMemo below meant `pagesOfSections` was a
  // new object on every render, which is what broke the paging arrows — see
  // the effect further down.
  const sections = useMemo(
    () => filterNav(navSections, { workerView, features, nav: navConfig }),
    [workerView, features, navConfig],
  );

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
  // +1 paging down, -1 paging up. Drives which way the icons slide.
  const [dir, setDir] = useState(1);

  const pagesOfSections = useMemo(
    () => packSections(sections, SLOTS_PER_PAGE),
    [sections],
  );

  const pages = pagesOfSections.length;
  const safePage = Math.min(page, pages - 1);
  const visibleSections = pagesOfSections[safePage] ?? [];
  const hasOverflow = pages > 1;

  // Never strand someone on a page that doesn't hold where they are.
  //
  // 🔴 Keyed on `pathname` ALONE, deliberately. This used to list
  // `pagesOfSections` too, which looked correct and silently broke the arrows:
  // that array had a new identity on every render, so the effect ran after
  // every render — including the one caused by clicking an arrow — and snapped
  // the page straight back to whichever one holds the current route. The
  // arrows appeared dead. `sections` is now memoised as well, but the honest
  // dependency here is the route: "when I navigate, show me where I am."
  const pagesRef = useRef(pagesOfSections);
  pagesRef.current = pagesOfSections;
  useEffect(() => {
    const idx = pagesRef.current.findIndex((secs) =>
      secs.some((sec) => sec.items.some((i) => (
        i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href)
      ))));
    if (idx >= 0) {
      setDir((d) => (idx === page ? d : idx > page ? 1 : -1));
      setPage(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const goto = useCallback((next: number) => {
    setDir(next > page ? 1 : -1);
    setPage(Math.min(pages - 1, Math.max(0, next)));
  }, [page, pages]);

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

  const chevron = (arrow: "up" | "down", disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => goto(safePage + (arrow === "up" ? -1 : 1))}
      aria-label={arrow === "up" ? "Previous menu items" : "More menu items"}
      className={cn(
        "flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
        disabled ? "text-muted-foreground/40"
                 : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      {arrow === "up"
        ? <><ChevronUp className="h-3.5 w-3.5" /> Back</>
        : <><ChevronDown className="h-3.5 w-3.5" /> More</>}
    </button>
  );

  /* ── Desktop sidebar ───────────────────────────────────────────────── */
  const rail = (
    // w-64 (256px). Wide enough that "Recurring billing" and "Client
    // accounts" read in full rather than truncating to nothing. A registered
    // scale step, not a bracket value: arbitrary widths compile in the
    // production build but NOT under this dev server.
    <div className="hidden h-full w-64 shrink-0 flex-col bg-background px-3 py-5 md:flex">
      {hasOverflow && chevron("up", safePage === 0)}

      {/* The page slides in from the direction you asked for, so paging reads
          as movement along one list rather than the contents being swapped
          underneath you. mode="wait" stops the two pages overlapping. */}
      {/* overflow-y-auto, not hidden: the budget above is a guess at the
          viewport, and guessing high would CLIP rows out of existence with no
          way to reach them. Scrolling is the ugly-but-safe fallback; on a
          normal screen it never engages. */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={safePage}
            custom={dir}
            initial={{ opacity: 0, y: dir * 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dir * -14 }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.7 }}
            className="flex w-full flex-col gap-2.5"
          >
            {visibleSections.map((group) => (
              // Each category on its own raised panel, with its name on it —
              // so a page of the list always explains itself.
              <div
                key={group.section}
                className="flex w-full flex-col gap-0.5 rounded-3xl bg-secondary px-2 py-2.5"
              >
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.section}
                </p>
                {group.items.map((item) => navRow(item))}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {hasOverflow && chevron("down", safePage >= pages - 1)}

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
