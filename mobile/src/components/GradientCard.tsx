import React from "react";
import { Pressable, View, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors as theme, cardShadow, gradients, GradientName, radius } from "@/lib/theme";

interface Props {
  /** Omit for a clean flat white card (the default in the white+teal system).
   *  Pass a gradient name only for the few surfaces that genuinely want one. */
  gradient?: GradientName;
  /** Manual override — beats `gradient` if provided. */
  colors?: readonly [string, string];
  start?:   { x: number; y: number };
  end?:     { x: number; y: number };
  style?:   StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  borderRadius?: number;
  children: React.ReactNode;
}

/** Card with an optional press-scale animation. Flat white by default (card +
 *  hairline + soft shadow); renders a gradient only when `gradient`/`colors`
 *  is supplied. Wraps children in an inner view so callers lay out normally. */
export function GradientCard({
  gradient,
  colors,
  start = { x: 0, y: 0 },
  end   = { x: 1, y: 1 },
  style,
  contentStyle,
  onPress,
  borderRadius = radius.xl,
  children,
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette = colors ?? (gradient ? gradients[gradient] : null);

  const inner = palette ? (
    <LinearGradient
      colors={palette as unknown as readonly [string, string, ...string[]]}
      start={start}
      end={end}
      style={[
        { borderRadius, overflow: "hidden" },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </LinearGradient>
  ) : (
    <View
      style={[
        {
          borderRadius, overflow: "hidden",
          backgroundColor: theme.card,
          borderWidth: 1, borderColor: theme.hairline,
          ...cardShadow(1),
        },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );

  if (!onPress) return inner;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 18, stiffness: 220 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 220 }); }}
      style={animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
