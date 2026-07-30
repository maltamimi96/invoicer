"use client";

import * as React from "react";
import { Clock, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TimePickerProps {
  /** 24h "HH:mm" (empty = none). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  /** Minutes between options (default 15). */
  minuteStep?: number;
}

export function formatTime12(value: string): string {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr), m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** A time field: a button showing the formatted time that opens a popover with
 *  a scrollable list of options. Value in/out is 24h "HH:mm" (drop-in for
 *  `<input type="time">`). */
export function TimePicker({
  value, onChange, id, placeholder = "Pick a time", disabled, className, clearable, minuteStep = 15,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const options = React.useMemo(() => {
    const out: string[] = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += minuteStep) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    return out;
  }, [minuteStep]);

  // Scroll the selected (or nearest) option into view on open.
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
      el?.scrollIntoView({ block: "center" });
    }, 20);
    return () => clearTimeout(t);
  }, [open]);

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
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">{value ? formatTime12(value) : placeholder}</span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear time"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        <div ref={listRef} className="max-h-64 overflow-y-auto">
          {options.map((t) => {
            const active = t === value;
            return (
              <button
                key={t}
                type="button"
                data-selected={active}
                onClick={() => { onChange(t); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                  active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                )}
              >
                {formatTime12(t)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
