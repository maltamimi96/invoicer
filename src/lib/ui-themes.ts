/**
 * The Kirei Dashboard v2 palettes.
 *
 * Light vs dark is a property of the theme, not a separate switch — Daylight
 * is the light one. `swatch`/`ring` mirror the design's own theme picker so
 * the dot in the header reads as the theme it selects.
 *
 * Plain module, deliberately. This list also drives the no-flash boot script
 * in the root layout, which is a SERVER component: importing it from the
 * "use client" provider would hand the server a client-reference proxy rather
 * than the array, and `.map()` on that throws at build time. So the data lives
 * here and the provider re-exports it.
 */

export const UI_THEMES = [
  { key: "Midnight", label: "Midnight", swatch: "#3B82F6", ring: "#111A29", dark: true  },
  { key: "Daylight", label: "Daylight", swatch: "#2563EB", ring: "#FFFFFF", dark: false },
  { key: "Azure",    label: "Azure",    swatch: "#7DD3FC", ring: "#0C2A56", dark: true  },
  { key: "Orchid",   label: "Orchid",   swatch: "#8B5CF6", ring: "#1B1030", dark: true  },
  // Built from the Connected Studio logo — slate blue plate, lime accent.
  { key: "Studio",   label: "Studio",   swatch: "#C4F000", ring: "#35576B", dark: true  },
] as const;

export type UiThemeKey = (typeof UI_THEMES)[number]["key"];

/** Themes whose surfaces are light. Everything else gets the `.dark` class. */
export const LIGHT_THEMES: readonly string[] = UI_THEMES.filter((t) => !t.dark).map((t) => t.key);

/** Every theme key, for the boot script's allow-list. */
export const UI_THEME_KEYS: readonly string[] = UI_THEMES.map((t) => t.key);

export const DEFAULT_UI_THEME: UiThemeKey = "Midnight";

/** Where the no-flash boot script in the root layout stashes the choice. */
export const UI_THEME_STORAGE_KEY = "kirei.ui-theme";

export function isUiTheme(v: unknown): v is UiThemeKey {
  return typeof v === "string" && UI_THEMES.some((t) => t.key === v);
}
