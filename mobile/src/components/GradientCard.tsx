import React from "react";
import { Pressable, View, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { gradients, GradientName, radius } from "@/lib/theme";

interface Props {
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

/** Card with a gradient background and an optional press-scale animation.
 *  Wraps the children in a transparent inner view so callers can lay out
 *  with normal padding/gap props. */
export function GradientCard({
  gradient = "primary",
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

  const palette = colors ?? gradients[gradient];

  const inner = (
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
