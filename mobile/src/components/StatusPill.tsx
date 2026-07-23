import React from "react";
import { Text, View, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, GradientName, radius, STATUS_PILL } from "@/lib/theme";
import { useThemeMode } from "@/lib/theme-provider";
import type { WorkOrderStatus } from "@/lib/types";

type Tone =
  // Invoice
  | "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled"
  // Quote
  | "accepted" | "rejected" | "expired"
  // Lead
  | "new" | "contacted" | "quoted" | "won" | "lost"
  // Job
  | "scheduled" | "in_progress" | "submitted" | "completed" | "assigned" | "reviewed";

/**
 * Tone table, as a FUNCTION of the resolved theme.
 *
 * This used to be a module-scope const with hardcoded foreground colours picked
 * for the LIGHT soft gradients — e.g. `scheduled: softBlue + #1d4ed8`. The
 * gradient itself is looked up by name at render time, so applyTheme() swapped
 * the background to dark (`softBlue` → `#0e234a`) while the text stayed a
 * medium blue. Dark navy under medium blue is unreadable, and it hit
 * `scheduled` / `assigned` / `submitted` — precisely the states a worker's jobs
 * live in, on a phone, outdoors, which is where dark mode actually gets used.
 *
 * The "solid" gradients (emerald/rose/amber/violet/blue) stay white-on-colour
 * in both themes; only the soft ones need to flip.
 */
function tones(dark: boolean): Record<Tone, { gradient: GradientName; fg: string }> {
  // Foreground for a soft (tinted) gradient: dark ink on the light tint,
  // near-white on the dark tint.
  const onSoftAmber = dark ? "#fde68a" : "#92400e";
  const onSoftBlue  = dark ? "#bfdbfe" : "#1d4ed8";
  const onSoftRose  = dark ? "#fecaca" : "#7f1d1d";

  return {
    // Invoice
    draft:       { gradient: "softAmber",  fg: onSoftAmber },
    sent:        { gradient: "softBlue",   fg: onSoftBlue },
    partial:     { gradient: "amber",      fg: "#fff" },
    paid:        { gradient: "emerald",    fg: "#fff" },
    overdue:     { gradient: "rose",       fg: "#fff" },
    cancelled:   { gradient: "softRose",   fg: onSoftRose },
    // Quote
    accepted:    { gradient: "emerald",    fg: "#fff" },
    rejected:    { gradient: "rose",       fg: "#fff" },
    expired:     { gradient: "softRose",   fg: onSoftRose },
    // Lead
    new:         { gradient: "blue",       fg: "#fff" },
    contacted:   { gradient: "amber",      fg: "#fff" },
    quoted:      { gradient: "violet",     fg: "#fff" },
    won:         { gradient: "emerald",    fg: "#fff" },
    lost:        { gradient: "softRose",   fg: onSoftRose },
    // Job
    scheduled:   { gradient: "softBlue",   fg: onSoftBlue },
    assigned:    { gradient: "softBlue",   fg: onSoftBlue },
    in_progress: { gradient: "amber",      fg: "#fff" },
    submitted:   { gradient: "violet",     fg: "#fff" },
    reviewed:    { gradient: "softAmber",  fg: onSoftAmber },
    completed:   { gradient: "emerald",    fg: "#fff" },
  };
}

interface Props {
  /** Preferred prop — accepts any tone string. */
  tone?:   string;
  /** Legacy prop — kept for back-compat with existing job screens. */
  status?: WorkOrderStatus;
  label?:  string;
  size?:   "sm" | "md";
  style?:  StyleProp<ViewStyle>;
}

/** Gradient status pill — single component for invoices, quotes, leads, jobs.
 *  Falls back to a soft-teal pill for unknown tones so a typo can't crash UI. */
export function StatusPill({ tone, status, label, size = "sm", style }: Props) {
  const { resolved } = useThemeMode();
  const dark = resolved === "dark";
  const key  = (tone ?? status ?? "draft");
  // Fallback also has to flip: softTeal goes to #143536 in dark, and #1f4f4a
  // on top of that is the same unreadable-on-unreadable problem.
  const cfg  = tones(dark)[key as Tone]
    ?? { gradient: "softTeal" as const, fg: dark ? "#d6e9e7" : "#1f4f4a" };
  const fallback = STATUS_PILL[key];
  const text = (label ?? fallback?.label ?? key).toUpperCase();
  const padX  = size === "sm" ? 8 : 12;
  const padY  = size === "sm" ? 3 : 5;
  const fSize = size === "sm" ? 10 : 11;

  return (
    <View style={[{ borderRadius: radius.pill, overflow: "hidden", alignSelf: "flex-start" }, style]}>
      <LinearGradient
        colors={gradients[cfg.gradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: padX, paddingVertical: padY }}
      >
        <Text style={{ fontSize: fSize, fontWeight: "800", color: cfg.fg, letterSpacing: 0.6 }}>{text}</Text>
      </LinearGradient>
    </View>
  );
}
