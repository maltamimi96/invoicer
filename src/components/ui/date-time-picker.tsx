"use client";

import * as React from "react";
import {
  DatePicker as AriaDatePicker, Group, DateInput, DateSegment, Button as AriaButton,
  Popover, Dialog, Calendar, CalendarGrid, CalendarGridHeader, CalendarHeaderCell,
  CalendarGridBody, CalendarCell, Heading,
} from "react-aria-components";
import { parseDateTime, type CalendarDateTime } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const groupCls =
  "flex h-9 w-full items-center gap-1 rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors " +
  "hover:border-primary/40 data-[focus-within]:border-primary/60 data-[focus-within]:ring-2 data-[focus-within]:ring-ring " +
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

const segmentCls =
  "rounded px-0.5 tabular-nums outline-none caret-transparent " +
  "data-[type=literal]:px-0 data-[type=literal]:text-muted-foreground " +
  "data-[placeholder]:text-muted-foreground " +
  "data-[focused]:bg-primary data-[focused]:text-primary-foreground";

const iconBtnCls =
  "ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none " +
  "hover:bg-muted hover:text-foreground data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring";

const popoverCls =
  "z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none " +
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 " +
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95";

const cellCls =
  "flex h-9 w-9 cursor-pointer select-none items-center justify-center rounded-md text-sm outline-none transition-colors " +
  "data-[outside-month]:text-muted-foreground/40 data-[hovered]:bg-muted " +
  "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:font-medium " +
  "data-[disabled]:text-muted-foreground/40 data-[disabled]:cursor-default " +
  "data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring " +
  "[&[data-today]:not([data-selected])]:bg-accent [&[data-today]:not([data-selected])]:font-semibold";

/** "yyyy-MM-ddTHH:mm" → CalendarDateTime; null when empty/invalid. */
function toDateTime(value: string): CalendarDateTime | null {
  if (!value) return null;
  try { return parseDateTime(value.length === 16 ? value : value.slice(0, 16)); } catch { return null; }
}

function fromDateTime(d: CalendarDateTime | null): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}T${p(d.hour)}:${p(d.minute)}`;
}

export interface DateTimePickerProps {
  /** "yyyy-MM-ddTHH:mm" (empty = none). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Date + time in one segmented field (React Aria, minute granularity) with a
 * calendar popover. Drop-in for `<input type="datetime-local">`.
 */
export function DateTimePicker({ value, onChange, id, disabled, className }: DateTimePickerProps) {
  return (
    <AriaDatePicker
      aria-label="Date and time"
      value={toDateTime(value)}
      onChange={(d) => onChange(fromDateTime(d as CalendarDateTime | null))}
      isDisabled={disabled}
      granularity="minute"
      hourCycle={12}
      className={cn("w-full", className)}
    >
      <Group className={groupCls} id={id}>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <DateInput className="flex flex-1 items-center">
          {(segment) => <DateSegment segment={segment} className={segmentCls} />}
        </DateInput>
        <AriaButton className={iconBtnCls} aria-label="Open calendar">
          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
        </AriaButton>
      </Group>
      <Popover className={popoverCls} placement="bottom start" offset={6}>
        <Dialog className="outline-none">
          <Calendar>
            <header className="mb-2 flex items-center justify-between gap-2">
              <AriaButton slot="previous" className={cn(iconBtnCls, "ml-0 h-7 w-7")} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </AriaButton>
              <Heading className="text-sm font-semibold" />
              <AriaButton slot="next" className={cn(iconBtnCls, "ml-0 h-7 w-7")} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </AriaButton>
            </header>
            <CalendarGrid className="border-collapse">
              <CalendarGridHeader>
                {(day) => (
                  <CalendarHeaderCell className="h-8 w-9 text-[11px] font-medium uppercase text-muted-foreground">
                    {day}
                  </CalendarHeaderCell>
                )}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => <CalendarCell date={date} className={cellCls} />}
              </CalendarGridBody>
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}
