"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = ["#10b981", "#3a847e", "#a78bfa", "#fbbf24", "#fb7185", "#60a5fa", "#fb923c"];
const COUNT  = 64;

/**
 * One-shot confetti burst — ported from mobile's `Confetti.tsx`.
 * Pass an incrementing `fireKey` to retrigger. Renders a viewport-pinned
 * pool of particles that shoot outward from the top-centre and fall
 * under gravity. Auto-unmounts the particles after the animation so
 * it doesn't keep ghost DOM nodes around.
 */
interface Props {
  /** Bump this number to fire a new burst. */
  fireKey?: number;
  /** Optional delay before firing, ms. */
  delay?: number;
}

export function Confetti({ fireKey = 0, delay = 0 }: Props) {
  const [active, setActive] = useState(false);
  const [round, setRound]   = useState(0);

  useEffect(() => {
    if (fireKey === 0) return;
    const start = setTimeout(() => { setRound((r) => r + 1); setActive(true); }, delay);
    const end   = setTimeout(() => setActive(false), delay + 2200);
    return () => { clearTimeout(start); clearTimeout(end); };
  }, [fireKey, delay]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {active && (
          <div key={round}>
            {Array.from({ length: COUNT }).map((_, i) => (
              <Particle key={i} index={i} />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Particle({ index }: { index: number }) {
  const params = useMemo(() => {
    const angle    = (Math.random() * Math.PI) - Math.PI / 2;
    const distance = 180 + Math.random() * 260;
    const color    = COLORS[index % COLORS.length];
    const size     = 8 + Math.random() * 6;
    const dx       = Math.cos(angle) * distance;
    const dy       = Math.sin(angle) * distance - 80;
    const fallExtra = 240 + Math.random() * 320;
    const rot      = (Math.random() - 0.5) * 720;
    const stagger  = Math.random() * 180;
    const offsetX  = (Math.random() - 0.5) * 80;
    return { color, size, dx, dy, fallExtra, rot, stagger, offsetX };
  }, [index]);

  return (
    <motion.span
      initial={{ opacity: 0, x: params.offsetX, y: -20, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [params.offsetX, params.offsetX + params.dx, params.offsetX + params.dx],
        y: [-20, params.dy, params.dy + params.fallExtra],
        rotate: [0, params.rot * 0.4, params.rot],
      }}
      transition={{
        delay: params.stagger / 1000,
        duration: 1.8,
        times: [0, 0.08, 0.4, 1],
        ease: "easeOut",
      }}
      style={{
        position: "absolute",
        top: 0,
        left: "50%",
        width: params.size,
        height: params.size * 1.6,
        borderRadius: 1,
        backgroundColor: params.color,
      }}
    />
  );
}
