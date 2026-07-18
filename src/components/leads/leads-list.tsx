"use client";

/**
 * The list view — for when the board has more leads than you can scan.
 *
 * Filters by stage, then pages. Paging is in memory: the page already loads
 * every lead via getLeads(), so a round-trip per page would be slower and
 * would lose the client-side search.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Phone, Mail, MapPin } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { KireiTabs, KireiAvatar, EmptyState } from "@/components/ui/kirei";
import { LeadActions } from "./lead-actions";
import {
  STAGES, STAGE_BY_STATUS, formatDate, formatSourceLabel,
  type LeadActionHandlers,
} from "./lead-shared";
import type { Lead, LeadStatus } from "@/types/database";

const PER_PAGE = 12;

type Filter = LeadStatus | "all";

export function LeadsList({
  leads,
  busyId,
  handlers,
}: {
  leads: Lead[];
  busyId: string | null;
  handlers: LeadActionHandlers;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const shown = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter]
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));

  // Changing the filter (or a search upstream shrinking the set) can strand you
  // on a page that no longer exists — clamp instead of showing an empty page.
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const start = (page - 1) * PER_PAGE;
  const rows = shown.slice(start, start + PER_PAGE);

  const tabs = [
    { value: "all" as const, label: "All", count: leads.length },
    ...STAGES.map((s) => ({
      value: s.status,
      label: s.label,
      count: leads.filter((l) => l.status === s.status).length,
    })),
  ];

  return (
    <div className="space-y-3">
      <KireiTabs
        tabs={tabs}
        value={filter}
        onChange={(v) => { setFilter(v as Filter); setPage(1); }}
      />

      {shown.length === 0 ? (
        <EmptyState
          title="No leads here"
          hint={filter === "all" ? "Add a lead to get started." : `Nothing in ${STAGE_BY_STATUS[filter as LeadStatus]?.label ?? filter}.`}
        />
      ) : (
        <>
          {/* Rows, keyed on filter+page: React swaps the whole set and framer
              animates the incoming page in. No AnimatePresence — an exit
              animation on a pager isn't worth nesting one mode="wait" inside
              the view switcher's. */}
          <motion.ul
              key={`${filter}-${page}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-1.5"
            >
              {rows.map((lead) => {
                const stage = STAGE_BY_STATUS[lead.status];
                return (
                  <li
                    key={lead.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                  >
                    <KireiAvatar name={lead.name} size={38} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-sm font-semibold break-words hover:text-primary transition-colors"
                        >
                          {lead.name}
                        </Link>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${stage?.soft ?? ""}`}>
                          {stage?.label ?? lead.status}
                        </span>
                        {lead.source && lead.source !== "manual" && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {formatSourceLabel(lead.source)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {lead.phone && (
                          <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground break-all">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </a>
                        )}
                        {lead.suburb && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {lead.suburb}
                          </span>
                        )}
                        {lead.service && <span className="break-words">{lead.service}</span>}
                      </div>
                    </div>

                    <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">
                      {formatDate(lead.created_at)}
                    </span>
                    <LeadActions lead={lead} busy={busyId === lead.id} handlers={handlers} />
                  </li>
                );
              })}
            </motion.ul>

          {/* Pager */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {start + 1}–{Math.min(start + PER_PAGE, shown.length)} of {shown.length}
            </p>

            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  // Keep the pager short on long lists: first, last, and a
                  // window around the current page.
                  .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-1">
                      {i > 0 && arr[i - 1] !== n - 1 && (
                        <span className="text-xs text-muted-foreground px-0.5">…</span>
                      )}
                      <Button
                        variant={n === page ? "default" : "outline"}
                        size="sm"
                        className="h-8 min-w-8 px-2 text-xs tabular-nums"
                        onClick={() => setPage(n)}
                        aria-current={n === page ? "page" : undefined}
                      >
                        {n}
                      </Button>
                    </span>
                  ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
