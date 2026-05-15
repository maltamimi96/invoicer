"use client";

import { useEffect, useState } from "react";
import { GRADIENTS, GRADIENTS_DARK, type GradientName } from "./gradient-tokens";

/**
 * Square gradient tile that houses an icon — the recurring shape from the
 * mobile app. Sizes mirror mobile defaults (md = 48px).
 *
 * Subscribes to the `dark` class on <html> so the gradient swaps when
 * the user flips theme without a remount.
 */
interface Props {
  /** Gradient palette key (see `gradient-tokens.ts`). */
  gradient: GradientName;
  /** Pixel size of the square. */
  size?: number;
  /** Border-radius in px. Defaults match Kirei's "lg" (14). */
  radius?: number;
  /** Icon content — typically a lucide icon at `size * 0.45`. */
  children: React.ReactNode;
  className?: string;
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function GradientTile({ gradient, size = 48, radius = 14, children, className }: Props) {
  const isDark = useIsDark();
  const [from, to] = (isDark ? GRADIENTS_DARK : GRADIENTS)[gradient];

  return (
    <div
      className={`flex items-center justify-center text-white shrink-0 ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
      }}
    >
      {children}
    </div>
  );
}
