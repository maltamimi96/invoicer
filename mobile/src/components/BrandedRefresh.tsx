import React from "react";
import { RefreshControl, RefreshControlProps, Platform } from "react-native";
import { colors } from "@/lib/theme";

/** Native RefreshControl with our brand tints baked in. iOS uses tintColor
 *  for the spinner, Android uses colors[] for the rotating arc. */
export function BrandedRefresh(props: Omit<RefreshControlProps, "tintColor" | "colors" | "progressBackgroundColor">) {
  return (
    <RefreshControl
      {...props}
      tintColor={colors.primary}
      colors={Platform.OS === "android" ? [colors.primary, "#fb7185", "#fbbf24"] : undefined}
      progressBackgroundColor={Platform.OS === "android" ? colors.card : undefined}
    />
  );
}
