"use client";

import { IconContext } from "@phosphor-icons/react";

/**
 * Sets the global Phosphor icon weight + sizing baseline.
 * "regular" gives a 1.5px-style stroke that suits a modern SaaS UI.
 * Components still control size via Tailwind className (w-4 h-4 etc.) — Phosphor
 * inherits font-size which the className overrides.
 */
export function IconProvider({ children }: { children: React.ReactNode }) {
  return (
    <IconContext.Provider value={{ weight: "regular", size: "1em" }}>
      {children}
    </IconContext.Provider>
  );
}
