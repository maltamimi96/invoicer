"use client";

import { GRADIENTS, GRADIENTS_DARK, type GradientName } from "./gradient-tokens";
import { useEffect, useState } from "react";

/**
 * Initials avatar — hashes the name to a consistent gradient from the
 * Kirei palette so the same customer always renders in the same colour
 * across the app. Mirrors mobile's `Avatar` component.
 */

const POOL: GradientName[] = ["primary", "blue", "violet", "emerald", "amber", "coral", "rose", "dusk", "ocean"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).join("").toUpperCase().slice(0, 2) || "?";
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

interface Props {
  name: string;
  /** Pixel size of the square. */
  size?: number;
  /** Optional override gradient — defaults to a hash of the name. */
  gradient?: GradientName;
  /** Border-radius in px. Defaults to size/2 (circle). Pass a number for square-ish. */
  radius?: number;
  className?: string;
}

export function KireiAvatar({ name, size = 40, gradient, radius, className }: Props) {
  const isDark = useIsDark();
  const g = gradient ?? POOL[hash(name) % POOL.length];
  const [from, to] = (isDark ? GRADIENTS_DARK : GRADIENTS)[g];
  return (
    <div
      className={`flex items-center justify-center text-white font-semibold shrink-0 ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size / 2,
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        fontSize: size * 0.36,
        letterSpacing: -0.5,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
