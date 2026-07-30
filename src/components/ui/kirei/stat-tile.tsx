"use client";

import Link from "next/link";
import type { GradientName } from "./gradient-tokens";

/**
 * Stat tile — a clean white card with a big value and a small tinted icon chip.
 * (The vibrant gradient background was dropped for the calmer MYOB/Linear look;
 * `gradient` is kept for API compatibility. `toneColor` still tints the icon
 * chip so KPIs stay lightly colour-coded without the loud fill.)
 */
interface StatTileProps {
  gradient?: GradientName;
  /** Hex colour (e.g. "#1f4f4a") used to tint the small icon chip. */
  toneColor: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  href?: string;
}

export function StatTile({ toneColor, icon, label, value, sub, href }: StatTileProps) {
  const card = (
    <div className="h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: `${toneColor}1a`, color: toneColor }}
        >
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
