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

// Clean white + teal. Near-white cool canvas, pure-white cards that lift on a
// hairline + soft shadow, near-black teal-undertone ink, one confident teal
// accent. The status hues (violet/rose/amber/…) are kept because they carry
// meaning in pills, but the surfaces are neutral, not tinted.
const LIGHT: ColorTokens = {
  canvas: "#f5f7f7", card: "#ffffff", surface2: "#eef2f2",
  hairline: "#e3e9e8", hairlineSoft: "#eef2f1",
  text: "#0e1a1a", muted: "#5c6b6b", subtle: "#93a1a1",
  primary: "#0f766e", primaryDeep: "#0b5b54", primarySoft: "#e6f2f1", primaryText: "#0b5b54",
  accent: "#0f766e", lime: "#0f766e", limeDeep: "#0b5b54",
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
  canvas: "#0b1211",          // near-black, faint teal undertone
  card: "#121a19",
  surface2: "#17211f",
  hairline: "#243230",
  hairlineSoft: "#1b2523",
  text: "#eef4f3",
  muted: "#8ea0a0",
  subtle: "#61716f",
  primary: "#2fbfb2",         // lifted teal on dark
  primaryDeep: "#1f8f85",
  primarySoft: "#0f2624",     // dark teal-tinted bg
  primaryText: "#8fe3db",
  accent: "#2fbfb2", lime: "#2fbfb2", limeDeep: "#1f8f85",
  violet: "#a78bfa", violetDeep: "#c4b5fd",
  rose: "#fda4af", roseDeep: "#fecaca",
  amber: "#fbbf24", amberDeep: "#fde68a",
  emerald: "#34d399", emeraldDeep: "#a7f3d0",
  blue: "#60a5fa", blueDeep: "#bfdbfe",
  coral: "#fb923c", coralDeep: "#fda4af",
  sun: "#fcd34d", sunDeep: "#fde68a",
  black: "#000000", white: "#ffffff",
};

// Gradients are largely retired in the white+teal system. Brand gradients
// become subtle teal-on-teal (near-flat), and the soft* tints go near-white so
// any card still built on `gradients.softX` renders as a clean, almost-flat
// surface instead of a coloured blob. Keys are all kept so no call-site breaks.
const LIGHT_GRADIENTS: GradientTokens = {
  primary:    ["#0f766e", "#0b5b54"],
  primaryLit: ["#149a8f", "#0f766e"],
  emerald:    ["#10b981", "#047857"],
  amber:      ["#f59e0b", "#b45309"],
  rose:       ["#f43f5e", "#9f1239"],
  violet:     ["#8b5cf6", "#6d28d9"],
  blue:       ["#3b82f6", "#1d4ed8"],
  coral:      ["#fb7185", "#c2410c"],
  softTeal:   ["#ffffff", "#eef4f3"],
  softViolet: ["#ffffff", "#f1eefb"],
  softRose:   ["#ffffff", "#fdeef0"],
  softAmber:  ["#ffffff", "#fbf3e2"],
  softBlue:   ["#ffffff", "#eef3fc"],
  sunrise:    ["#0f766e", "#149a8f"],
  dusk:       ["#0b5b54", "#0f766e"],
  ocean:      ["#0f766e", "#0b5b54"],
};

const DARK_GRADIENTS: GradientTokens = {
  primary:    ["#2fbfb2", "#1f8f85"],
  primaryLit: ["#5bd6cb", "#2fbfb2"],
  emerald:    ["#34d399", "#0f766e"],
  amber:      ["#fbbf24", "#92400e"],
  rose:       ["#fb7185", "#7f1d1d"],
  violet:     ["#a78bfa", "#5b21b6"],
  blue:       ["#60a5fa", "#1e3a8a"],
  coral:      ["#fb923c", "#9a3412"],
  // Soft cards on dark = barely-lifted neutral surfaces (near-flat)
  softTeal:   ["#17211f", "#121a19"],
  softViolet: ["#1c1a26", "#141119"],
  softRose:   ["#241619", "#181012"],
  softAmber:  ["#231d12", "#17130a"],
  softBlue:   ["#141d2b", "#0e1420"],
  sunrise:    ["#2fbfb2", "#1f8f85"],
  dusk:       ["#1f8f85", "#2fbfb2"],
  ocean:      ["#2fbfb2", "#1f8f85"],
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

/** Soft card elevation. Call at render (not a module const) so it re-reads the
 *  live palette. Shadows are near-invisible on the dark canvas, where the
 *  hairline border does the separating instead — that's fine, it's by design. */
export function cardShadow(level: 1 | 2 = 1) {
  return {
    shadowColor: "#0b3b37",
    shadowOpacity: level === 1 ? 0.06 : 0.1,
    shadowRadius: level === 1 ? 10 : 18,
    shadowOffset: { width: 0, height: level === 1 ? 4 : 8 },
    elevation: level === 1 ? 2 : 4,
  } as const;
}

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
