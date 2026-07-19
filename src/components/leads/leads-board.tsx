"use client";

/**
 * The pipeline board.
 *
 * Drag is @dnd-kit rather than native HTML5 DnD. The native API gave no drag
 * preview worth the name, couldn't animate, and fired inconsistently across
 * browsers; dnd-kit gives a real overlay and a spring drop.
 *
 * Cards are draggable but NOT sortable: `leads` has no sort_order column, so
 * within-column ordering couldn't be persisted and offering it would be a lie.
 * You drag a card to a *column*, which changes its status — that's the whole
 * interaction.
 */

import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCorners,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { LeadCard } from "./lead-card";
import { STAGES, type LeadActionHandlers } from "./lead-shared";
import type { Lead, LeadStatus } from "@/types/database";

function DraggableCard({
  lead,
  busy,
  handlers,
}: {
  lead: Lead;
  busy: boolean;
  handlers: LeadActionHandlers;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      layoutId={`lead-${lead.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className="cursor-grab active:cursor-grabbing touch-none"
      {...listeners}
      {...attributes}
    >
      <LeadCard lead={lead} busy={busy} handlers={handlers} />
    </motion.div>
  );
}

function Column({
  status,
  label,
  dot,
  soft,
  leads,
  busyId,
  handlers,
}: {
  status: LeadStatus;
  label: string;
  dot: string;
  soft: string;
  leads: Lead[];
  busyId: string | null;
  handlers: LeadActionHandlers;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col gap-2 w-[280px] shrink-0 xl:w-auto xl:shrink">
      {/* Header */}
      <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${soft}`}>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto text-xs font-semibold tabular-nums bg-background/70 rounded px-1.5 py-0.5">
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 rounded-xl p-1.5 min-h-[120px] transition-colors ${
          isOver ? "bg-primary/5 ring-2 ring-primary/30 ring-inset" : ""
        }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {leads.map((lead) => (
            <DraggableCard
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              handlers={handlers}
            />
          ))}
        </AnimatePresence>

        {leads.length === 0 && (
          <div
            className={`rounded-lg border border-dashed p-4 text-center text-xs transition-colors ${
              isOver ? "border-primary/50 text-primary" : "border-border/60 text-muted-foreground"
            }`}
          >
            {isOver ? "Drop here" : "No leads"}
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadsBoard({
  leads,
  busyId,
  handlers,
}: {
  leads: Lead[];
  busyId: string | null;
  handlers: LeadActionHandlers;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // A few px of travel before a drag starts, so clicking the actions menu or a
  // phone link still registers as a click rather than a stillborn drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const active = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over?.id as LeadStatus | undefined;
    if (!overId) return;

    const lead = leads.find((l) => l.id === e.active.id);
    if (lead && lead.status !== overId) handlers.onMove(lead.id, overId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* Horizontal scroll below xl instead of wrapping into 1–2 ragged
          columns — a pipeline reads left-to-right, so let it. */}
      <div className="flex gap-4 overflow-x-auto pb-2 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {STAGES.map((s) => (
          <Column
            key={s.status}
            status={s.status}
            label={s.label}
            dot={s.dot}
            soft={s.soft}
            leads={leads.filter((l) => l.status === s.status)}
            busyId={busyId}
            handlers={handlers}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {active && (
          <div className="w-[268px]">
            <LeadCard lead={active} busy={false} handlers={handlers} dragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
