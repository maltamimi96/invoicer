"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarDays, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  /** yyyy-MM-dd (empty string = none). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Allow clearing back to empty. */
  clearable?: boolean;
  /** Compact display format token (date-fns). Default "EEE, d MMM yyyy". */
  displayFormat?: string;
}

export function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/** A clean date field: a button showing the formatted date that opens a
 *  calendar popover. Value in/out is the `yyyy-MM-dd` string used everywhere
 *  (drop-in for `<input type="date">`). */
export function DatePicker({
  value, onChange, id, placeholder = "Pick a date", disabled, className, clearable, displayFormat = "EEE, d MMM yyyy",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors",
            "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">{selected ? format(selected, displayFormat) : placeholder}</span>
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => { if (d) onChange(format(d, "yyyy-MM-dd")); setOpen(false); }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
