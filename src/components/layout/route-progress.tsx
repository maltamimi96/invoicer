"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top-of-page route progress bar — appears whenever the URL changes (push,
 * replace, refresh) and during any pending transition. No external deps;
 * the bar grows toward 90% over ~600ms then snaps to 100% when the new
 * route's RSCs settle in.
 *
 * Drop-in: render once inside the dashboard shell.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const params   = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible,  setVisible]  = useState(false);

  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setVisible(true);
    setProgress(8);

    // Climb toward 90% over ~600ms with an easing curve.
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - Math.pow(1 - t, 2);
      setProgress(8 + 82 * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Snap to 100% on the next frame; the new route is already painting.
    timer = setTimeout(() => {
      setProgress(100);
      setTimeout(() => setVisible(false), 180);
    }, 350);

    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [pathname, params]);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none"
      style={{ height: 2 }}
    >
      <div
        className="h-full bg-primary transition-[width,opacity] ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transitionDuration: visible ? "180ms" : "300ms",
          boxShadow: visible ? "0 0 6px hsl(var(--primary) / 0.5)" : undefined,
        }}
      />
    </div>
  );
}
