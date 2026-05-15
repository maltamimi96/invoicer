"use client";

import Link from "next/link";
import { AnimatedPress } from "./animated-press";
import { GradientTile } from "./gradient-tile";
import type { GradientName } from "./gradient-tokens";

/**
 * Mobile-style empty state — gradient halo + title + hint + optional CTA.
 * Replaces the old `.ch-empty` block on list pages.
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  gradient?: GradientName;
  title: string;
  hint?: string;
  cta?: { label: string; href: string; icon?: React.ReactNode };
}

export function EmptyState({ icon, gradient = "primary", title, hint, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {icon && (
        <div className="mb-4">
          <GradientTile gradient={gradient} size={64} radius={20}>
            {icon}
          </GradientTile>
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {cta && (
        <Link href={cta.href} className="mt-5">
          <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
            {cta.icon}
            {cta.label}
          </AnimatedPress>
        </Link>
      )}
    </div>
  );
}
