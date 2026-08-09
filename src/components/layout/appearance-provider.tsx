"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";

/**
 * The Kirei Dashboard v2 palettes.
 *
 * Light vs dark is a property of the theme, not a separate switch — Daylight
 * is the light one. `swatch`/`ring` mirror the design's own theme picker so
 * the dot in the header reads as the theme it selects.
 */
export const UI_THEMES = [
  { key: "Midnight", label: "Midnight", swatch: "#3B82F6", ring: "#111A29", dark: true  },
  { key: "Daylight", label: "Daylight", swatch: "#2563EB", ring: "#FFFFFF", dark: false },
  { key: "Azure",    label: "Azure",    swatch: "#7DD3FC", ring: "#0C2A56", dark: true  },
  { key: "Orchid",   label: "Orchid",   swatch: "#8B5CF6", ring: "#1B1030", dark: true  },
] as const;

export type UiThemeKey = (typeof UI_THEMES)[number]["key"];

export const DEFAULT_UI_THEME: UiThemeKey = "Midnight";

/** Where the no-flash boot script in the root layout stashes the choice. */
export const UI_THEME_STORAGE_KEY = "kirei.ui-theme";

export function isUiTheme(v: unknown): v is UiThemeKey {
  return typeof v === "string" && UI_THEMES.some((t) => t.key === v);
}

export const ACCENT_PRESETS = [
  { key: "teal",    label: "Teal",    hex: "#3a847e" },
  { key: "blue",    label: "Blue",    hex: "#2563eb" },
  { key: "violet",  label: "Violet",  hex: "#7c3aed" },
  { key: "emerald", label: "Emerald", hex: "#059669" },
  { key: "rose",    label: "Rose",    hex: "#e11d48" },
  { key: "orange",  label: "Orange",  hex: "#f97316" },
  { key: "amber",   label: "Amber",   hex: "#d97706" },
  { key: "slate",   label: "Slate",   hex: "#64748b" },
] as const;

export const PATTERN_PRESETS = [
  { key: "none",     label: "None" },
  { key: "dots",     label: "Dots" },
  { key: "grid",     label: "Grid" },
  { key: "diagonal", label: "Lines" },
  { key: "cross",    label: "Cross" },
] as const;

// sidebarBg / sidebarFg / sidebarAccent used only for preview rendering —
// the real values live in CSS. All combos pass WCAG AA (≥4.5:1).
export const SIDEBAR_THEMES = [
  {
    key: "light",
    label: "Light",
    dark: false,
    sidebarBg: "#ffffff",
    sidebarFg: "#1a1a17",
    sidebarAccent: "#f5f4ef",
    dot: "#3a847e",
  },
  {
    key: "soft",
    label: "Soft",
    dark: false,
    sidebarBg: "#fafaf7",
    sidebarFg: "#1a1a17",
    sidebarAccent: "#ecebe4",
    dot: "#3a847e",
  },
  {
    key: "dark-navy",
    label: "Dark Navy",
    dark: true,
    sidebarBg: "#0f172a",
    sidebarFg: "#cbd5e1",
    sidebarAccent: "#1e293b",
    dot: "#3b82f6",
  },
  {
    key: "midnight",
    label: "Midnight",
    dark: true,
    sidebarBg: "#09090b",
    sidebarFg: "#e4e4e7",
    sidebarAccent: "#18181b",
    dot: "#818cf8",
  },
  {
    key: "forest",
    label: "Forest",
    dark: true,
    sidebarBg: "#0a1f13",
    sidebarFg: "#bbf7d0",
    sidebarAccent: "#14321f",
    dot: "#4ade80",
  },
  {
    key: "ocean",
    label: "Ocean",
    dark: true,
    sidebarBg: "#071921",
    sidebarFg: "#bae6fd",
    sidebarAccent: "#0c2535",
    dot: "#38bdf8",
  },
  {
    key: "plum",
    label: "Plum",
    dark: true,
    sidebarBg: "#160d26",
    sidebarFg: "#e9d5ff",
    sidebarAccent: "#231040",
    dot: "#a78bfa",
  },
  {
    key: "rose-dark",
    label: "Rose",
    dark: true,
    sidebarBg: "#1c0a11",
    sidebarFg: "#fecdd3",
    sidebarAccent: "#2d0f1c",
    dot: "#fb7185",
  },
  {
    key: "slate-mid",
    label: "Slate",
    dark: true,
    sidebarBg: "#1e2533",
    sidebarFg: "#cbd5e1",
    sidebarAccent: "#2d3748",
    dot: "#94a3b8",
  },
] as const;

