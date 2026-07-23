import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Provides theme state and swaps the global `colors`/`gradients` on change.
 *
 * `applyTheme` MUTATES those singletons in place, so components that read
 * `colors.x` at render only see new values if they re-render with the mutation
 * already applied. Two things make that reliable:
 *
 *  1. We apply the palette *synchronously during render* (below), not in an
 *     effect. Effects run after paint, so a child rendered in the same pass
 *     would read the OLD colours and paint stale, then never update — which is
 *     exactly the "toggle does nothing, screen stays dark" bug. Applying in
 *     render guarantees children on this pass read the new palette.
 *  2. `_layout.tsx` keys the navigator on `resolved`, so the screen tree
 *     remounts on a theme change and every screen re-reads the palette. Without
 *     that, expo-router keeps inactive screens mounted and they never refresh.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState]     = useState<ThemeMode>("system");
  const [system, setSystem]      = useState<ColorSchemeName>(Appearance.getColorScheme());

  const resolved = resolve(mode, system);

  // Apply during render, once per distinct resolved value. The ref guard keeps
  // this idempotent across React's repeated render calls.
  const appliedRef = useRef<ResolvedMode | null>(null);
  if (appliedRef.current !== resolved) {
    applyTheme(resolved);
    appliedRef.current = resolved;
  }

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
