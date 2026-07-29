"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { formatCurrency } from "@/lib/utils";

/**
 * A currency value that counts up/down to its new amount when it changes —
 * used on the MYOB totals stack so the Total visibly reacts to edits.
 */
export function MyobAmount({ value, currency, className }: { value: number; currency?: string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => formatCurrency(v, currency));

  React.useEffect(() => {
    const controls = animate(mv, value, { duration: 0.4, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
