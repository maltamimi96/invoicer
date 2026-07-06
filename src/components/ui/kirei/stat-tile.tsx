"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GRADIENTS, GRADIENTS_DARK, type GradientName } from "./gradient-tokens";

/**
 * Mobile-style stat tile: subtle gradient background, big numeric value,
 * coloured label and icon. Optional href turns it into a Link card.
 *
 * Uses "soft" gradient names (softTeal, softViolet, etc.) so the
 * background reads as a tinted card, not a saturated brand splash.
 */
interface StatTileProps {
  gradient: GradientName;
  /** Tone for the icon + label text, e.g. "#1f4f4a" for primary. */
  toneColor: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  href?: string;
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

export function StatTile({ gradient, toneColor, icon, label, value, sub, href }: StatTileProps) {
  const isDark = useIsDark();
  const [from, to] = (isDark ? GRADIENTS_DARK : GRADIENTS)[gradient];

  const card = (
    <div
      className="rounded-xl p-4 border border-border h-full"
      style={{
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.55)", color: toneColor }}
        >
          {icon}
        </div>
        <p
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: toneColor, opacity: isDark ? 0.85 : 0.75 }}
        >
          {label}
        </p>
      </div>
      <p className="text-2xl font-semibold mt-3 text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-95 transition-opacity">
        {card}
      </Link>
    );
  }
  return card;
}
