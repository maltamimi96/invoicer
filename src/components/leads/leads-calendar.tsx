"use client";

/**
 * Leads by the day they arrived.
 *
 * The board answers "where is this lead up to"; this answers "when is work
 * coming in" — which days are busy, whether a campaign landed, how long a
 * pile of New leads has been sitting there.
 *
 * All leads are already in memory, so paging months is local state with no
 * refetch.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Phone, Mail } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { LeadActions } from "./lead-actions";
import {
  STAGE_BY_STATUS, ymd, formatSourceLabel, type LeadActionHandlers,
} from "./lead-shared";
import type { Lead } from "@/types/database";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Chips per day cell before collapsing into "+k more". */
const MAX_CHIPS = 3;

/** The Monday-first 6x7 grid covering a month, plus the neighbouring days that
 *  fill the first and last weeks. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // JS weeks start Sunday; ours don't.
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function LeadsCalendar({
  leads,
  busyId,
  handlers,
}: {
  leads: Lead[];
  busyId: string | null;
  handlers: LeadActionHandlers;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const l of leads) {
      const key = ymd(new Date(l.created_at));
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return map;
  }, [leads]);

  const cells = monthGrid(year, month);
  const today = ymd(now);
  const label = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shift = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(null);
  };

  const monthCount = cells.filter((d) => d.getMonth() === month)
    .reduce((n, d) => n + (byDay.get(ymd(d))?.length ?? 0), 0);

  const selectedLeads = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-semibold px-2 min-w-[9.5rem] text-center">{label}</span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs ml-1"
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(null); }}
          >
            Today
          </Button>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {monthCount} lead{monthCount === 1 ? "" : "s"} this month
        </p>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = ymd(d);
            const items = byDay.get(key) ?? [];
            const outside = d.getMonth() !== month;
            const isSelected = selected === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(items.length ? (isSelected ? null : key) : null)}
                className={`min-h-[5.5rem] border-b border-r border-border p-1 space-y-1 text-left align-top transition-colors ${
                  outside ? "bg-muted/20" : ""
                } ${isSelected ? "ring-2 ring-primary/40 ring-inset" : ""} ${
                  items.length ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`block text-[10px] px-1 tabular-nums ${
                    key === today
                      ? "font-bold text-primary"
                      : outside
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>

                {items.slice(0, MAX_CHIPS).map((l) => (
                  <span
                    key={l.id}
                    className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] bg-muted/70"
                    title={`${l.name} — ${STAGE_BY_STATUS[l.status]?.label ?? l.status}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STAGE_BY_STATUS[l.status]?.dot ?? "bg-muted-foreground"}`} />
                    <span className="truncate">{l.name}</span>
                  </span>
                ))}

                {items.length > MAX_CHIPS && (
                  <span className="block text-[10px] text-muted-foreground px-1">
                    +{items.length - MAX_CHIPS} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="rounded-xl border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {selectedLeads.length} lead{selectedLeads.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="space-y-1.5">
              {selectedLeads.map((lead) => {
                const stage = STAGE_BY_STATUS[lead.status];
                return (
                  <li key={lead.id} className="flex items-center gap-2 rounded-lg border border-border/70 p-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${stage?.dot ?? ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium break-words">{lead.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${stage?.soft ?? ""}`}>
                          {stage?.label ?? lead.status}
                        </span>
                        {lead.source && lead.source !== "manual" && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {formatSourceLabel(lead.source)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                        {lead.service && <span className="break-words">{lead.service}</span>}
                      </div>
                    </div>
                    <LeadActions lead={lead} busy={busyId === lead.id} handlers={handlers} />
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
