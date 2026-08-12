"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GradientName } from "./gradient-tokens";

/**
 * Stat tile — a card with a big value and a small tinted icon chip.
 *
 * The chip used to be painted from a `toneColor` hex prop, and every call site
 * passed a 900-level colour picked against a white card: #1f4f4a, #1e3a8a,
 * #064e3b, #9f1239. The app ships `data-theme="Midnight"` by default, whose
 * card is roughly #1a2333 — a #1e3a8a glyph on that is about 1.2:1, which is
 * to say invisible. This is the KPI strip on Invoices, Quotes, Leads,
 * Customers, Work Orders and every customer detail page, so it was the first
 * thing both businesses saw on almost every screen, and it only ever looked
 * right on the one light theme nobody was using.
 *
 * So the tone is now a name, not a colour, and the colour comes from the
 * theme. No hex survives in this file — that is the point of it.
 */

export type StatTone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

const TONES: Record<StatTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  info: "bg-primary/15 text-primary",
  accent: "bg-accent-2/15 text-accent-2",
};

interface StatTileProps {
  /** Retained for API compatibility; the vibrant fill was dropped long ago. */
  gradient?: GradientName;
  /** What the number MEANS, not what colour to paint it. */
  tone?: StatTone;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  href?: string;
}

export function StatTile({ tone = "info", icon, label, value, sub, href }: StatTileProps) {
  const card = (
    <div className="h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", TONES[tone])}>
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  return card;
}
