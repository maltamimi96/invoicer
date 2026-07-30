"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarDays } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { myobControlClass } from "./myob-input";

/**
 * MYOB-style date control: a 44px trigger showing the formatted date, opening a
 * calendar popover. Value in/out is the `yyyy-MM-dd` string the editors' RHF
 * fields already use, so it's a drop-in for `<Input type="date">`.
 */
export interface MyobDateFieldProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export function MyobDateField({ value, onChange, id, placeholder = "Select date", disabled, className }: MyobDateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(myobControlClass, "items-center justify-between text-left", !selected && "text-muted-foreground", className)}
        >
          <span>{selected ? format(selected, "d MMM yyyy") : placeholder}</span>
          <CalendarDays className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
