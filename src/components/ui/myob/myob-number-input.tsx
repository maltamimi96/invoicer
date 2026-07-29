"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { myobControlClass } from "./myob-input";
import { evalExpression, looksLikeExpression } from "./calc";

/**
 * MYOB-style numeric input with a built-in calculator. Type a plain number and
 * it flows through live; type an expression (`5*3`, `(10+2)*4.5`) and it's
 * evaluated when you tab out or press Enter — matching MYOB's Qty / Unit price /
 * Discount / Amount fields. Invalid expressions revert to the last good value.
 */
export interface MyobNumberInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  /** Fixed decimal places to show when not editing (e.g. 2 for money). */
  decimals?: number;
  /** Bare-cell variant used inside the line grid (no border/height chrome). */
  bare?: boolean;
}

function trimNum(n: number): string {
  // Avoid float noise like 15.000000002 while keeping user precision.
  return String(Math.round(n * 1e6) / 1e6);
}

export const MyobNumberInput = React.forwardRef<HTMLInputElement, MyobNumberInputProps>(
  function MyobNumberInput({ value, onValueChange, decimals, bare, className, onFocus, onBlur, onKeyDown, ...props }, ref) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState("");

    const display = editing
      ? draft
      : decimals != null
        ? value.toFixed(decimals)
        : trimNum(value);

    const commit = () => {
      const raw = draft.trim();
      if (raw === "") {
        onValueChange(0);
      } else {
        const result = evalExpression(raw);
        if (result != null) onValueChange(result);
        // invalid → keep last committed value (do nothing)
      }
      setEditing(false);
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        className={cn(
          bare
            ? "w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            : myobControlClass,
          className,
        )}
        onFocus={(e) => {
          setEditing(true);
          setDraft(value ? trimNum(value) : "");
          e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          // Live-update the parent for plain numbers so totals track keystrokes;
          // expressions wait for commit (blur/Enter).
          if (!looksLikeExpression(next)) {
            const n = Number(next);
            if (next.trim() !== "" && Number.isFinite(n)) onValueChange(n);
            else if (next.trim() === "") onValueChange(0);
          }
        }}
        onBlur={(e) => { commit(); onBlur?.(e); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
          onKeyDown?.(e);
        }}
      />
    );
  },
);
