import React from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  fadeTo?:  number;
  children: React.ReactNode;
}

/** Drop-in Pressable replacement with a subtle press-scale + fade animation
 *  driven by Reanimated. Defaults are conservative — feels native, not
 *  toy-app bouncy. */
export function AnimatedPress({ style, scaleTo = 0.96, fadeTo = 0.85, children, onPressIn, onPressOut, ...rest }: Props) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.value   = withSpring(scaleTo,  { damping: 18, stiffness: 220 });
        opacity.value = withTiming(fadeTo,   { duration: 80 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value   = withSpring(1, { damping: 18, stiffness: 220 });
        opacity.value = withTiming(1, { duration: 120 });
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
