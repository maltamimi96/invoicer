"use client";

/**
 * The four-dot theme picker from the header of the Kirei Dashboard v2 design.
 *
 * It replaces the old light/dark toggle rather than sitting beside it: light
 * and dark are now properties of the theme (Daylight is the light one), so two
 * controls would contradict each other — pick Midnight, then "light mode", and
 * neither the app nor the user knows what was meant.
 *
 * Buttons, not divs: this is a real control and has to be reachable by keyboard.
 */

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppearance, UI_THEMES, type UiThemeKey } from "./appearance-provider";
import { setUiTheme as persistUiTheme } from "@/lib/actions/appearance";

export function ThemeSwatches({ className }: { className?: string }) {
  const { uiTheme, setUiTheme } = useAppearance();
  const [, startTransition] = useTransition();

  const pick = (key: UiThemeKey) => {
    // Applied locally first so the whole app repaints on the click, then
    // persisted. If saving fails the theme still changed for this session —
    // say so rather than silently reverting under them.
    setUiTheme(key);
    startTransition(async () => {
      const res = await persistUiTheme(key);
      if (!res.ok) toast.error(`${res.error} — the theme will reset on your next visit.`);
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "hidden items-center gap-2 rounded-full border border-border bg-card p-1.5 sm:flex",
        className,
      )}
    >
      {UI_THEMES.map((t) => {
        const active = uiTheme === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={active}
            title={t.label}
            aria-label={t.label}
            onClick={() => pick(t.key)}
            className={cn(
              "h-[26px] w-[26px] rounded-full transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
              active ? "scale-100 outline outline-2 outline-foreground" : "scale-[0.88] outline outline-2 outline-transparent",
            )}
            // The inner ring is the theme's own panel colour, so each dot reads
            // as a miniature of the theme it selects — straight from the mock.
            style={{ background: t.swatch, boxShadow: `inset 0 0 0 3px ${t.ring}` }}
          />
        );
      })}
    </div>
  );
}
