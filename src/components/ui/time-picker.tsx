"use client";

import * as React from "react";
import { TimeField, DateInput, DateSegment, Group } from "react-aria-components";
import { parseTime, type Time } from "@internationalized/date";
import { Clock, X } from "@/components/ui/icons";
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

/** "HH:mm" (or "HH:mm:ss") → Time; null when empty/invalid. */
function toTime(value: string): Time | null {
  if (!value) return null;
  try { return parseTime(value.length === 5 ? value : value.slice(0, 5)); } catch { return null; }
}

/** Time → "HH:mm". */
function fromTime(t: Time | null): string {
  if (!t) return "";
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

export interface TimePickerProps {
  /** 24h "HH:mm" (empty = none). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
}

/**
 * Time field built on React Aria's TimeField — type into the hour / minute /
 * AM-PM segments, or nudge them with ↑/↓. Locale-aware display, 24h "HH:mm"
 * value contract (drop-in for `<input type="time">`).
 */
export function TimePicker({ value, onChange, id, disabled, className, clearable }: TimePickerProps) {
  return (
    <TimeField
      aria-label="Time"
      value={toTime(value)}
      onChange={(t) => onChange(fromTime(t))}
      isDisabled={disabled}
      className={cn("w-full", className)}
      hourCycle={12}
    >
      <Group className={groupCls} id={id}>
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <DateInput className="flex flex-1 items-center">
          {(segment) => <DateSegment segment={segment} className={segmentCls} />}
        </DateInput>
        {clearable && value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear time"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </Group>
    </TimeField>
  );
}
