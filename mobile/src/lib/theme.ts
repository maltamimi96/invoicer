/**
 * Cream-lime canvas + white cards + lime/violet accents — same family as the web app.
 */
export const colors = {
  canvas:    "#eaf0c8",
  card:      "#ffffff",
  text:      "#141414",
  muted:     "#6b6b6b",
  hairline:  "#e5e6dc",
  lime:      "#c4eb4a",
  limeDeep:  "#0f1a06",
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
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const STATUS_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  draft:       { bg: "#f1f1f1", fg: "#444",     label: "Draft"        },
  assigned:    { bg: "#dbeafe", fg: "#1e3a8a",  label: "Assigned"     },
  in_progress: { bg: "#fde68a", fg: "#78350f",  label: "In progress"  },
  submitted:   { bg: "#ddd6fe", fg: "#4c1d95",  label: "Submitted"    },
  reviewed:    { bg: "#fef3c7", fg: "#854d0e",  label: "Reviewed"     },
  completed:   { bg: "#bef264", fg: "#1a2e05",  label: "Completed"    },
  cancelled:   { bg: "#fecdd3", fg: "#7f1d1d",  label: "Cancelled"    },
};
