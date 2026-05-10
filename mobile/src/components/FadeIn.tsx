import React, { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withDelay } from "react-native-reanimated";
import { ViewStyle, StyleProp } from "react-native";

interface Props {
  /** ms before this child animates in (great for staggering lists). */
  delay?:    number;
  /** Tween duration in ms. */
  duration?: number;
  /** Distance in px the child slides up from. */
  distance?: number;
  style?:    StyleProp<ViewStyle>;
  children:  React.ReactNode;
}

/** Lightweight fade-in + slide-up wrapper. Use to animate cards as they
 *  mount. Honours the platform's reduced-motion preference automatically
 *  via Reanimated's accessibility integration. */
export function FadeIn({ delay = 0, duration = 320, distance = 12, style, children }: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);

  useEffect(() => {
    opacity.value    = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration }));
  }, [delay, duration, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
