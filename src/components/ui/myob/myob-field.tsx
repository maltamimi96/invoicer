"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * MYOB-style field wrapper: a small caption label above the control, an
 * animated teal focus underline that scales in when anything inside gains
 * focus, and an inline error slot beneath.
 *
 * It derives focus from bubbling focus/blur events (focusin/focusout) on the
 * wrapper, so it works with any control — Input, Textarea, a Popover trigger,
 * the type-ahead select, etc. — without threading focus state through them.
 */
export interface MyobFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  /** Right-aligned adornment on the label row (e.g. a small action link). */
  labelAction?: React.ReactNode;
  className?: string;
  /** Hide the animated underline (e.g. for a control that supplies its own). */
  noUnderline?: boolean;
  children: React.ReactNode;
}

export function MyobField({
  label,
  htmlFor,
  required,
  error,
  hint,
  labelAction,
  className,
  noUnderline,
  children,
}: MyobFieldProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || labelAction) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-xs font-medium tracking-[0.01em] text-muted-foreground"
            >
              {label}
              {required && <span className="text-destructive"> *</span>}
            </label>
          )}
          {labelAction}
        </div>
      )}
      <div
        className="relative"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
      >
        {children}
        {!noUnderline && (
          <motion.span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] origin-left rounded-full",
              error ? "bg-destructive" : "bg-primary",
            )}
            initial={false}
            animate={{ scaleX: focused || !!error ? 1 : 0, opacity: focused || !!error ? 1 : 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
          />
        )}
      </div>
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
