"use client";

import * as React from "react";
import {
  DatePicker as AriaDatePicker,
  DateRangePicker as AriaDateRangePicker,
  Group, DateInput, DateSegment, Button as AriaButton, Popover, Dialog,
  Calendar, CalendarGrid, CalendarGridHeader, CalendarHeaderCell, CalendarGridBody, CalendarCell,
  Heading, RangeCalendar,
} from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/* Shared field chrome — matches the app's Input geometry + teal focus ring. */
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
  "data-[outside-month]:text-muted-foreground/40 " +
  "data-[hovered]:bg-muted " +
  "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:font-medium " +
  "data-[unavailable]:text-muted-foreground/40 data-[unavailable]:line-through data-[unavailable]:cursor-default " +
  "data-[disabled]:text-muted-foreground/40 data-[disabled]:cursor-default " +
  "data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring " +
  "[&[data-today]:not([data-selected])]:bg-accent [&[data-today]:not([data-selected])]:font-semibold";

/** yyyy-MM-dd → CalendarDate (null when empty/invalid). */
function toCalendarDate(value: string): CalendarDate | null {
  if (!value) return null;
  try { return parseDate(value); } catch { return null; }
}

function CalendarHead() {
  return (
    <header className="mb-2 flex items-center justify-between gap-2">
      <AriaButton slot="previous" className={cn(iconBtnCls, "ml-0 h-7 w-7")} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </AriaButton>
      <Heading className="text-sm font-semibold" />
      <AriaButton slot="next" className={cn(iconBtnCls, "ml-0 h-7 w-7")} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </AriaButton>
    </header>
  );
}

function Grid() {
  return (
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
  );
}

export interface DatePickerProps {
  /** yyyy-MM-dd (empty string = none). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Show a clear (×) button when a date is set. */
  clearable?: boolean;
  /** Earliest / latest selectable day, as yyyy-MM-dd. */
  minValue?: string;
  maxValue?: string;
}

/**
 * Date field built on React Aria Components: type straight into the
 * day/month/year segments or pick from the calendar. Fully keyboard-accessible
 * and identical in every browser. Value in/out stays the `yyyy-MM-dd` string
 * the app uses, so it drops in where `<input type="date">` was.
 */
export function DatePicker({ value, onChange, id, disabled, className, clearable, minValue, maxValue }: DatePickerProps) {
  return (
    <AriaDatePicker
      aria-label="Date"
      value={toCalendarDate(value)}
      onChange={(d) => onChange(d ? d.toString() : "")}
      isDisabled={disabled}
      minValue={toCalendarDate(minValue ?? "") ?? undefined}
      maxValue={toCalendarDate(maxValue ?? "") ?? undefined}
      className={cn("w-full", className)}
      shouldCloseOnSelect
      granularity="day"
    >
      <Group className={groupCls} id={id}>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <DateInput className="flex flex-1 items-center">
          {(segment) => <DateSegment segment={segment} className={segmentCls} />}
        </DateInput>
        {clearable && value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <AriaButton className={iconBtnCls} aria-label="Open calendar">
          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
        </AriaButton>
      </Group>
      <Popover className={popoverCls} placement="bottom start" offset={6}>
        <Dialog className="outline-none">
          <Calendar>
            <CalendarHead />
            <Grid />
          </Calendar>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}

export interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  disabled?: boolean;
  className?: string;
}

/** Date-range field (segmented start + end) with a two-month range calendar. */
export function DateRangePicker({ start, end, onChange, disabled, className }: DateRangePickerProps) {
  const s = toCalendarDate(start), e = toCalendarDate(end);
  return (
    <AriaDateRangePicker
      aria-label="Date range"
      value={s && e ? { start: s, end: e } : null}
      onChange={(r) => onChange({ start: r?.start?.toString() ?? "", end: r?.end?.toString() ?? "" })}
      isDisabled={disabled}
      className={cn("w-full", className)}
    >
      <Group className={groupCls}>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <DateInput slot="start" className="flex items-center">
          {(segment) => <DateSegment segment={segment} className={segmentCls} />}
        </DateInput>
        <span className="px-1 text-muted-foreground">–</span>
        <DateInput slot="end" className="flex items-center">
          {(segment) => <DateSegment segment={segment} className={segmentCls} />}
        </DateInput>
        <AriaButton className={iconBtnCls} aria-label="Open calendar">
          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
        </AriaButton>
      </Group>
      <Popover className={popoverCls} placement="bottom start" offset={6}>
        <Dialog className="outline-none">
          <RangeCalendar>
            <CalendarHead />
            <Grid />
          </RangeCalendar>
        </Dialog>
      </Popover>
    </AriaDateRangePicker>
  );
}
