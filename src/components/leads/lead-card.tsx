"use client";

/**
 * A lead card for the board.
 *
 * Deliberately quiet. The old card filled its whole surface with one of five
 * stage colours, so a full board was five columns of saturated blocks and
 * nothing stood out. Stage now reads from a 3px left rail plus the column it
 * sits in — the surface stays neutral, so the lead's own details are what you
 * actually see.
 */

import { Phone, Mail, MapPin, Clock, ChevronRight, User } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { LeadActions } from "./lead-actions";
import {
  STAGE_BY_STATUS, NEXT_STATUS, formatDate, formatSourceLabel,
  type LeadActionHandlers,
} from "./lead-shared";
import type { Lead } from "@/types/database";

export function LeadCard({
  lead,
  busy,
  handlers,
  dragging,
}: {
  lead: Lead;
  busy: boolean;
  handlers: LeadActionHandlers;
  /** Rendered inside the drag overlay — lifts and tilts slightly. */
  dragging?: boolean;
}) {
  const stage = STAGE_BY_STATUS[lead.status];
  const next = NEXT_STATUS[lead.status];

  return (
    <div
      className={`rounded-xl border border-border border-l-[3px] ${stage?.rail ?? ""} bg-card p-3 space-y-2 transition-shadow ${
        dragging ? "shadow-lg rotate-[1.5deg] cursor-grabbing" : "shadow-sm hover:shadow-md"
      }`}
    >
      {/* Name + menu */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm break-words">{lead.name}</span>
        </div>
        <LeadActions lead={lead} busy={busy} handlers={handlers} />
      </div>

      {/* Details */}
      <div className="space-y-1">
        {lead.phone && (
          <a
            href={`tel:${lead.phone.replace(/\s/g, "")}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Phone className="h-3 w-3 shrink-0" />
            <span className="break-words">{lead.phone}</span>
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-3 w-3 shrink-0" />
            <span className="break-words">{lead.email}</span>
          </a>
        )}
        {lead.suburb && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="break-words">{lead.suburb}</span>
          </div>
        )}
        {lead.service && (
          <p className="text-xs text-foreground/80 break-words">{lead.service}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(lead.created_at)}
        </span>
        <div className="flex items-center gap-1.5">
          {lead.source && lead.source !== "manual" && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              {formatSourceLabel(lead.source)}
            </span>
          )}
          {next && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] px-2 gap-0.5"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => handlers.onMove(lead.id, next)}
            >
              {next.charAt(0).toUpperCase() + next.slice(1)}
              <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
