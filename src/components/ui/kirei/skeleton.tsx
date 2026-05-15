/**
 * Kirei skeleton — shimmer-style placeholders for first-load. Use
 * `SkeletonRow` for list pages and `SkeletonTile` for grids.
 *
 * Server-component-safe (CSS-only animation via Tailwind's `animate-pulse`).
 */

interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={`bg-muted/60 rounded-md animate-pulse ${className ?? ""}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/70">
      <Skeleton width={40} height={40} className="rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton height={12} width="60%" />
        <Skeleton height={10} width="40%" />
      </div>
      <Skeleton width={60} height={12} />
    </div>
  );
}

export function SkeletonTile() {
  return (
    <div className="rounded-xl p-4 border border-border bg-card space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton width={28} height={28} className="rounded-md" />
        <Skeleton height={10} width={80} />
      </div>
      <Skeleton height={22} width="50%" />
      <Skeleton height={10} width="40%" />
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}
