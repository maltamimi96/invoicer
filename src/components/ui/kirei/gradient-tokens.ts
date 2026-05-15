/**
 * Kirei gradient tokens — mirrored from `mobile/src/lib/theme.ts` so the web
 * and mobile apps share the same visual language. Each gradient is a
 * `[fromHex, toHex]` tuple; consumers turn them into a CSS linear-gradient
 * via the `gradientCss()` helper below.
 *
 * Light + dark palettes share the same keys. The active palette is picked
 * by reading the `dark` class on `<html>` at render time inside React
 * components — for non-React contexts use `gradientCss(name, "light"|"dark")`.
 */

export const GRADIENTS = {
  primary:    ["#3a847e", "#1f4f4a"],
  primaryLit: ["#5fa8a2", "#2d6c66"],
  emerald:    ["#34d399", "#047857"],
  amber:      ["#fbbf24", "#b45309"],
  rose:       ["#fb7185", "#9f1239"],
  violet:     ["#a78bfa", "#6d28d9"],
  blue:       ["#60a5fa", "#1d4ed8"],
  coral:      ["#fb923c", "#c2410c"],
  softTeal:   ["#e7f1f0", "#d6e9e7"],
  softViolet: ["#ede9fe", "#dccef9"],
  softRose:   ["#fee2e2", "#fecaca"],
  softAmber:  ["#fef3c7", "#fde68a"],
  softBlue:   ["#dbeafe", "#bfdbfe"],
  sunrise:    ["#fda4af", "#fcd34d"],
  dusk:       ["#7c3aed", "#3a847e"],
  ocean:      ["#06b6d4", "#1f4f4a"],
} as const satisfies Record<string, readonly [string, string]>;

export const GRADIENTS_DARK = {
  primary:    ["#4ea69e", "#2d6c66"],
  primaryLit: ["#7ec5be", "#3a847e"],
  emerald:    ["#34d399", "#0f766e"],
  amber:      ["#fbbf24", "#92400e"],
  rose:       ["#fb7185", "#7f1d1d"],
  violet:     ["#a78bfa", "#5b21b6"],
  blue:       ["#60a5fa", "#1e3a8a"],
  coral:      ["#fb923c", "#9a3412"],
  softTeal:   ["#143536", "#0f2625"],
  softViolet: ["#2a1d4a", "#1a1133"],
  softRose:   ["#3f1a1f", "#2a1015"],
  softAmber:  ["#3a2a0f", "#2a1f08"],
  softBlue:   ["#0e234a", "#08182f"],
  sunrise:    ["#fb7185", "#fbbf24"],
  dusk:       ["#7c3aed", "#1f4f4a"],
  ocean:      ["#06b6d4", "#1f4f4a"],
} as const satisfies Record<string, readonly [string, string]>;

export type GradientName = keyof typeof GRADIENTS;

/** Build a CSS linear-gradient string for the given gradient name. Defaults
 *  to the light palette — callers that need dark-mode values can pass mode
 *  explicitly or use the `<GradientTile>` component which handles this. */
export function gradientCss(name: GradientName, mode: "light" | "dark" = "light"): string {
  const [from, to] = (mode === "dark" ? GRADIENTS_DARK : GRADIENTS)[name];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

/** CSS custom property pair we render inline on tiles so dark-mode swap
 *  happens via CSS, not JS. Component renders both light + dark vars and
 *  `.dark` overrides switch them. */
export function gradientVars(name: GradientName): React.CSSProperties {
  const [lFrom, lTo] = GRADIENTS[name];
  const [dFrom, dTo] = GRADIENTS_DARK[name];
  return {
    // The component reads --g-from / --g-to in its background-image.
    // The .dark variant overrides them via the data attribute below.
    "--g-from": lFrom,
    "--g-to":   lTo,
    "--g-from-dark": dFrom,
    "--g-to-dark":   dTo,
  } as React.CSSProperties;
}
