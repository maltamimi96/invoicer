"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  format?: "currency" | "number";
  currency?: string;
}

export function AnimatedCounter({ value, format = "number", currency = "GBP" }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const startValueRef = useRef(0);
  const duration = 800;

  useEffect(() => {
    startValueRef.current = displayValue;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValueRef.current + (value - startValueRef.current) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (format === "currency") return <>{formatCurrency(displayValue, currency)}</>;
  return <>{Math.round(displayValue).toLocaleString()}</>;
}
