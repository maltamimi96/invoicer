import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyTheme } from "./theme";

export type ThemeMode = "system" | "light" | "dark";
type ResolvedMode = "light" | "dark";

interface Ctx {
  /** What the user picked. */
  mode:         ThemeMode;
  /** What's actually rendering after resolving "system". */
  resolved:     ResolvedMode;
  setMode:      (m: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<Ctx | null>(null);
const STORAGE_KEY  = "kirei.theme";

function resolve(mode: ThemeMode, system: ColorSchemeName): ResolvedMode {
  if (mode === "system") return system === "dark" ? "dark" : "light";
  return mode;
}

/** Provides theme state + mutates the global colors/gradients on change.
 *  Components that simply read `colors.x` at render time will pick up the
 *  new values when this provider's bumped state forces a re-render. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState]     = useState<ThemeMode>("system");
  const [system, setSystem]      = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [_revision, bump]        = useState(0); // forces re-render after applyTheme

  const resolved = resolve(mode, system);

  // Initial load — read persisted preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setModeState(v);
      }
    });
  }, []);

  // Listen for OS theme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener((p) => setSystem(p.colorScheme));
    return () => sub.remove();
  }, []);

  // Apply on every resolved change
  useEffect(() => {
    applyTheme(resolved);
    bump((n) => n + 1);
  }, [resolved]);

  const setMode = useCallback(async (m: ThemeMode) => {
    setModeState(m);
    await AsyncStorage.setItem(STORAGE_KEY, m);
  }, []);

  const value = useMemo<Ctx>(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be inside ThemeProvider");
  return ctx;
}
