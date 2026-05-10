import React from "react";
import { Text, View, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, GradientName, radius, STATUS_PILL } from "@/lib/theme";
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

const TONES: Record<Tone, { gradient: GradientName; fg: string }> = {
  // Invoice
  draft:       { gradient: "softAmber",  fg: "#92400e" },
  sent:        { gradient: "softBlue",   fg: "#1d4ed8" },
  partial:     { gradient: "amber",      fg: "#fff" },
  paid:        { gradient: "emerald",    fg: "#fff" },
  overdue:     { gradient: "rose",       fg: "#fff" },
  cancelled:   { gradient: "softRose",   fg: "#7f1d1d" },
  // Quote
  accepted:    { gradient: "emerald",    fg: "#fff" },
  rejected:    { gradient: "rose",       fg: "#fff" },
  expired:     { gradient: "softRose",   fg: "#7f1d1d" },
  // Lead
  new:         { gradient: "blue",       fg: "#fff" },
  contacted:   { gradient: "amber",      fg: "#fff" },
  quoted:      { gradient: "violet",     fg: "#fff" },
  won:         { gradient: "emerald",    fg: "#fff" },
  lost:        { gradient: "softRose",   fg: "#7f1d1d" },
  // Job
  scheduled:   { gradient: "softBlue",   fg: "#1d4ed8" },
  assigned:    { gradient: "softBlue",   fg: "#1d4ed8" },
  in_progress: { gradient: "amber",      fg: "#fff" },
  submitted:   { gradient: "violet",     fg: "#fff" },
  reviewed:    { gradient: "softAmber",  fg: "#92400e" },
  completed:   { gradient: "emerald",    fg: "#fff" },
};

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
  const key  = (tone ?? status ?? "draft");
  const cfg  = TONES[key as Tone] ?? { gradient: "softTeal" as const, fg: "#1f4f4a" };
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
