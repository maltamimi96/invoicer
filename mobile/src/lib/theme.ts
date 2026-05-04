/**
 * Connected Hub design tokens — matches the web app's [data-theme="console"]
 * palette: warm off-white canvas, white cards, deep-teal accent, hairline
 * borders, 10/14/20px radii. Mirror the web tokens any time they change.
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
  primaryDeep: "#2d6c66",
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
  black:     "#0a0a0a",
  white:     "#ffffff",

  // Legacy aliases (older screens still import these — keep until refactored)
  lime:      "#3a847e",
  limeDeep:  "#1f4f4a",
} as const;

export const radius = { sm: 8, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

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
