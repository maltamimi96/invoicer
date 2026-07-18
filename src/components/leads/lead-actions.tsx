"use client";

/**
 * The per-lead actions menu, shared by Board, List and Calendar.
 *
 * This was inlined in the kanban card, so any view that wasn't the board had
 * no way to convert or move a lead. One definition now.
 */

import { MoreHorizontal, Trash2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGES, type LeadActionHandlers } from "./lead-shared";
import type { Lead } from "@/types/database";

export function LeadActions({
  lead,
  busy,
  handlers,
}: {
  lead: Lead;
  busy: boolean;
  handlers: LeadActionHandlers;
}) {
  const { onMove, onEdit, onDelete, onConvert, onAddAsContact } = handlers;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Actions for ${lead.name}`}
          // The board card is draggable; without this a press on the menu
          // starts a drag instead of opening it.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onEdit(lead.id)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAddAsContact(lead.id)} disabled={busy}>
          Add as contact
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onConvert(lead.id, "customer")}
          disabled={busy || !!lead.customer_id}
        >
          Convert to customer{lead.customer_id ? " ✓" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onConvert(lead.id, "quote")} disabled={busy}>
          Convert to quote
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onConvert(lead.id, "work_order")} disabled={busy}>
          Convert to work order
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {STAGES.filter((s) => s.status !== lead.status).map((s) => (
          <DropdownMenuItem key={s.status} onClick={() => onMove(lead.id, s.status)}>
            <span className={`mr-2 h-2 w-2 rounded-full ${s.dot}`} /> Move to {s.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(lead.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
