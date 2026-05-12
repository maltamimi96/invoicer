import { useWindowDimensions } from "react-native";

/** Tablet threshold matches Apple/Google's convention — anything ≥ 768px in
 *  the smallest dimension is treated as a tablet-class device. Both iPad
 *  mini and entry-level Android tablets cross this line. */
const TABLET_MIN_DIMENSION = 768;

/** Max content width on tablets and landscape phones — keeps long lines of
 *  text readable instead of stretching edge-to-edge. */
export const CONTENT_MAX_WIDTH = 820;

export interface Responsive {
  width:        number;
  height:       number;
  isLandscape:  boolean;
  /** True when the device is iPad-sized or bigger in either dimension. */
  isTablet:     boolean;
  /** True when we have enough horizontal room for a side-by-side layout —
   *  either tablet, or a phone in landscape. */
  isWide:       boolean;
  /** Columns to use for KPI/grid layouts. */
  gridColumns:  2 | 3 | 4;
  /** flexBasis percentage to pair with `gridColumns` and `flexWrap: "wrap"`. */
  gridBasis:    `${number}%`;
  /** Common container style: caps width on wide screens, centres horizontally. */
  containerStyle: { maxWidth: number; width: "100%"; alignSelf: "center" };
}

/** Hook returning current window dimensions and derived layout hints.
 *  Re-runs on rotation and split-screen resize because useWindowDimensions
 *  is built on RN's Appearance/Dimensions listeners. */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const smallest    = Math.min(width, height);
  const isTablet    = smallest >= TABLET_MIN_DIMENSION;
  const isWide      = isTablet || isLandscape;

  // Grid sizing — 4 columns on tablet, 3 on landscape phone, 2 elsewhere.
  // flexBasis values include small gaps so the columns wrap cleanly.
  let gridColumns: 2 | 3 | 4 = 2;
  let gridBasis: `${number}%` = "48%";
  if (isTablet)             { gridColumns = 4; gridBasis = "23%"; }
  else if (isLandscape)     { gridColumns = 3; gridBasis = "31%"; }

  return {
    width, height, isLandscape, isTablet, isWide,
    gridColumns, gridBasis,
    containerStyle: { maxWidth: CONTENT_MAX_WIDTH, width: "100%", alignSelf: "center" },
  };
}