interface AppearanceContextValue {
  accentColor: string;
  bgPattern: string;
  sidebarTheme: string;
  uiTheme: UiThemeKey;
  setAccentColor: (c: string) => void;
  setBgPattern: (p: string) => void;
  setSidebarTheme: (t: string) => void;
  setUiTheme: (t: UiThemeKey) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  accentColor: "teal",
  bgPattern: "none",
  sidebarTheme: "light",
  uiTheme: DEFAULT_UI_THEME,
  setAccentColor: () => {},
  setBgPattern: () => {},
  setSidebarTheme: () => {},
  setUiTheme: () => {},
});

export function useAppearance() {
  return useContext(AppearanceContext);
}

export function AppearanceProvider({
  children,
  accentColor: initialAccent = "blue",
  bgPattern: initialPattern = "none",
  sidebarTheme: initialTheme = "light",
  uiTheme: initialUiTheme = DEFAULT_UI_THEME,
}: {
  children: React.ReactNode;
  accentColor?: string;
  bgPattern?: string;
  sidebarTheme?: string;
  uiTheme?: string;
}) {
  const [accentColor, setAccentColor]     = useState(initialAccent);
  const [bgPattern,   setBgPattern]       = useState(initialPattern);
  const [sidebarTheme, setSidebarTheme]   = useState(initialTheme);
  const { setTheme: setNextTheme } = useNextTheme();
  const [uiTheme, setUiTheme] = useState<UiThemeKey>(
    isUiTheme(initialUiTheme) ? initialUiTheme : DEFAULT_UI_THEME,
  );

  // Sync state when the active business changes (router.refresh re-renders
  // this provider with the new business's saved appearance, but useState
  // ignores prop changes after mount — without this sync, switching
  // businesses left the previous biz's theme in place until a hard reload.
  useEffect(() => { setAccentColor(initialAccent);  }, [initialAccent]);
  useEffect(() => { setBgPattern(initialPattern);   }, [initialPattern]);
  useEffect(() => { setSidebarTheme(initialTheme);  }, [initialTheme]);
  useEffect(() => {
    if (isUiTheme(initialUiTheme)) setUiTheme(initialUiTheme);
  }, [initialUiTheme]);

  // accent / pattern / sidebarTheme are no longer written to the document:
  // their CSS was removed because it outranked the theme and overrode it. The
  // state stays so the values survive round-trips, but nothing styles from it.
  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    // `dark:` variants key off the .dark class, which next-themes was driving
    // from the OS. With light/dark now a property of the theme, that meant
    // choosing Daylight on a dark laptop fired 343 dark-mode styles inside a
    // light theme - the "conflicting text colour" this fixes. The theme is the
    // authority; setTheme keeps next-themes in agreement rather than fighting it.
    setNextTheme(UI_THEMES.find((t) => t.key === uiTheme)?.dark ? "dark" : "light");
    // Mirrored so the boot script can paint the right theme before first
    // render. Without it, a dark-theme business gets a white flash on every
    // cold load, which is exactly what the theme is meant to avoid.
    try { localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme); } catch { /* private mode */ }
  }, [uiTheme, setNextTheme]);

  return (
    <AppearanceContext.Provider value={{ accentColor, bgPattern, sidebarTheme, uiTheme, setAccentColor, setBgPattern, setSidebarTheme, setUiTheme }}>
      {children}
    </AppearanceContext.Provider>
  );
}
