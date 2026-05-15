"use client";

import Link from "next/link";
import { ChevronRight } from "@/components/ui/icons";
import { AnimatedPress } from "./animated-press";
import { GradientTile } from "./gradient-tile";
import type { GradientName } from "./gradient-tokens";

/**
 * Mobile-style hub card: gradient icon tile + label + hint + chevron, all
 * wrapped in a hairline-bordered Link card. Used on the dashboard and any
 * future "hub" surface (Sales hub, Settings hub, etc.).
 */
interface HubTileProps {
  href: string;
  gradient: GradientName;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  /** Optional right-aligned value (e.g. count badge or currency). */
  trailing?: React.ReactNode;
}

export function HubTile({ href, gradient, icon, label, hint, trailing }: HubTileProps) {
  return (
    <Link href={href} className="block">
      <AnimatedPress
        className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
      >
        <GradientTile gradient={gradient} size={48}>
          {icon}
        </GradientTile>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground truncate">{label}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{hint}</p>}
        </div>
        {trailing ? (
          <div className="text-sm font-semibold text-foreground shrink-0">{trailing}</div>
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </AnimatedPress>
    </Link>
  );
}
