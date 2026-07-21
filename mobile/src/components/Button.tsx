import React from "react";
import { ActivityIndicator, Pressable, Text, View, ViewStyle, StyleProp } from "react-native";
import { colors, radius, space } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost";

/**
 * The standard CTA — a solid teal pill (delivery-app style), plus quieter
 * secondary/ghost variants. Reads live colours at render so it survives a
 * dark-mode swap. Use for detail-screen actions instead of ad-hoc inline
 * Pressables.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary" ? colors.primary
    : variant === "secondary" ? colors.card
    : "transparent";
  const fg = variant === "primary" ? "#ffffff" : colors.primary;
  const border =
    variant === "secondary" ? colors.hairline
    : variant === "ghost" ? "transparent"
    : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 15,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text style={{ fontSize: 15, fontWeight: "800", color: fg, letterSpacing: 0.2 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
