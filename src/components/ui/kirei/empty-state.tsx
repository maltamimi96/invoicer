"use client";

import Link from "next/link";
import { AnimatedPress } from "./animated-press";
import { GradientTile } from "./gradient-tile";
import type { GradientName } from "./gradient-tokens";

/**
 * Mobile-style empty state — gradient halo + title + hint + optional CTA.
 * Replaces the old `.ch-empty` block on list pages.
 */
/**
 * The call to action either navigates or runs something — never both, and never
 * neither.
 *
 * It used to be `{ href: string }` only, so a state whose action opens a dialog
 * had nowhere to put the handler and reached for `href: "#"`. Two of them
 * shipped: a brand-new business's first act on /products and /materials was a
 * button that did nothing at all. Modelling the two cases as a union means the
 * dead-link shortcut no longer type-checks.
 */
type EmptyStateCta =
  | { label: string; href: string; icon?: React.ReactNode; onClick?: never }
  | { label: string; onClick: () => void; icon?: React.ReactNode; href?: never };

interface EmptyStateProps {
  icon?: React.ReactNode;
  gradient?: GradientName;
  title: string;
  hint?: string;
  cta?: EmptyStateCta;
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
        cta.href ? (
          <Link href={cta.href} className="mt-5">
            <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
              {cta.icon}
              {cta.label}
            </AnimatedPress>
          </Link>
        ) : (
          <button type="button" onClick={cta.onClick} className="mt-5">
            <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
              {cta.icon}
              {cta.label}
            </AnimatedPress>
          </button>
        )
      )}
    </div>
  );
}
