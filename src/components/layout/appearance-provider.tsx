"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const ACCENT_PRESETS = [
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
  {
    key: "light",
    label: "Light",
    dark: false,
    sidebarBg: "#ffffff",
    sidebarFg: "#0f172a",
    sidebarAccent: "#f1f5f9",
    dot: "#2563eb",
  },
  {
    key: "soft",
    label: "Soft",
    dark: false,
    sidebarBg: "#f0f4f8",
    sidebarFg: "#1e293b",
    sidebarAccent: "#e2e8f0",
    dot: "#7c3aed",
  },
] as const;

interface AppearanceContextValue {
  accentColor: string;
  bgPattern: string;
  sidebarTheme: string;
  setAccentColor: (c: string) => void;
  setBgPattern: (p: string) => void;
  setSidebarTheme: (t: string) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  accentColor: "blue",
  bgPattern: "none",
  sidebarTheme: "dark-navy",
  setAccentColor: () => {},
  setBgPattern: () => {},
  setSidebarTheme: () => {},
});

export function useAppearance() {
  return useContext(AppearanceContext);
}

export function AppearanceProvider({
  children,
  accentColor: initialAccent = "blue",
  bgPattern: initialPattern = "none",
  sidebarTheme: initialTheme = "dark-navy",
}: {
  children: React.ReactNode;
  accentColor?: string;
  bgPattern?: string;
  sidebarTheme?: string;
}) {
  const [accentColor, setAccentColor] = useState(initialAccent);
  const [bgPattern, setBgPattern] = useState(initialPattern);
  const [sidebarTheme, setSidebarTheme] = useState(initialTheme);

  useEffect(() => { document.documentElement.dataset.accent = accentColor; }, [accentColor]);
  useEffect(() => { document.documentElement.dataset.pattern = bgPattern; }, [bgPattern]);
  useEffect(() => { document.documentElement.dataset.sidebarTheme = sidebarTheme; }, [sidebarTheme]);

  // Hydration catch — apply all on first mount
  useEffect(() => {
    document.documentElement.dataset.accent = initialAccent;
    document.documentElement.dataset.pattern = initialPattern;
    document.documentElement.dataset.sidebarTheme = initialTheme;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppearanceContext.Provider value={{ accentColor, bgPattern, sidebarTheme, setAccentColor, setBgPattern, setSidebarTheme }}>
      {children}
    </AppearanceContext.Provider>
  );
}
