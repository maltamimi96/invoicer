"use client";

import { IconContext } from "@phosphor-icons/react";

/**
 * Sets the global Phosphor icon weight + sizing baseline.
 * "duotone" adds a soft accent-tinted fill layer under the stroke, so icons
 * read as designed rather than plain outlines. Components still control size
 * via Tailwind className (w-4 h-4 etc.) — Phosphor inherits font-size which the
 * className overrides. The duotone secondary layer follows currentColor, so
 * icons rendered in the teal accent pick up a teal wash automatically.
 */
export function IconProvider({ children }: { children: React.ReactNode }) {
  return (
    <IconContext.Provider value={{ weight: "duotone", size: "1em" }}>
      {children}
    </IconContext.Provider>
  );
}
