"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";

export interface DateTimePickerProps {
  /** "yyyy-MM-ddTHH:mm" (empty = none). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  minuteStep?: number;
  /** Time used when a date is picked but no time is set yet. */
  defaultTime?: string;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date + time combined into one field. Value in/out is the local
 *  "yyyy-MM-ddTHH:mm" string (drop-in for `<input type="datetime-local">`). */
export function DateTimePicker({ value, onChange, disabled, className, minuteStep = 15, defaultTime = "09:00" }: DateTimePickerProps) {
  const [datePart, timePart] = (value || "").split("T");

  return (
    <div className={cn("flex gap-2", className)}>
      <DatePicker
        value={datePart ?? ""}
        disabled={disabled}
        className="flex-1"
        onChange={(d) => onChange(d ? `${d}T${timePart || defaultTime}` : "")}
      />
      <TimePicker
        value={timePart ?? ""}
        disabled={disabled}
        className="w-32 shrink-0"
        minuteStep={minuteStep}
        onChange={(t) => onChange(`${datePart || todayStr()}T${t}`)}
      />
    </div>
  );
}
