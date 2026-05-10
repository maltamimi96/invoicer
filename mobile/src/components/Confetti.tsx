import React, { useEffect } from "react";
import { Dimensions, View, ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";

const COLORS = ["#10b981", "#3a847e", "#a78bfa", "#fbbf24", "#fb7185", "#60a5fa", "#fb923c"];
const COUNT  = 64;

interface Props {
  /** Bumping this number re-runs the confetti — use a counter from the parent. */
  fireKey?: number;
  /** ms before the whole burst starts. */
  delay?:    number;
}

/** Cheap one-shot confetti burst. Renders a fixed pool of particles that
 *  shoot from the top centre outward and fall under gravity. Each particle
 *  picks random colour, angle, distance, and rotation up-front. Driven by
 *  Reanimated on the UI thread — no JS-thread frames. */
export function Confetti({ fireKey = 0, delay = 0 }: Props) {
  return (
    <View pointerEvents="none" style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      overflow: "hidden",
    }}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <Particle key={`${fireKey}-${i}`} index={i} fireKey={fireKey} delay={delay} />
      ))}
    </View>
  );
}

function Particle({ index, fireKey, delay }: { index: number; fireKey: number; delay: number }) {
  const { width, height } = Dimensions.get("window");
  // Stable per-particle params; recalc when fireKey changes
  const params = React.useMemo(() => {
    const angle    = (Math.random() * Math.PI) - Math.PI / 2;          // -90° to +90°
    const distance = 140 + Math.random() * 220;
    const color    = COLORS[index % COLORS.length];
    const size     = 6 + Math.random() * 6;
    const startX   = width / 2 + (Math.random() - 0.5) * 60;
    const fallExtra = 200 + Math.random() * 280;
    const dx       = Math.cos(angle) * distance;
    const dy       = Math.sin(angle) * distance - 80; // bias upward at first
    const rot      = (Math.random() - 0.5) * 720;
    const stagger  = Math.random() * 180;
    return { color, size, startX, dx, dy, fallExtra, rot, stagger };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);

  const t        = useSharedValue(0);
  const fallT    = useSharedValue(0);
  const opacity  = useSharedValue(0);

  useEffect(() => {
    t.value       = 0;
    fallT.value   = 0;
    opacity.value = 0;
    const total = delay + params.stagger;
    opacity.value = withDelay(total, withTiming(1, { duration: 80 }));
    t.value       = withDelay(total, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    fallT.value   = withDelay(total + 400, withTiming(1, { duration: 1200, easing: Easing.in(Easing.cubic) }));
  }, [fireKey, delay, t, fallT, opacity, params.stagger]);

  const style = useAnimatedStyle(() => {
    const x  = params.startX + params.dx * t.value;
    const y  = -10 + params.dy * t.value + params.fallExtra * fallT.value;
    const rotation = params.rot * (t.value + fallT.value * 0.6);
    const fadeOut  = 1 - Math.max(0, fallT.value - 0.7) / 0.3;
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: params.size,
      height: params.size * 1.6,
      borderRadius: 1,
      backgroundColor: params.color,
      opacity: opacity.value * fadeOut,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rotation}deg` },
      ],
    } as ViewStyle;
  });

  return <Animated.View style={style} />;
}
