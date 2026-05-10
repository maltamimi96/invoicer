import React from "react";
import Svg, { Defs, Pattern, Circle, Path, Rect } from "react-native-svg";

interface Props {
  variant?: "dots" | "grid" | "diagonal";
  color?:   string;
  opacity?: number;
}

/** Subtle full-screen SVG pattern overlay. Place absolute over a tinted
 *  surface for a touch of texture — keeps the UI from feeling flat without
 *  shouting. Defaults are very subtle (5% opacity). */
export function PatternBackground({ variant = "dots", color = "#000", opacity = 0.04 }: Props) {
  const id = `pat-${variant}`;

  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <Pattern id={id} x="0" y="0" width={variant === "grid" ? 24 : 18} height={variant === "grid" ? 24 : 18} patternUnits="userSpaceOnUse">
          {variant === "dots" && (
            <Circle cx="2" cy="2" r="1" fill={color} fillOpacity={opacity} />
          )}
          {variant === "grid" && (
            <>
              <Path d="M 24 0 L 0 0 0 24" stroke={color} strokeWidth="0.5" strokeOpacity={opacity} fill="none" />
            </>
          )}
          {variant === "diagonal" && (
            <Path d="M 0 18 L 18 0 M -1 1 L 1 -1 M 17 19 L 19 17" stroke={color} strokeWidth="0.6" strokeOpacity={opacity} fill="none" />
          )}
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
