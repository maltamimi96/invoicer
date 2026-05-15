"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

/**
 * Web equivalent of the mobile `AnimatedPress` — wraps children in a
 * motion.button/motion.a-equivalent that scales down + fades slightly
 * while pressed. Use for any tap target: hub tiles, cards-as-links,
 * action buttons in the new Kirei surfaces.
 */
type Props = HTMLMotionProps<"div"> & {
  scaleTo?: number;
  fadeTo?: number;
};

export const AnimatedPress = forwardRef<HTMLDivElement, Props>(function AnimatedPress(
  { scaleTo = 0.97, fadeTo = 0.9, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      whileTap={{ scale: scaleTo, opacity: fadeTo }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", damping: 18, stiffness: 240 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});
