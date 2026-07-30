"use client";

import type { GradientName } from "./gradient-tokens";

/**
 * Icon tile — a clean, flat accent-tinted chip that houses an icon. (Named
 * "GradientTile" for historical reasons; the vibrant gradients were dropped in
 * favour of the calmer MYOB/Linear look. The `gradient` prop is kept for API
 * compatibility but no longer changes the fill.)
 */
interface Props {
  /** Retained for API compatibility; no longer affects the fill. */
  gradient?: GradientName;
  /** Pixel size of the square. */
  size?: number;
  /** Border-radius in px. Defaults match Kirei's "lg" (14). */
  radius?: number;
  children: React.ReactNode;
  className?: string;
}

export function GradientTile({ size = 48, radius = 14, children, className }: Props) {
  return (
    <div
      className={`flex items-center justify-center shrink-0 bg-primary/10 text-primary ${className ?? ""}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {children}
    </div>
  );
}
