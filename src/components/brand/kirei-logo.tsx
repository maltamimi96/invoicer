/**
 * Kirei brand marks.
 *
 * These are inline SVGs rather than <Image> so the lettering can inherit
 * `currentColor` — the same lockup then works on the teal top bar, on a white
 * sheet, and in dark mode without shipping a separate file per background.
 *
 * The vermilion counter-square is the one part that never takes currentColor:
 * it's the brand accent. It defaults to the light-background vermilion and
 * lifts to the reverse vermilion in dark mode; pass `accentClassName` to pin it
 * (the top bar is dark in both themes, so it pins the lighter one).
 *
 * Source of truth for the paths: public/brand/kirei-logo.svg + kirei-mark.svg.
 */

const ACCENT = "fill-[#DB3E21] dark:fill-[#F05A42]";

/** The K glyph — the lockup's leading mark, minus the wordmark. */
const MARK_PATH =
  "M298 418L375 340H429L352 418ZM316 450H358L435 529H379L316 467Z";

/** Mark + "kirei HQ" wordmark. */
const LOCKUP_PATH =
  "M298 418L375 340H429L352 418ZM316 450H358L435 529H379L316 467ZM557 341H583V517L557 529ZM589 430L673 341H706L621 431L706 529H671ZM763.5 339.5C771.8 339.5 778.5 346 778.5 354S771.8 368.5 763.5 368.5S748.5 362 748.5 354S755.2 339.5 763.5 339.5ZM752 388H776V518L753 529ZM823 388H847L848 407C858 396 869 389 882 387C889 387 896 388 902 390L891 412C876 412 865 416 857 425C851 432 848 441 848 452V517L826 528H823ZM1063 465H949C951 457 955 449 962 444H1037C1033 432 1027 423 1018 417C1009 411 998 408 987 409C971 411 959 420 951 433C945 444 943 456 946 468C949 486 960 498 974 504C993 513 1015 507 1035 493H1055C1049 505 1039 516 1024 523C1009 530 992 532 975 528C950 523 932 509 923 486C912 457 920 429 940 407C954 391 974 384 995 386C1024 388 1047 404 1058 430C1062 440 1064 452 1063 465ZM1121.5 339.5C1129.8 339.5 1136.5 346 1136.5 354S1129.8 368.5 1121.5 368.5S1106.5 362 1106.5 354S1113.2 339.5 1121.5 339.5ZM1109 388H1134V518L1111 529L1109 520ZM1198 359H1226V429H1316V359H1344V525H1316V454H1226V525H1198ZM1409 360H1513C1529 360 1541 373 1541 389V495C1541 503 1538 510 1532 516L1554 539H1518L1503 524H1409C1392 524 1380 512 1380 496V388C1380 372 1393 360 1409 360ZM1419 385C1413 385 1409 389 1409 395V487C1409 493 1413 497 1419 497H1477L1460 480L1483 468L1510 495C1512 493 1513 490 1513 487V397C1513 389 1508 385 1501 385Z";

/** The counter-square, shared by both marks. */
const SQUARE_PATH = "M246 412H290V456H246Z";

interface BrandProps {
  /** Size it with height + `w-auto`; colour it with a text-* class. */
  className?: string;
  /** Override the accent fill (e.g. pin the reverse vermilion on a dark bar). */
  accentClassName?: string;
  /** Decorative when the name is already in adjacent text. */
  "aria-hidden"?: boolean;
}

/** Full horizontal lockup — mark + wordmark. Aspect ratio ≈ 4.93 : 1. */
export function KireiWordmark({ className, accentClassName, ...rest }: BrandProps) {
  return (
    <svg
      viewBox="220 300 1380 280"
      className={className}
      role={rest["aria-hidden"] ? undefined : "img"}
      aria-label={rest["aria-hidden"] ? undefined : "Kirei"}
      aria-hidden={rest["aria-hidden"]}
      focusable="false"
    >
      <path d={LOCKUP_PATH} fill="currentColor" fillRule="evenodd" />
      <path d={SQUARE_PATH} className={accentClassName ?? ACCENT} fillRule="evenodd" />
    </svg>
  );
}

/** Square mark on its own — for tight spots (mobile bar, spinners, avatars). */
export function KireiMark({ className, accentClassName, ...rest }: BrandProps) {
  return (
    <svg
      viewBox="225 319 230 230"
      className={className}
      role={rest["aria-hidden"] ? undefined : "img"}
      aria-label={rest["aria-hidden"] ? undefined : "Kirei"}
      aria-hidden={rest["aria-hidden"]}
      focusable="false"
    >
      <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      <path d={SQUARE_PATH} className={accentClassName ?? ACCENT} fillRule="evenodd" />
    </svg>
  );
}
