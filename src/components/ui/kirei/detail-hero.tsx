"use client";

import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { GradientTile } from "./gradient-tile";
import { KireiPill } from "./pill";
import { AnimatedPress } from "./animated-press";
import { FadeIn } from "./fade-in";
import type { GradientName } from "./gradient-tokens";

/**
 * Detail-page hero — gradient icon tile + eyebrow ref + title + status pill,
 * with a slot for primary actions on the right and an optional secondary
 * subtitle row. Mirrors the mobile detail-screen hero.
 */
interface Props {
  /** Optional back-link target. Falls back to a router-back button-style. */
  backHref?: string;
  /** Eyebrow text (typically the entity number / ref). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Status tone — same vocabulary as KireiPill. */
  status?: string;
  /** Optional override label for the status pill (defaults to humanised tone). */
  statusLabel?: React.ReactNode;
  /** Gradient for the leading tile. */
  gradient?: GradientName;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function DetailHero({
  backHref, eyebrow, title, subtitle, status, statusLabel, gradient = "primary", icon, actions,
}: Props) {
  return (
    <FadeIn>
      <div className="flex items-center gap-4 flex-wrap">
        {backHref && (
          <Link href={backHref}>
            <AnimatedPress className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </AnimatedPress>
          </Link>
        )}
        {icon && (
          <GradientTile gradient={gradient} size={52} radius={14}>
            {icon}
          </GradientTile>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {eyebrow && <span className="font-mono text-xs text-muted-foreground">{eyebrow}</span>}
            {status && <KireiPill tone={status}>{statusLabel}</KireiPill>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate mt-0.5">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </FadeIn>
  );
}
