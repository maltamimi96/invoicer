import React, { useEffect, useState } from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { useSharedValue, useAnimatedReaction, withTiming, runOnJS, Easing } from "react-native-reanimated";

interface Props {
  value:    number;
  /** Format the displayed value, e.g. AUD currency. */
  format?:  (n: number) => string;
  duration?: number;
  style?:   StyleProp<TextStyle>;
}

/** Count-up animation on a number. Bumping `value` re-runs the timer.
 *  Uses Reanimated's shared value as the driver (UI thread) and bridges
 *  back to JS to call setState on each frame — simple, smooth enough for
 *  KPI numbers. */
export function AnimatedNumber({ value, format, duration = 800, style }: Props) {
  const t = useSharedValue(0);
  const [from, setFrom] = useState(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setFrom(display);
    t.value = 0;
    t.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useAnimatedReaction(
    () => t.value,
    (cur) => {
      const v = from + (value - from) * cur;
      runOnJS(setDisplay)(v);
    },
    [from, value]
  );

  return <Text style={style}>{format ? format(display) : Math.round(display).toLocaleString()}</Text>;
}
