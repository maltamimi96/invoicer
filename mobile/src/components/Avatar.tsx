import React from "react";
import { Text, View, Image, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, GradientName, radius } from "@/lib/theme";

const POOL: GradientName[] = [
  "primary", "primaryLit", "emerald", "violet", "blue", "rose",
  "amber", "coral", "ocean", "sunrise", "dusk",
];

/** Stable hash → index. Same name always picks the same gradient. */
function hashIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % POOL.length;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  name:        string;
  imageUrl?:   string | null;
  size?:       number;
  /** Override the auto-derived gradient. */
  gradient?:   GradientName;
  /** Subtle ring around the avatar. */
  ring?:       boolean;
  style?:      StyleProp<ViewStyle>;
}

/** Initials avatar with a deterministic gradient picked from a curated pool.
 *  Same name → same gradient on every screen. Falls through to <Image> if
 *  imageUrl is provided. */
export function Avatar({ name, imageUrl, size = 44, gradient, ring = false, style }: Props) {
  const palette = gradients[gradient ?? POOL[hashIndex(name)]];
  const fontSize = Math.round(size * 0.4);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[
          { width: size, height: size, borderRadius: size / 2 } as ImageStyle,
          ring ? { borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" } as ImageStyle : null,
          style as StyleProp<ImageStyle>,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: "hidden" },
        ring && { borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" },
        style,
      ]}
    >
      <LinearGradient
        colors={palette as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "#fff", fontWeight: "800", fontSize, letterSpacing: 0.4 }}>
          {initialsOf(name)}
        </Text>
      </LinearGradient>
    </View>
  );
}

void radius; // suppress unused-import warning if tree-shaken
