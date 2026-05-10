import React, { useEffect } from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors, radius } from "@/lib/theme";

interface Props {
  width?:        number | string;
  height?:       number;
  borderRadius?: number;
  style?:        StyleProp<ViewStyle>;
}

/** Animated shimmer placeholder. Use in place of ActivityIndicator on lists
 *  and detail screens — feels less "loading wheel," more "almost ready". */
export function Skeleton({ width = "100%", height = 14, borderRadius: br = radius.sm, style }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [t]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + t.value * 0.45,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number, height, borderRadius: br,
          backgroundColor: colors.surface2,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Quick row preset — title + subtitle + optional trailing chip. */
export function SkeletonRow({ avatar = false }: { avatar?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
      {avatar && <Skeleton width={36} height={36} borderRadius={18} />}
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={11} />
      </View>
      <Skeleton width={50} height={18} borderRadius={9} />
    </View>
  );
}

export function SkeletonCard({ height = 88 }: { height?: number }) {
  return <Skeleton width="100%" height={height} borderRadius={radius.lg} />;
}
