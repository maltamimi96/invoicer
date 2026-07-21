import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, cardShadow, radius, space } from "@/lib/theme";
import { AnimatedNumber } from "./AnimatedNumber";
import { Skeleton } from "./Skeleton";

/**
 * A clean white stat tile: a small tinted icon chip, an uppercase label, and a
 * big bold value. Replaces the old muddy gradient stat cards. Styles read the
 * live palette at render, so it survives a dark-mode swap (the frozen-const
 * trap documented in CLAUDE.md).
 */
export function StatTile({
  icon,
  label,
  value,
  format,
  loading,
  tint,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  /** Numeric value → animated count-up. Omit and pass `text` for non-numerics. */
  value?: number;
  format?: (n: number) => string;
  loading?: boolean;
  /** Icon-chip tint. Defaults to teal. */
  tint?: string;
  onPress?: () => void;
}) {
  const chipTint = tint ?? colors.primary;

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 30, height: 30, borderRadius: 9,
            backgroundColor: chipTint + "1f", // ~12% alpha
            alignItems: "center", justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, flex: 1 }}
        >
          {label}
        </Text>
      </View>
      {loading ? (
        <Skeleton width="60%" height={24} style={{ marginTop: 10 }} />
      ) : (
        <AnimatedNumber
          value={value ?? 0}
          format={format}
          style={{ fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.6, marginTop: 8 }}
        />
      )}
    </>
  );

  const cardStyle = {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    minHeight: 96,
    ...cardShadow(1),
  } as const;

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.9 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}
