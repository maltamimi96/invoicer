"use client";

import { GradientTile } from "./gradient-tile";
import type { GradientName } from "./gradient-tokens";

/**
 * Card-shaped section used inside forms — gradient micro-tile header +
 * title + hint + body. Replaces the pattern of `Card > CardContent >
 * h3.uppercase + form fields`.
 */
interface Props {
  icon?: React.ReactNode;
  gradient?: GradientName;
  title: string;
  hint?: React.ReactNode;
  /** Optional action slot pinned to the top-right of the section header. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ icon, gradient = "primary", title, hint, actions, children, className }: Props) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {icon && (
            <GradientTile gradient={gradient} size={36} radius={10}>
              {icon}
            </GradientTile>
          )}
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
