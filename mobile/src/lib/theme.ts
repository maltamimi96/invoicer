/**
 * Connected Hub design tokens — warm off-white canvas with rich teal accent
 * and a tasteful set of complementary gradients used across hero blocks,
 * KPI cards, and primary CTAs. Mirror web tokens any time they change.
 */
export const colors = {
  // Surfaces
  canvas:    "#fafaf7",
  card:      "#ffffff",
  surface2:  "#f5f4ef",   // muted bg for chips, table headers
  hairline:  "#e5e3d9",   // borders
  hairlineSoft: "#ecebe4",

  // Text
  text:      "#1a1a17",
  muted:     "#6b6a62",
  subtle:    "#9a988e",

  // Brand (deep teal)
  primary:     "#3a847e",
  primaryDeep: "#1f4f4a",
  primarySoft: "#e7f1f0",
  primaryText: "#1f4f4a",

  // Accents — kept for status / category use; teal stays primary.
  accent:    "#3a847e",   // alias of primary for legacy callers
  violet:    "#c4b5fd",
  violetDeep:"#3b1d6b",
  rose:      "#fecdd3",
  roseDeep:  "#7f1d1d",
  amber:     "#fde68a",
  amberDeep: "#78350f",
  emerald:   "#bbf7d0",
  emeraldDeep:"#064e3b",
  blue:      "#bfdbfe",
  blueDeep:  "#1e3a8a",
  coral:     "#fda4af",
  coralDeep: "#9f1239",
  sun:       "#fcd34d",
  sunDeep:   "#92400e",
  black:     "#0a0a0a",
  white:     "#ffffff",

  // Legacy aliases
  lime:      "#3a847e",
  limeDeep:  "#1f4f4a",
} as const;

export const radius = { sm: 8, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Curated gradient pairs (start, end) used by GradientCard / Hero / pills. */
export const gradients = {
  // Hero blocks — warm and confident
  primary:    ["#3a847e", "#1f4f4a"] as [string, string],
  primaryLit: ["#5fa8a2", "#2d6c66"] as [string, string],
  // Status / KPI accents
  emerald:    ["#34d399", "#047857"] as [string, string],
  amber:      ["#fbbf24", "#b45309"] as [string, string],
  rose:       ["#fb7185", "#9f1239"] as [string, string],
  violet:     ["#a78bfa", "#6d28d9"] as [string, string],
  blue:       ["#60a5fa", "#1d4ed8"] as [string, string],
  coral:      ["#fb923c", "#c2410c"] as [string, string],
  // Soft tinted card backgrounds (very low contrast, good behind text)
  softTeal:   ["#e7f1f0", "#d6e9e7"] as [string, string],
  softViolet: ["#ede9fe", "#dccef9"] as [string, string],
  softRose:   ["#fee2e2", "#fecaca"] as [string, string],
  softAmber:  ["#fef3c7", "#fde68a"] as [string, string],
  softBlue:   ["#dbeafe", "#bfdbfe"] as [string, string],
  // Sky / sunrise — for greetings
  sunrise:    ["#fda4af", "#fcd34d"] as [string, string],
  dusk:       ["#7c3aed", "#3a847e"] as [string, string],
  ocean:      ["#06b6d4", "#1f4f4a"] as [string, string],
} as const;

export type GradientName = keyof typeof gradients;

/** Status → small pill (used in lists). */
export const STATUS_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  draft:       { bg: "#f1f1f1", fg: "#444",     label: "Draft"        },
  assigned:    { bg: "#dbeafe", fg: "#1e3a8a",  label: "Assigned"     },
  in_progress: { bg: "#fde68a", fg: "#78350f",  label: "In progress"  },
  submitted:   { bg: "#ddd6fe", fg: "#4c1d95",  label: "Submitted"    },
  reviewed:    { bg: "#fef3c7", fg: "#854d0e",  label: "Reviewed"     },
  completed:   { bg: "#bbf7d0", fg: "#064e3b",  label: "Completed"    },
  cancelled:   { bg: "#fecdd3", fg: "#7f1d1d",  label: "Cancelled"    },
};

/** Returns a time-of-day-appropriate hero gradient. */
export function timeOfDayGradient(): readonly [string, string] {
  const h = new Date().getHours();
  if (h < 6)  return gradients.dusk;       // late night → dusk purple → teal
  if (h < 11) return gradients.sunrise;    // morning → coral → sun
  if (h < 17) return gradients.primary;    // afternoon → confident teal
  if (h < 20) return gradients.coral;      // evening → warm coral
  return gradients.dusk;                   // night → dusk
}
