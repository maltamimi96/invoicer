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
  /** Columns for the Sales/Operations card grid. Deterministic by width so
   *  the layout never collapses on portrait phones:
   *    < 600px  → 1 (phone portrait)
   *    600–900  → 2 (phone landscape, tablet portrait)
   *    ≥ 900px  → 3 (tablet landscape) */
  sectionColumns: 1 | 2 | 3;
  /** flexBasis paired with sectionColumns + `flexWrap: "wrap"`. Includes a
   *  small gap allowance so cards wrap cleanly. */
  sectionBasis:   `${number}%`;
  /** Common container style: caps width on tablets / landscape, centres
   *  horizontally. On phone portrait this is a no-op (width is already
   *  below CONTENT_MAX_WIDTH). */
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

  // KPI grid — 4 cols on tablet, 3 on landscape phone, 2 elsewhere.
  let gridColumns: 2 | 3 | 4 = 2;
  let gridBasis: `${number}%` = "48%";
  if (isTablet)             { gridColumns = 4; gridBasis = "23%"; }
  else if (isLandscape)     { gridColumns = 3; gridBasis = "31%"; }

  // Section card grid — derived from width directly so portrait phones
  // never end up in the "wide" two-column path.
  let sectionColumns: 1 | 2 | 3 = 1;
  let sectionBasis: `${number}%` = "100%";
  if (width >= 900)        { sectionColumns = 3; sectionBasis = "31%"; }
  else if (width >= 600)   { sectionColumns = 2; sectionBasis = "48%"; }

  return {
    width, height, isLandscape, isTablet, isWide,
    gridColumns, gridBasis,
    sectionColumns, sectionBasis,
    containerStyle: { maxWidth: CONTENT_MAX_WIDTH, width: "100%", alignSelf: "center" },
  };
}
