import React from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, GradientName, radius, space } from "@/lib/theme";
import { FadeIn } from "./FadeIn";
import { PatternBackground } from "./PatternBackground";

interface Props {
  icon:        React.ReactNode;
  title:       string;
  subtitle?:   string;
  ctaLabel?:   string;
  onPressCta?: () => void;
  /** Gradient behind the icon halo. Defaults to primary. */
  gradient?:   GradientName;
}

/** Branded empty state — gradient halo around the icon, fade-in on mount,
 *  optional primary CTA pill. Drop-in for FlatList ListEmptyComponent or
 *  inline conditional renders. */
export function EmptyState({ icon, title, subtitle, ctaLabel, onPressCta, gradient = "primary" }: Props) {
  return (
    <FadeIn>
      <View style={{ alignItems: "center", padding: space.xl, gap: 10 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <LinearGradient
            colors={gradients[gradient] as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
          >
            <PatternBackground variant="dots" color="#fff" opacity={0.18} />
            {icon}
          </LinearGradient>
        </View>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3, marginTop: 4 }}>{title}</Text>
        {subtitle && (
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", maxWidth: 280, lineHeight: 19 }}>
            {subtitle}
          </Text>
        )}
        {ctaLabel && onPressCta && (
          <Pressable onPress={onPressCta} style={{ marginTop: space.md, borderRadius: radius.pill, overflow: "hidden" }}>
            <LinearGradient
              colors={gradients.primaryLit as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ paddingHorizontal: space.lg, paddingVertical: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 }}>{ctaLabel}</Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </FadeIn>
  );
}
