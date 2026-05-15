"use client";

import Link from "next/link";
import { GradientTile } from "./gradient-tile";
import { AnimatedPress } from "./animated-press";
import type { GradientName } from "./gradient-tokens";

/**
 * Compact fact card used in detail-page header grids — gradient icon
 * + label + value (+ optional onClick to make it tappable, e.g. for
 * reschedule, edit assigned, change address, etc.). Mirrors the mobile
 * job-portfolio fact card.
 */
interface FactCardProps {
  icon?: React.ReactNode;
  gradient?: GradientName;
  label: string;
  value: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export function FactCard({ icon, gradient = "primary", label, value, href, onClick }: FactCardProps) {
  const inner = (
    <AnimatedPress className={`flex items-start gap-3 p-3.5 rounded-xl border bg-card transition-colors h-full ${
      (href || onClick) ? "hover:border-primary/40 cursor-pointer" : "border-border"
    }`}>
      {icon && (
        <GradientTile gradient={gradient} size={36} radius={10}>
          {icon}
        </GradientTile>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm font-semibold text-foreground break-words mt-0.5">{value}</div>
      </div>
    </AnimatedPress>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="text-left w-full">{inner}</button>;
  return inner;
}
