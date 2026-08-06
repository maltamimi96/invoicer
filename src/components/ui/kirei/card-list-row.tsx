"use client";

import Link from "next/link";
import { ChevronRight } from "@/components/ui/icons";
import { AnimatedPress } from "./animated-press";
import { GradientTile } from "./gradient-tile";
import type { GradientName } from "./gradient-tokens";

/**
 * Mobile-style card-list row — replaces table rows on the new dashboard
 * widgets. Gradient avatar tile + title + meta + optional trailing value
 * + chevron. Wraps in a Link when `href` is set.
 */
interface CardListRowProps {
  href?: string;
  gradient?: GradientName;
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function CardListRow({ href, gradient = "primary", icon, title, meta, trailing }: CardListRowProps) {
  const inner = (
    <AnimatedPress
      className="flex items-center gap-3 p-3 rounded-md bg-card border border-border/70 hover:border-primary/30 transition-colors"
    >
      {icon && (
        <GradientTile gradient={gradient} size={40} radius={10}>
          {icon}
        </GradientTile>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground break-words">{title}</div>
        {meta && <div className="text-xs text-muted-foreground mt-0.5 break-words">{meta}</div>}
      </div>
      {trailing && <div className="text-sm font-semibold text-foreground tabular-nums shrink-0">{trailing}</div>}
      {href && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </AnimatedPress>
  );

  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}
