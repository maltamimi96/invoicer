/**
 * Kirei (the mobile app) design tokens — light + dark palettes that share the same
 * keys. The exported `colors` and `gradients` objects are mutated in place
 * by `applyTheme(mode)` so existing imports continue to work; components
 * subscribe to changes via the ThemeProvider context which forces a
 * re-render on switch.
 */

export const radius = { sm: 8, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export type ColorTokens = {
  canvas: string; card: string; surface2: string; hairline: string; hairlineSoft: string;
  text: string; muted: string; subtle: string;
  primary: string; primaryDeep: string; primarySoft: string; primaryText: string;
  accent: string; lime: string; limeDeep: string;
  violet: string; violetDeep: string;
  rose: string; roseDeep: string;
  amber: string; amberDeep: string;
  emerald: string; emeraldDeep: string;
  blue: string; blueDeep: string;
  coral: string; coralDeep: string;
  sun: string; sunDeep: string;
  black: string; white: string;
};

export type GradientTokens = Record<
  | "primary" | "primaryLit"
  | "emerald" | "amber" | "rose" | "violet" | "blue" | "coral"
  | "softTeal" | "softViolet" | "softRose" | "softAmber" | "softBlue"
  | "sunrise" | "dusk" | "ocean",
  [string, string]
>;

const LIGHT: ColorTokens = {
  canvas: "#fafaf7", card: "#ffffff", surface2: "#f5f4ef",
  hairline: "#e5e3d9", hairlineSoft: "#ecebe4",
  text: "#1a1a17", muted: "#6b6a62", subtle: "#9a988e",
  primary: "#3a847e", primaryDeep: "#1f4f4a", primarySoft: "#e7f1f0", primaryText: "#1f4f4a",
  accent: "#3a847e", lime: "#3a847e", limeDeep: "#1f4f4a",
  violet: "#c4b5fd", violetDeep: "#3b1d6b",
  rose: "#fecdd3", roseDeep: "#7f1d1d",
  amber: "#fde68a", amberDeep: "#78350f",
  emerald: "#bbf7d0", emeraldDeep: "#064e3b",
  blue: "#bfdbfe", blueDeep: "#1e3a8a",
  coral: "#fda4af", coralDeep: "#9f1239",
  sun: "#fcd34d", sunDeep: "#92400e",
  black: "#0a0a0a", white: "#ffffff",
};

const DARK: ColorTokens = {
  canvas: "#0c0d0f",
  card: "#181a1d",
  surface2: "#1f2125",
  hairline: "#2a2c30",
  hairlineSoft: "#22242a",
  text: "#f5f4ef",
  muted: "#9a988e",
  subtle: "#6b6a62",
  primary: "#4ea69e",         // lifted on dark
  primaryDeep: "#2d6c66",
  primarySoft: "#143536",     // dark teal-tinted bg
  primaryText: "#a7d7d3",
  accent: "#4ea69e", lime: "#4ea69e", limeDeep: "#2d6c66",
  violet: "#a78bfa", violetDeep: "#c4b5fd",
  rose: "#fda4af", roseDeep: "#fecaca",
  amber: "#fbbf24", amberDeep: "#fde68a",
  emerald: "#34d399", emeraldDeep: "#a7f3d0",
  blue: "#60a5fa", blueDeep: "#bfdbfe",
  coral: "#fb923c", coralDeep: "#fda4af",
  sun: "#fcd34d", sunDeep: "#fde68a",
  black: "#000000", white: "#ffffff",
};

const LIGHT_GRADIENTS: GradientTokens = {
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
};

const DARK_GRADIENTS: GradientTokens = {
  // Brand gradients stay punchy on dark — make them brighter, not muddier
  primary:    ["#4ea69e", "#2d6c66"],
  primaryLit: ["#7ec5be", "#3a847e"],
  emerald:    ["#34d399", "#0f766e"],
  amber:      ["#fbbf24", "#92400e"],
  rose:       ["#fb7185", "#7f1d1d"],
  violet:     ["#a78bfa", "#5b21b6"],
  blue:       ["#60a5fa", "#1e3a8a"],
  coral:      ["#fb923c", "#9a3412"],
  // Soft cards on dark = deep tinted backgrounds
  softTeal:   ["#143536", "#0f2625"],
  softViolet: ["#2a1d4a", "#1a1133"],
  softRose:   ["#3f1a1f", "#2a1015"],
  softAmber:  ["#3a2a0f", "#2a1f08"],
  softBlue:   ["#0e234a", "#08182f"],
  // Heroes — brighter on dark for confident contrast
  sunrise:    ["#fb7185", "#fbbf24"],
  dusk:       ["#7c3aed", "#1f4f4a"],
  ocean:      ["#06b6d4", "#1f4f4a"],
};

// Mutable exports — applyTheme() rewrites them in place so any code that
// reads `colors.text` at render time sees the active value.
export const colors:    ColorTokens    = { ...LIGHT };
export const gradients: GradientTokens = JSON.parse(JSON.stringify(LIGHT_GRADIENTS));

/** Swap the live palette. Call this from the ThemeProvider on mode change. */
export function applyTheme(mode: "light" | "dark"): void {
  const c = mode === "dark" ? DARK : LIGHT;
  const g = mode === "dark" ? DARK_GRADIENTS : LIGHT_GRADIENTS;
  Object.assign(colors, c);
  // Replace gradient arrays element-by-element so the array references stay
  // stable for any consumer that captured the reference up-front.
  (Object.keys(g) as Array<keyof GradientTokens>).forEach((key) => {
    gradients[key][0] = g[key][0];
    gradients[key][1] = g[key][1];
  });
}

export type GradientName = keyof GradientTokens;

/** Status → small pill (used in lists). Uses live colour tokens. */
export const STATUS_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  draft:       { bg: "#f1f1f1", fg: "#444",     label: "Draft"        },
  assigned:    { bg: "#dbeafe", fg: "#1e3a8a",  label: "Assigned"     },
  in_progress: { bg: "#fde68a", fg: "#78350f",  label: "In progress"  },
  submitted:   { bg: "#ddd6fe", fg: "#4c1d95",  label: "Submitted"    },
  reviewed:    { bg: "#fef3c7", fg: "#854d0e",  label: "Reviewed"     },
  completed:   { bg: "#bbf7d0", fg: "#064e3b",  label: "Completed"    },
  cancelled:   { bg: "#fecdd3", fg: "#7f1d1d",  label: "Cancelled"    },
};

/** Returns a time-of-day-appropriate hero gradient name. Looks better than
 *  exporting the array directly — callers resolve via gradients[name] so
 *  they pick up the current theme's palette. */
export function timeOfDayGradient(): readonly [string, string] {
  const h = new Date().getHours();
  if (h < 6)  return gradients.dusk;
  if (h < 11) return gradients.sunrise;
  if (h < 17) return gradients.primary;
  if (h < 20) return gradients.coral;
  return gradients.dusk;
}
