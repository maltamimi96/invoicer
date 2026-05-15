"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/**
 * Mobile's FadeIn stagger primitive ported to web. Use to stagger card
 * mounts: pass `delay` in ms (e.g. `baseDelay + idx * 50`).
 */
type Props = HTMLMotionProps<"div"> & {
  /** Delay in milliseconds before the fade starts. */
  delay?: number;
  /** Slide-up distance in px. */
  distance?: number;
};

export function FadeIn({ delay = 0, distance = 12, children, style, ...rest }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: delay / 1000, ease: "easeOut" }}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
