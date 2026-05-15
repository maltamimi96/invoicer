"use client";

import { motion } from "framer-motion";

/**
 * Mobile-style segmented tabs — gradient active pill, optional count badge.
 * Use anywhere there's a tabbed list filter (Active/Archived, By status, etc).
 */
export interface KireiTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: ReadonlyArray<KireiTab<T>>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function KireiTabs<T extends string>({ tabs, value, onChange, className }: Props<T>) {
  return (
    <div className={`inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border ${className ?? ""}`}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="kirei-tab-pill"
                className="absolute inset-0 rounded-lg bg-card shadow-sm border border-border"
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
              />
            )}
            <span className="relative z-10">{t.label}</span>
            {typeof t.count === "number" && (
              <span className={`relative z-10 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                active ? "bg-primary/10 text-primary" : "bg-muted-foreground/15 text-muted-foreground"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
